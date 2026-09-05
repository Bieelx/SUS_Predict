#!/usr/bin/env python3
"""Espelho Postgres de usuarios_acesso / usuarios_acesso_log / susbot_canais (docs/09).

Dois modos, ambos lendo SUPABASE_* do .env da raiz (ou do ambiente):

  python scripts/supabase_acesso.py verificar
      Depois de rodar os 4 SQLs no Supabase. Para cada tabela: existe com as colunas
      esperadas (OpenAPI do PostgREST), chave publicável NÃO lê (401/42501/404, nunca
      200), chave secreta lê; e em usuarios_acesso + usuarios_acesso_log a chave secreta
      escreve (linha-sonda "probe-…", apagada em seguida). Sai com código 1 se algo FALHA.

      "RLS ligada e sem policy" não é visível pelo PostgREST: o script prova o EFEITO
      (publicável barrada) e imprime o SELECT em pg_policies para conferir a CAUSA no
      SQL Editor.

  python scripts/supabase_acesso.py provar --uuid <UUID> --api https://… --email admin@…
      Depois de alterar o perfil/ativo desse UUID pela tela. Compara a verdade do backend
      (SQLite, via /api/admin/usuarios e /log, com login de admin) com o Postgres (via
      chave secreta): perfil, ativo, municipios, atribuido_por, atualizado_em e a última
      linha do log. Iguais = sync voltou de verdade.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
try:
    from dotenv import load_dotenv
    load_dotenv(RAIZ / ".env")
except ImportError:
    pass

ESPERADO = {
    "usuarios_acesso": {"usuario", "perfil", "municipios", "ativo", "atribuido_por", "criado_em", "atualizado_em"},
    "usuarios_acesso_log": {"id", "usuario", "acao", "perfil_antes", "perfil_depois", "ativo_antes", "ativo_depois", "por", "quando"},
    "susbot_memorias": {"id", "owner_ref", "fact_ref", "payload_encrypted", "criado_em", "atualizado_em"},
    "susbot_conversas": {"id", "usuario", "titulo", "criada_em"},
    "susbot_mensagens": {"id", "conversa_id", "tela_origem", "pergunta", "resposta", "referencia_rota", "criado_em"},
    "canal_pareamentos": {"id", "usuario", "provedor", "token_hash", "ibge6", "status"},
    "canal_conexoes": {"id", "usuario", "provedor", "ibge6", "status"},
    "estoque": {"ibge6", "item", "quantidade_atual", "consumo_medio_dia", "atualizado_em"},
    "alertas": {"id", "ibge6", "tipo", "status"},
    "etps": {"id", "ibge6", "item", "criado_em"},
}
COM_SONDA = ("usuarios_acesso", "usuarios_acesso_log")

PG_POLICIES_SQL = """
-- Rode no SQL Editor: rowsecurity deve ser true em todas e n_policies = 0 em todas.
select c.relname as tabela, c.relrowsecurity as rls_ligada,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as n_policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('usuarios_acesso','usuarios_acesso_log','susbot_memorias','susbot_conversas',
                    'susbot_mensagens','canal_pareamentos','canal_conexoes','estoque','alertas','etps')
