"""Contexto imutável e ações duráveis compartilhados pela web e Telegram."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from api.core import db


SCHEMA = """
CREATE TABLE IF NOT EXISTS clara_contextos (
    conversa_id TEXT PRIMARY KEY REFERENCES susbot_conversas(id) ON DELETE CASCADE,
    contexto TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clara_acoes (
    id TEXT PRIMARY KEY,
    conversa_id TEXT NOT NULL REFERENCES susbot_conversas(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    dados TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL,
    resultado TEXT
);
CREATE INDEX IF NOT EXISTS clara_acoes_conversa ON clara_acoes(conversa_id);
"""


def _decode(row):
    if row is None:
        return None
    row = dict(row)
    for key in ("contexto", "dados", "resultado"):
        if isinstance(row.get(key), str):
            row[key] = json.loads(row[key])
    return row


def verificar_dono(conversa_id: str, usuario: str) -> dict:
    conversa = db.get_conversa(conversa_id)
    if not conversa or conversa["usuario"] != usuario:
        raise HTTPException(404, "Conversa não encontrada para este usuário.")
    return conversa


def obter_contexto(conversa_id: str) -> dict | None:
    if db._clara_remoto():
        rows, _ = db._rest("GET", f"clara_contextos?conversa_id=eq.{db._e(conversa_id)}")
        row = rows[0] if rows else None
    else:
        with db._conn() as con:
            row = con.execute("SELECT * FROM clara_contextos WHERE conversa_id=?", (conversa_id,)).fetchone()
    return (_decode(row) or {}).get("contexto")


def fixar_contexto(conversa_id: str, usuario: str, ibge6: str, contexto: dict | None = None) -> dict:
    verificar_dono(conversa_id, usuario)
    existente = obter_contexto(conversa_id)
    if existente:
        return existente
    if not re.fullmatch(r"\d{6}", ibge6):
        raise HTTPException(422, "Município inválido.")
    contexto = contexto or {}
    periodo = contexto.get("periodo", "12 Meses")
    if periodo not in {"12 Meses", "Trimestre", "Semestre", "3 Anos", "5 Anos"}:
        raise HTTPException(422, "Período inválido para esta conversa.")
    if contexto.get("modo", "real") != "real":
        raise HTTPException(422, "Conversas demonstrativas não podem executar ações reais.")
    novo = {"ibge6": ibge6, "periodo": periodo, "modo": "real",
            "tela": str(contexto.get("tela") or "visao-geral")[:40],
            "item": str(contexto.get("item") or "")[:200],
            "unidade": str(contexto.get("unidade") or "")[:100]}
    if db._clara_remoto():
        db._rest("POST", "clara_contextos?on_conflict=conversa_id",
                 {"conversa_id": conversa_id, "contexto": novo}, prefer="resolution=ignore-duplicates")
    else:
        with db._conn() as con:
            con.execute("INSERT OR IGNORE INTO clara_contextos VALUES (?,?)", (conversa_id, json.dumps(novo)))
    return obter_contexto(conversa_id)


def criar_acao(conversa_id: str, usuario: str, dados: dict) -> dict:
    verificar_dono(conversa_id, usuario)
    agora = datetime.now(timezone.utc)
    row = {"id": str(uuid.uuid4()), "conversa_id": conversa_id, "status": "pendente",
           "dados": dados, "criado_em": agora.isoformat(),
           "expira_em": (agora + timedelta(hours=24)).isoformat(), "resultado": None}
    if db._clara_remoto():
        db._rest("POST", "clara_acoes", row)
    else:
        with db._conn() as con:
            con.execute("INSERT INTO clara_acoes VALUES (:id,:conversa_id,:status,:dados,:criado_em,:expira_em,:resultado)",
                        {**row, "dados": json.dumps(dados)})
    return row


def listar_acoes(conversa_id: str, usuario: str) -> list[dict]:
    verificar_dono(conversa_id, usuario)
    if db._clara_remoto():
        rows, _ = db._rest("GET", f"clara_acoes?conversa_id=eq.{db._e(conversa_id)}&order=criado_em.asc")
    else:
        with db._conn() as con:
            rows = con.execute("SELECT * FROM clara_acoes WHERE conversa_id=? ORDER BY criado_em", (conversa_id,)).fetchall()
    return [_decode(row) for row in rows]


def obter_acao(acao_id: str, conversa_id: str, usuario: str) -> dict:
    row = next((a for a in listar_acoes(conversa_id, usuario) if a["id"] == acao_id), None)
    if not row:
        raise HTTPException(404, "Ação não encontrada nesta conversa.")
    return row


def transicionar(acao_id: str, anterior: str, status: str, resultado=None) -> bool:
    """Compare-and-swap no banco: somente uma requisição pode executar a ação."""
    if db._clara_remoto():
        rows, _ = db._rest("PATCH", f"clara_acoes?id=eq.{db._e(acao_id)}&status=eq.{db._e(anterior)}",
                           {"status": status, "resultado": resultado}, prefer="return=representation")
        return bool(rows)
    with db._conn() as con:
        cur = con.execute("UPDATE clara_acoes SET status=?,resultado=? WHERE id=? AND status=?",
                          (status, json.dumps(resultado) if resultado is not None else None, acao_id, anterior))
        return cur.rowcount == 1


def executar_acao(acao_id: str, conversa_id: str, usuario: str, agente):
    acao = obter_acao(acao_id, conversa_id, usuario)
    if acao["status"] == "concluida":
        yield from acao["resultado"] or []
        return
    if acao["status"] != "pendente":
        raise HTTPException(409, "Ação cancelada ou já em processamento. Reabra a conversa para verificar o resultado.")
    if datetime.fromisoformat(acao["expira_em"]) <= datetime.now(timezone.utc):
        transicionar(acao_id, "pendente", "expirada")
        raise HTTPException(410, "Esta ação expirou. Peça à Clara uma nova proposta.")
    ferramenta = acao["dados"]["ferramenta"]
    if ferramenta not in agente.permitidas:
        raise HTTPException(403, "Seu perfil não permite esta ação.")
    if not transicionar(acao_id, "pendente", "executando"):
        raise HTTPException(409, "Esta ação já está sendo processada.")
    # Buffer antes de transmitir: desconexão do cliente não perde o resultado.
    # Se houver falha após a escrita, fica bloqueada para não duplicar o efeito.
    try:
        eventos = list(agente.stream_eventos_confirmado(ferramenta, acao["dados"].get("argumentos") or {}))
        falhou = any(e["event"] == "erro" for e in eventos)
        transicionar(acao_id, "executando", "falhou" if falhou else "concluida", eventos)
    except Exception:
        transicionar(acao_id, "executando", "verificar_resultado")
        raise
    yield from eventos


def resumo_conversa(conversa: dict) -> str:
    """Resumo extrativo: não inventa conclusões nem depende do modelo disponível."""
    contexto = obter_contexto(conversa["id"])
    partes = [f"**{conversa['titulo']}**"]
    if contexto:
        partes.append(f"Município: {contexto['ibge6']} · Período: {contexto['periodo']}")
    mensagens = db.listar_mensagens(conversa["id"], page_size=3)
    for msg in reversed(mensagens):
        pergunta = str(msg.get("pergunta") or "")
        resposta = str(msg.get("resposta") or "")
        partes.append(f"Você: {pergunta[:180]}{'…' if len(pergunta) > 180 else ''}\nClara: {resposta[:280]}{'…' if len(resposta) > 280 else ''}")
    partes.append("Resumo das últimas mensagens; os dados serão consultados novamente na próxima pergunta.\nPode continuar o assunto. Use /conversas para trocar ou /nova para começar outro.")
    return "\n\n".join(partes)
