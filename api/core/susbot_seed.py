"""
Seed sintético determinístico do SusBot.

Gera estoque e alertas por município para a demo permanecer estável entre
execuções. O seed é idempotente por `ibge6`.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone

from api.core import db


_BASE_DATA = datetime(2026, 7, 14, 9, 0, 0, tzinfo=timezone.utc)

_ESTOQUE_CATALOGO = [
    ("Dipirona 500mg", "cp", 120.0, 18.0),
    ("Soro fisiológico 1L", "fr", 340.0, 24.0),
    ("Insulina NPH", "fr", 60.0, 32.0),
    ("Amoxicilina 500mg", "cp", 95.0, 16.0),
    ("Paracetamol 750mg", "cp", 210.0, 28.0),
    ("Luva de procedimento M", "par", 800.0, 12.0),
    ("Ondansetrona 8mg", "amp", 25.0, 11.0),
    ("Repelente infantil", "un", 40.0, 9.0),
]

_SURTO_CIDADADE = [
    "dengue",
    "chikungunya",
    "influenza sazonal",
    "diarreia aguda",
]

_OCUPACAO_SITUACOES = [
    "UTI Adulto",
    "Enfermaria Clínica",
    "Pronto-Socorro Municipal",
]


def _seed_int(ibge6: str, salt: str) -> int:
    digest = hashlib.sha256(f"{str(ibge6)[:6]}:{salt}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _rng(ibge6: str, salt: str) -> random.Random:
    return random.Random(_seed_int(ibge6, salt))


def _ibge6(ibge6: str) -> str:
    return str(ibge6).strip()[:6]


def gerar_estoque_sintetico(ibge6: str) -> list[dict]:
    """Gera a lista de estoque sintético para um município."""

    ibge = _ibge6(ibge6)
    rng = _rng(ibge, "estoque")
    rows: list[dict] = []

    for idx, (item, unidade, consumo_base, dias_base) in enumerate(_ESTOQUE_CATALOGO):
        consumo = round(consumo_base * rng.uniform(0.82, 1.18), 1)
        dias = max(6, int(round(dias_base + rng.uniform(-6, 10))))
        quantidade = round((consumo * dias) / 7, 1)
        atualizado_em = (
            _BASE_DATA.replace(hour=9 + (idx % 4))
            .isoformat()
            .replace("+00:00", "Z")
        )

        rows.append({
            "ibge6": ibge,
            "item": item,
            "quantidade_atual": quantidade,
            "consumo_medio_dia": round(consumo / 7, 2),
            "atualizado_em": atualizado_em,
        })

    return rows


def gerar_alertas_sinteticos(ibge6: str) -> list[dict]:
    """Gera os 3 alertas sintéticos do MVP para um município."""

    ibge = _ibge6(ibge6)
    rng = _rng(ibge, "alertas")
    estoque = gerar_estoque_sintetico(ibge)
    estoque_critico = min(
        estoque,
        key=lambda row: row["quantidade_atual"] / max(row["consumo_medio_dia"], 0.01),
    )
    estoque_critico_dias = round(
        estoque_critico["quantidade_atual"] / max(estoque_critico["consumo_medio_dia"], 0.01),
        1,
    )

    surto = rng.choice(_SURTO_CIDADADE)
    ocupacao = rng.choice(_OCUPACAO_SITUACOES)

    return [
        {
            "id": f"susbot-{ibge}-surto",
            "ibge6": ibge,
            "tipo": "surto",
            "item_ou_condicao": surto,
            "severidade": "alta" if rng.random() > 0.35 else "media",
            "status": "novo",
            "descricao": f"Aumento consistente de notificações de {surto} no município.",
            "criado_em": _BASE_DATA.replace(hour=8, minute=15).isoformat().replace("+00:00", "Z"),
        },
        {
            "id": f"susbot-{ibge}-ruptura",
            "ibge6": ibge,
            "tipo": "ruptura",
            "item_ou_condicao": estoque_critico["item"],
            "severidade": "alta" if estoque_critico_dias < 20 else "media",
            "status": "novo",
            "descricao": (
                f"{estoque_critico['item']} tem cobertura estimada de {estoque_critico_dias} dias, "
                "abaixo do limiar operacional."
            ),
            "criado_em": _BASE_DATA.replace(hour=8, minute=45).isoformat().replace("+00:00", "Z"),
        },
        {
            "id": f"susbot-{ibge}-ocupacao",
            "ibge6": ibge,
            "tipo": "ocupacao",
            "item_ou_condicao": ocupacao,
            "severidade": "media" if rng.random() > 0.5 else "alta",
            "status": "novo",
            "descricao": f"{ocupacao} com projeção de pressão assistencial nas próximas semanas.",
            "criado_em": _BASE_DATA.replace(hour=9, minute=5).isoformat().replace("+00:00", "Z"),
        },
    ]


def seed_susbot_municipio(ibge6: str) -> dict:
    """Popula estoque e alertas sintéticos para um município, uma vez por base."""

    ibge = _ibge6(ibge6)
    estoque_rows = gerar_estoque_sintetico(ibge)
    alerta_rows = gerar_alertas_sinteticos(ibge)

    created_estoque = False
    created_alertas = False

    if not db.has_estoque(ibge):
        db.upsert_estoque(estoque_rows)
        created_estoque = True

    if not db.has_alertas(ibge):
        db.insert_alertas(alerta_rows)
        created_alertas = True

    return {
        "ibge6": ibge,
        "estoque_criado": created_estoque,
        "alertas_criados": created_alertas,
        "estoque_total": len(estoque_rows),
        "alertas_total": len(alerta_rows),
        "seeded": created_estoque or created_alertas,
    }