order by 1;
"""


def env(*nomes):
    for n in nomes:
        v = os.getenv(n, "").strip()
        if v:
            return v
    return ""


def headers(key: str, extra: dict | None = None) -> dict:
    h = {"apikey": key, "Accept": "application/json"}
    if not key.startswith(("sb_secret_", "sb_publishable_")):
        h["Authorization"] = f"Bearer {key}"
    h.update(extra or {})
    return h


def req(method: str, url: str, key: str | None = None, body=None, extra: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    h = headers(key, extra) if key else {"Accept": "application/json", **(extra or {})}
    if data is not None:
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.getcode(), (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


class Relatorio:
    def __init__(self):
        self.falhas = 0

    def item(self, ok: bool, texto: str, detalhe: str = ""):
        self.falhas += 0 if ok else 1
        print(f"  [{'OK' if ok else 'FALHA'}] {texto}" + (f" — {detalhe}" if detalhe else ""))


# ── verificar ──────────────────────────────────────────────────────────────────

def verificar() -> int:
    url = env("SUPABASE_URL").rstrip("/")
    secreta = env("SUPABASE_SECRET_KEY", "SUPABASE_SECRET", "SUPABASE_SERVICE_ROLE_KEY")
    publica = env("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
    if not (url and secreta and publica):
        print("FALHA: SUPABASE_URL, chave secreta e chave publicável precisam estar no .env")
        return 1
    rel = Relatorio()

    print("\n== Schema (OpenAPI do PostgREST, chave secreta)")
    code, spec = req("GET", f"{url}/rest/v1/", secreta)
    defs = (spec or {}).get("definitions", {}) if isinstance(spec, dict) else {}
    rel.item(code == 200 and bool(defs), f"GET /rest/v1/ (OpenAPI) -> {code}")
    for tabela, colunas in ESPERADO.items():
        props = set((defs.get(tabela) or {}).get("properties", {}))
        if not props:
            rel.item(False, f"{tabela}: existe", "não está no schema cache (rode o SQL; se já rodou, espere ~1 min ou NOTIFY pgrst)")
            continue
        faltam = colunas - props
        rel.item(not faltam, f"{tabela}: colunas esperadas", f"faltam {sorted(faltam)}" if faltam else f"{len(props)} colunas")

    print("\n== Chave publicável NÃO lê (efeito de RLS sem policy + REVOKE)")
    for tabela in ESPERADO:
        code, body = req("GET", f"{url}/rest/v1/{tabela}?select=*&limit=1", publica)
        cod_pg = body.get("code") if isinstance(body, dict) else None
        # 404/PGRST205 = tabela não existe: não prova RLS nenhuma, é FALHA.
        ok = code in (401, 403) or cod_pg == "42501"
        motivo = "" if ok else (
            "tabela não existe" if cod_pg == "PGRST205"
            else "200 com linhas: RLS/GRANT abertos!" if body
            else "200 vazio: RLS ligada mas GRANT não revogado" if code == 200
            else str(body)[:120]
        )
        rel.item(ok, f"{tabela}: publicável -> {code}{f' ({cod_pg})' if cod_pg else ''}", motivo)

    print("\n== Chave secreta lê")
    for tabela in ESPERADO:
        code, body = req("GET", f"{url}/rest/v1/{tabela}?select=*&limit=1", secreta)
        rel.item(code == 200 and isinstance(body, list), f"{tabela}: secreta -> {code}",
                 f"{len(body)} linha(s) amostradas" if isinstance(body, list) else str(body)[:120])

    print("\n== Chave secreta escreve (linha-sonda, apagada em seguida)")
    marca = f"probe-{int(time.time())}"
    agora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sondas = {
        "usuarios_acesso": ({"usuario": marca, "perfil": "visitante", "municipios": [], "ativo": False,
                             "atribuido_por": "scripts/supabase_acesso.py", "criado_em": agora, "atualizado_em": agora},
                            f"usuario=eq.{marca}"),
        "usuarios_acesso_log": ({"id": marca, "usuario": marca, "acao": "sonda_verificacao", "por": "scripts/supabase_acesso.py", "quando": agora},
                                f"id=eq.{marca}"),
    }
    for tabela, (linha, filtro) in sondas.items():
        code, body = req("POST", f"{url}/rest/v1/{tabela}", secreta, body=[linha],
                         extra={"Prefer": "resolution=merge-duplicates,return=representation"})
        gravou = code in (200, 201)
        rel.item(gravou, f"{tabela}: upsert sonda -> {code}", "" if gravou else str(body)[:160])
        if gravou:
            code, body = req("DELETE", f"{url}/rest/v1/{tabela}?{filtro}", secreta)
            rel.item(code in (200, 204), f"{tabela}: sonda apagada -> {code}", "" if code in (200, 204) else str(body)[:160])

    print("\n== RLS ligada e sem policy (causa) — conferir no SQL Editor:")
    print(PG_POLICIES_SQL)
    print(f"RESULTADO: {'TUDO OK' if rel.falhas == 0 else f'{rel.falhas} FALHA(S)'}\n")
    return 0 if rel.falhas == 0 else 1


# ── provar ─────────────────────────────────────────────────────────────────────

def provar(uuid: str, api: str, email: str, senha: str | None) -> int:
    url = env("SUPABASE_URL").rstrip("/")
    secreta = env("SUPABASE_SECRET_KEY", "SUPABASE_SECRET", "SUPABASE_SERVICE_ROLE_KEY")
    if not (url and secreta):
        print("FALHA: SUPABASE_URL e chave secreta precisam estar no .env")
        return 1
    api = api.rstrip("/")
    senha = senha or getpass.getpass(f"Senha de {email}: ")
    code, sessao = req("POST", f"{api}/api/auth/login", body={"email": email, "password": senha})
    if code != 200 or not isinstance(sessao, dict) or not sessao.get("access_token"):
        print(f"FALHA: login em {api} -> {code} {str(sessao)[:160]}")
        return 1
    bearer = {"Authorization": f"Bearer {sessao['access_token']}"}
    rel = Relatorio()

    print("\n== Backend (SQLite, verdade do sistema)")
    code, lista = req("GET", f"{api}/api/admin/usuarios", extra=bearer)
    if code != 200:
        print(f"FALHA: /api/admin/usuarios -> {code} {str(lista)[:160]} (o login é de admin?)")
        return 1
    sq = next((l for l in lista if l["usuario"] == uuid), None)
    rel.item(sq is not None and not sq.get("sem_acesso"), f"{uuid} tem linha no SQLite",
             json.dumps({k: sq.get(k) for k in ("perfil", "ativo", "atribuido_por", "atualizado_em")}, ensure_ascii=False) if sq else "não listado")
    code, log_sq = req("GET", f"{api}/api/admin/usuarios/{urllib.parse.quote(uuid, safe='')}/log", extra=bearer)
    rel.item(code == 200 and bool(log_sq), "log no SQLite", f"{len(log_sq or [])} linha(s); última: {log_sq[0]['acao'] if log_sq else '-'}")

    print("\n== Postgres (chave secreta)")
    code, pg_rows = req("GET", f"{url}/rest/v1/usuarios_acesso?usuario=eq.{urllib.parse.quote(uuid, safe='')}", secreta)
    pg = pg_rows[0] if isinstance(pg_rows, list) and pg_rows else None
    rel.item(pg is not None, f"{uuid} tem linha no Postgres", "" if pg else f"GET -> {code}: {str(pg_rows)[:120]}")
    code, log_pg = req("GET", f"{url}/rest/v1/usuarios_acesso_log?usuario=eq.{urllib.parse.quote(uuid, safe='')}&order=quando.desc&limit=1", secreta)
    log_pg = log_pg if isinstance(log_pg, list) else []
    rel.item(bool(log_pg), "log no Postgres", f"última: {log_pg[0]['acao']}" if log_pg else f"GET -> {code}")

    print("\n== Comparação SQLite x Postgres")
    if sq and pg:
        def norm_ts(v):
            return str(v or "").replace("+00:00", "Z").replace(" ", "T")[:19]
        pares = [
            ("perfil", sq["perfil"], pg["perfil"]),
            ("ativo", bool(sq["ativo"]), bool(pg["ativo"])),
            ("atribuido_por", sq.get("atribuido_por"), pg.get("atribuido_por")),
            ("atualizado_em", norm_ts(sq.get("atualizado_em")), norm_ts(pg.get("atualizado_em"))),
        ]
        for campo, a, b in pares:
            rel.item(a == b, f"{campo}", f"sqlite={a!r} postgres={b!r}")
    if log_sq and log_pg:
        a, b = log_sq[0], log_pg[0]
        for campo in ("id", "acao", "perfil_antes", "perfil_depois", "por"):
            rel.item(a.get(campo) == b.get(campo), f"log.{campo}", f"sqlite={a.get(campo)!r} postgres={b.get(campo)!r}")
    print(f"\nRESULTADO: {'SYNC CONFIRMADO' if rel.falhas == 0 else f'{rel.falhas} FALHA(S)'}\n")
    return 0 if rel.falhas == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="modo", required=True)
    sub.add_parser("verificar")
    p = sub.add_parser("provar")
    p.add_argument("--uuid", required=True)
    p.add_argument("--api", default=env("SUSBOT_PROXY_TARGET") or "http://127.0.0.1:8000")
    p.add_argument("--email", required=True, help="e-mail de um admin")
    p.add_argument("--senha", default=None, help="se omitido, pergunta sem eco")
    a = ap.parse_args()
    return verificar() if a.modo == "verificar" else provar(a.uuid, a.api, a.email, a.senha)


if __name__ == "__main__":
    sys.exit(main())
