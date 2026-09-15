"""Clara proativa: alerta crítico enviado ao Telegram/WhatsApp de quem pediu para receber.

Opt-in por conexão (`/alertas ligar` no canal), janela de silêncio e envio único por
alerta. Estado guardado em `canal_eventos` para não exigir migration no Supabase.
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from api.core import db
from api.core.permissoes import AcessoNegado, carregar_acesso, ferramentas_no_municipio

log = logging.getLogger("sus_predict.clara_proativa")

# ponytail: canal_eventos serve de registro chave-única; tabela própria se precisar de preferências por usuário.
PROVEDOR_OPTIN = "clara_alertas_optin"
PROVEDOR_ENVIADO = "clara_alertas_enviado"
MAX_ALERTAS_POR_RODADA = 3


def alertas_ativos(conexao_id: str) -> bool:
    return str(conexao_id) in db.listar_eventos_canal(PROVEDOR_OPTIN)


def definir_alertas(conexao_id: str, ativo: bool) -> None:
    if ativo:
        db.registrar_evento_canal(PROVEDOR_OPTIN, str(conexao_id))
    else:
        db.remover_evento_canal(PROVEDOR_OPTIN, str(conexao_id))


def em_silencio(agora: datetime | None = None) -> bool:
    """Janela `CLARA_ALERTAS_SILENCIO` no formato "inicio-fim" em horas de Brasília (padrão 22-7)."""

    try:
        inicio, fim = (int(parte) % 24 for parte in os.getenv("CLARA_ALERTAS_SILENCIO", "22-7").split("-"))
    except ValueError:
        inicio, fim = 22, 7
    hora = (agora or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/Sao_Paulo")).hour
    if inicio == fim:
        return False
    return inicio <= hora < fim if inicio < fim else hora >= inicio or hora < fim


def alertas_criticos(ibge6: str) -> tuple[str, list[dict]]:
    """Nome do município e alertas de severidade ALTA da mesma base da Visão Geral."""

    from api.core.operational_router import _municipio, _select

    municipio = _municipio(str(ibge6)[:6])
    linhas = _select("visao_geral_alertas_recentes", {"cod_ibge_completo": str(municipio.get("cod_ibge_completo") or "")},
                     order="ordem.asc", limit=24)
    return str(municipio.get("nome_municipio") or ibge6), [
        linha for linha in linhas if str(linha.get("severidade") or "").upper() == "ALTA"
    ]


def _chave(conexao_id: str, alerta: dict) -> str:
    campos = "|".join(str(alerta.get(c) or "") for c in ("competencia_referencia", "tipo_alerta", "titulo", "mensagem"))
    return f"{conexao_id}:{hashlib.sha256(campos.encode('utf-8')).hexdigest()[:32]}"


def _texto_alerta(municipio: str, alerta: dict) -> str:
    linhas = [f"🚨 **Alerta crítico em {municipio}**", f"**{alerta.get('titulo') or 'Alerta'}**"]
    if alerta.get("mensagem"):
        linhas.append(str(alerta["mensagem"]))
    competencia = str(alerta.get("competencia_referencia") or "")[:10]
    if len(competencia) == 10:
        linhas.append(f"Competência: {competencia[8:10]}/{competencia[5:7]}/{competencia[:4]}")
    base = os.getenv("FRONTEND_URL", "").rstrip("/")
    linhas.append("\nPode me perguntar sobre ele aqui" + (f" ou abrir {base}/alertas" if base else "") + ".")
    linhas.append("Para parar de receber: /alertas desligar")
    return "\n".join(linhas)


def enviar_alertas_criticos(agora: datetime | None = None) -> int:
    """Uma rodada: envia alertas novos a cada conexão com opt-in. Retorna quantos saíram."""

    if em_silencio(agora):
        return 0
    from api.core.channel_router import _enviar

    optin = db.listar_eventos_canal(PROVEDOR_OPTIN)
    enviados_antes = db.listar_eventos_canal(PROVEDOR_ENVIADO)
    cache: dict[str, tuple[str, list[dict]]] = {}
    total = 0
    for conexao in db.listar_conexoes_ativas():
        if str(conexao["id"]) not in optin:
            continue
        ibge6 = str(conexao["ibge6"])
        try:
            # Permissão relida a cada rodada: acesso desativado ou município retirado para o envio.
            if "consultar_alertas" not in ferramentas_no_municipio(carregar_acesso(conexao["usuario"]), ibge6):
                continue
            if ibge6 not in cache:
                cache[ibge6] = alertas_criticos(ibge6)
        except (AcessoNegado, HTTPException) as exc:
            log.info("Alerta proativo pulado para conexão %s: %s", conexao["id"], exc)
            continue
        municipio, alertas = cache[ibge6]
        novos = 0
        for alerta in alertas:
            chave = _chave(conexao["id"], alerta)
            if chave in enviados_antes or novos >= MAX_ALERTAS_POR_RODADA:
                continue
            # Reserva antes de enviar: dois workers não mandam o mesmo alerta duas vezes.
            if not db.registrar_evento_canal(PROVEDOR_ENVIADO, chave):
                continue
            if _enviar(conexao["provedor"], conexao["external_chat_id"], _texto_alerta(municipio, alerta)):
                novos += 1
            else:
                db.remover_evento_canal(PROVEDOR_ENVIADO, chave)  # tenta de novo na próxima rodada
        total += novos
    return total


def iniciar_agendador() -> threading.Thread | None:
    """Liga a rodada periódica quando `CLARA_ALERTAS_PROATIVOS=true`."""

    if os.getenv("CLARA_ALERTAS_PROATIVOS", "").strip().lower() not in {"1", "true"}:
        return None
    intervalo = max(1, int(os.getenv("CLARA_ALERTAS_INTERVALO_MINUTOS", "30") or 30)) * 60

    def laco() -> None:
        while True:
            try:
                enviados = enviar_alertas_criticos()
                if enviados:
                    log.info("Clara proativa enviou %s alerta(s)", enviados)
            except Exception as exc:  # pragma: no cover - rede/Supabase fora do ar
                log.warning("Rodada de alertas proativos falhou: %s", exc)
            time.sleep(intervalo)

    # ponytail: thread por processo; o registro chave-única evita duplicata com vários workers.
    thread = threading.Thread(target=laco, name="clara-proativa", daemon=True)
    thread.start()
    return thread
