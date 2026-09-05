"""Memória pessoal criptografada e isolada por usuário para a Clara."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from api.core import db


# Lista fechada de chaves graváveis (docs/09, Fase 0). Nenhuma chave pode ter
# nome ou semântica de papel, cargo, área, município, nível ou permissão —
# a autorização é resolvida em outro armazenamento e nunca passa por aqui.
_CHAVES_PUBLICAS = {"nome", "preferencia_resposta"}
# Chaves que já existiram e foram removidas; `limpar_chaves_removidas` apaga o
# que ainda estiver gravado delas.
_CHAVES_REMOVIDAS = {"cargo", "area_atuacao"}
_ROTULOS = {
    "nome": "Nome",
    "preferencia_resposta": "Preferência de resposta",
}
# Enum fechado de preferencia_resposta: valor -> palavras-chave que o disparam.
# Texto fora deste mapa é descartado, nunca gravado como texto livre.
_PREFERENCIAS = {
    "curta": {"curta", "curtas", "breve", "breves", "resumida", "resumidas", "direta", "diretas", "objetiva", "objetivas", "rapida", "rapidas"},
    "detalhada": {"detalhada", "detalhadas", "completa", "completas", "longa", "longas", "explicada", "explicadas", "aprofundada", "aprofundadas"},
    "com_numeros": {"numeros", "numericas", "dados", "percentuais", "valores", "estatisticas"},
}
_RE_NOME_VALIDO = re.compile(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*){0,2}$")
_TOPICOS = {
    "estoque": {"estoque", "insumo", "medicamento", "remedio", "abastecimento", "ruptura"},
    "epidemiologia": {"epidemiologia", "dengue", "notific", "caso", "surto"},
    "internacoes": {"internac", "hospitaliz", "leito", "hospitalar"},
    "alertas": {"alerta", "risco", "ocorrencia"},
    "compras_e_etp": {"etp", "compra", "licitacao", "aquisicao", "fornecedor"},
    "superlotacao": {"superlotacao", "ocupacao", "capacidade"},
}


def _normalizar(texto: str) -> str:
    decomposed = unicodedata.normalize("NFKD", str(texto or ""))
    return " ".join("".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower().split())


def _key_file() -> Path:
    custom = os.getenv("SUSBOT_MEMORY_KEY_FILE", "").strip()
    return Path(custom).expanduser() if custom else Path(__file__).resolve().parents[1] / ".secrets" / "susbot_memory.key"


def _memory_key() -> bytes:
    configured = os.getenv("SUSBOT_MEMORY_KEY", "").strip().encode("ascii")
    if configured:
        Fernet(configured)  # valida antes de usar
        return configured

    path = _key_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        key = path.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        with os.fdopen(descriptor, "wb") as arquivo:
            arquivo.write(key + b"\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    Fernet(key)
    return key


def _index_key() -> bytes:
    return hashlib.sha256(b"susbot-memory-index-v1:" + base64.urlsafe_b64decode(_memory_key())).digest()


def _ref(prefixo: str, valor: str) -> str:
    return hmac.new(_index_key(), f"{prefixo}:{valor}".encode("utf-8"), hashlib.sha256).hexdigest()


def _owner_ref(usuario: str) -> str:
    usuario = str(usuario or "").strip()
    if not usuario:
        raise ValueError("Usuário ausente para memória pessoal")
    return _ref("owner", usuario)


def _fact_ref(owner_ref: str, chave: str) -> str:
    return _ref("fact", f"{owner_ref}:{chave}")


def _encrypt(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return Fernet(_memory_key()).encrypt(raw).decode("ascii")


def _decrypt(token: str) -> dict[str, Any] | None:
    try:
        raw = Fernet(_memory_key()).decrypt(str(token).encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
    except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _limpar_valor(valor: str, limite: int = 120) -> str:
    return " ".join(str(valor or "").replace("\x00", " ").split()).strip(" .,;:!?")[:limite]


def _contem_dado_sensivel(texto: str) -> bool:
    normalizado = _normalizar(texto)
    padroes = [
        r"\b(?:senha|password|token|api[ -]?key|chave privada|segredo)\b",
        r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b",  # CPF
        r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b",
        r"\b(?:eu tenho|fui diagnosticad\w*|meu diagnostico|minha doenca|minha saude)\b",
        r"\b(?:minha religiao|minha orientacao sexual|meu partido|voto em)\b",
        r"\b(?:paciente|prontuario)\s+[a-z0-9]",
        # Delimitadores e rótulos dos prompts da Clara: um valor de memória nunca
        # pode abrir, fechar ou imitar um bloco do prompt.
        r"={3,}",
        r"\bdados da ferramenta\b",
        r"\bmemoria do usuario\b",
        r"\bmemoria pessoal\b",
        r"\bpergunta do usuario\b",
        r"\bsystem prompt\b",
        r"\((?:inicio|fim)\)",
    ]
    return any(re.search(padrao, normalizado, flags=re.IGNORECASE) for padrao in padroes)


def mapear_preferencia(texto: str) -> str | None:
    """Reduz texto livre ao enum de preferência; None quando nada casa."""

    palavras = set(_normalizar(texto).replace(",", " ").split())
    for valor, termos in _PREFERENCIAS.items():
        if palavras & termos:
            return valor
    return None


def _validar_valor(chave: str, valor: Any) -> str | int:
    """Validação por chave. Levanta ValueError para qualquer valor fora do formato."""

    if chave == "nome":
        texto = _limpar_valor(valor, limite=200)
        if len(texto) > 60 or not _RE_NOME_VALIDO.match(texto):
            raise ValueError("nome fora do formato permitido")
        return texto.title()
    if chave == "preferencia_resposta":
        texto = str(valor or "").strip().lower()
        if texto not in _PREFERENCIAS:
            raise ValueError("preferencia_resposta fora do enum")
        return texto
    if chave.startswith("topico:"):
        if chave.removeprefix("topico:") not in _TOPICOS:
            raise ValueError("tópico desconhecido")
        try:
            return max(0, int(valor))
        except (TypeError, ValueError) as exc:
            raise ValueError("tópico exige inteiro") from exc
    raise ValueError("Categoria de memória não permitida")


def salvar_fato(
    usuario: str,
    chave: str,
    valor: str | int,
    *,
    categoria: str,
    origem: str,
    confianca: float,
) -> dict[str, Any]:
    chave = str(chave or "").strip().lower()
    if chave not in _CHAVES_PUBLICAS and not chave.startswith("topico:"):
        raise ValueError("Categoria de memória não permitida")
    valor = _validar_valor(chave, valor)
    if isinstance(valor, str) and _contem_dado_sensivel(valor):
        raise ValueError("valor contém termo bloqueado")
    owner = _owner_ref(usuario)
    payload = {
        "chave": chave,
        "valor": valor,
        "categoria": categoria,
        "origem": origem,
        "confianca": max(0.0, min(float(confianca), 1.0)),
    }
    row = db.upsert_memoria_usuario(owner, _fact_ref(owner, chave), _encrypt(payload))
    return {**payload, "atualizado_em": row["atualizado_em"]}


def listar_memorias(usuario: str) -> list[dict[str, Any]]:
    memorias: list[dict[str, Any]] = []
    for row in db.listar_memorias_usuario(_owner_ref(usuario)):
        payload = _decrypt(row["payload_encrypted"])
        if not payload:
            continue
        memorias.append({
            **payload,
            "criado_em": row["criado_em"],
            "atualizado_em": row["atualizado_em"],
        })
    return memorias


def apagar_memorias(usuario: str, chave: str | None = None) -> int:
    owner = _owner_ref(usuario)
    fact = _fact_ref(owner, chave.strip().lower()) if chave else None
    return db.deletar_memoria_usuario(owner, fact)


def _valor_atual(usuario: str, chave: str, padrao: Any = None) -> Any:
    memoria = next((item for item in listar_memorias(usuario) if item.get("chave") == chave), None)
    return memoria.get("valor") if memoria else padrao


def _incrementar_topico(usuario: str, topico: str, origem: str) -> None:
    chave = f"topico:{topico}"
    atual = _valor_atual(usuario, chave, 0)
    try:
        contador = int(atual) + 1
    except (TypeError, ValueError):
        contador = 1
    salvar_fato(
        usuario,
        chave,
        contador,
        categoria="interesse_agregado",
        origem=origem,
        confianca=1.0,
    )


def aprender_da_mensagem(usuario: str, texto: str, origem: str) -> list[dict[str, Any]]:
    """Aprende apenas declarações pessoais explícitas e contadores de assunto."""

    texto = _limpar_valor(texto, limite=1000)
    if not texto or _contem_dado_sensivel(texto):
        return []

    aprendidos: list[dict[str, Any]] = []
    extratores = [
        (
            "nome",
            "identidade",
            re.compile(
                r"\b(?:meu nome (?:é|e)|me chamo)\s+"
                r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*){0,2})"
                r"(?=\s+(?:e|mas)\b|[,.!?]|$)",
                re.IGNORECASE,
            ),
        ),
        (
            "preferencia_resposta",
            "preferencia",
            re.compile(r"\b(?:prefiro|gosto de) respostas?\s+(.+?)(?=[.!?]|$)", re.IGNORECASE),
        ),
    ]
    for chave, categoria, padrao in extratores:
        match = padrao.search(texto)
        if not match:
            continue
        valor = _limpar_valor(match.group(1))
        if chave == "preferencia_resposta":
            valor = mapear_preferencia(valor)
        if not valor or len(str(valor)) < 2:
            continue
        try:
            aprendidos.append(
                salvar_fato(usuario, chave, valor, categoria=categoria, origem=origem, confianca=1.0)
            )
        except ValueError:
            # Fora do formato/enum: descarta em silêncio, nunca grava texto livre.
            continue

    normalizado = _normalizar(texto)
    for topico, termos in _TOPICOS.items():
        if any(re.search(rf"\b{re.escape(termo)}\w*\b", normalizado) for termo in termos):
            _incrementar_topico(usuario, topico, origem)

    return aprendidos


def aprender_do_usuario_autenticado(usuario: str, auth_user: dict[str, Any], origem: str = "perfil") -> None:
    if _valor_atual(usuario, "nome"):
        return
    metadata = auth_user.get("user_metadata") or {}
    nome = metadata.get("nome") or metadata.get("name") or metadata.get("full_name")
    nome = _limpar_valor(str(nome or "").replace(".", " "))
    if not nome:
        return
    try:
        salvar_fato(usuario, "nome", nome, categoria="identidade", origem=origem, confianca=1.0)
    except ValueError:
        return


def contexto_para_agente(usuario: str) -> dict[str, Any]:
    fatos: dict[str, str] = {}
    topicos: list[tuple[str, int]] = []
    for memoria in listar_memorias(usuario):
        chave = str(memoria.get("chave") or "")
        if chave in _CHAVES_PUBLICAS:
            fatos[chave] = str(memoria.get("valor") or "")
        elif chave.startswith("topico:"):
            try:
                topicos.append((chave.removeprefix("topico:"), int(memoria.get("valor") or 0)))
            except (TypeError, ValueError):
                continue
    topicos.sort(key=lambda item: (-item[1], item[0]))
    return {"fatos": fatos, "topicos_frequentes": [nome for nome, _ in topicos[:3]]}


def resumo_transparente(usuario: str) -> dict[str, Any]:
    contexto = contexto_para_agente(usuario)
    return {
        "fatos": [
            {"chave": chave, "rotulo": _ROTULOS[chave], "valor": valor}
            for chave, valor in contexto["fatos"].items()
        ],
        "topicos_frequentes": contexto["topicos_frequentes"],
        "politica": (
            "Somente declarações pessoais explícitas e assuntos agregados são memorizados. "
            "Credenciais, dados clínicos pessoais e outras categorias sensíveis são bloqueados."
        ),
    }


def executar_comando_memoria(usuario: str, texto: str) -> str | None:
    normalizado = _normalizar(texto)
    if normalizado in {"/memoria", "/memory"}:
        resumo = resumo_transparente(usuario)
        linhas = [f"- **{item['rotulo']}**: {item['valor']}" for item in resumo["fatos"]]
        if resumo["topicos_frequentes"]:
            linhas.append("- **Assuntos frequentes**: " + ", ".join(resumo["topicos_frequentes"]))
        return "O que lembro sobre você:\n" + "\n".join(linhas) if linhas else "Ainda não memorizei informações sobre você."

    apagar_tudo = normalizado in {
        "/esquecer",
        "/forget",
        "/esquecer tudo",
        "/forget all",
        "esqueca tudo sobre mim",
        "esqueca o que sabe sobre mim",
        "apague minha memoria",
        "limpe minha memoria",
    }
    if apagar_tudo:
        quantidade = apagar_memorias(usuario)
        return f"Memória pessoal apagada ({quantidade} registro(s))."

    aliases = {
        "nome": "nome",
        "meu nome": "nome",
        "preferencia": "preferencia_resposta",
        "preferencias": "preferencia_resposta",
    }
    alvo = ""
    if normalizado.startswith("/esquecer "):
        alvo = normalizado.removeprefix("/esquecer ").strip()
    elif normalizado.startswith("esqueca "):
        alvo = normalizado.removeprefix("esqueca ").strip()
    chave = aliases.get(alvo)
    if chave:
        removidos = apagar_memorias(usuario, chave)
        return "Informação esquecida." if removidos else "Essa informação não estava na minha memória."
    return None


def limpar_chaves_removidas() -> dict[str, int]:
    """Rotina de limpeza da Fase 0 (docs/09): apaga registros de chaves que saíram
    da lista permitida, no SQLite e, por espelho, no Supabase.

    Percorre todas as linhas, decifra cada payload e deleta as que pertencem a
    `_CHAVES_REMOVIDAS`. Linhas que não decifram (chave Fernet de outro servidor)
    são contadas em `ilegiveis` e mantidas.
    """

    def _remover(chave: str) -> bool:
        return chave in _CHAVES_REMOVIDAS

    removidos = 0
    ilegiveis = 0
    for row in db.listar_todas_memorias_usuario():
        payload = _decrypt(row["payload_encrypted"])
        if payload is None:
            ilegiveis += 1
            continue
        if _remover(str(payload.get("chave") or "")):
            removidos += db.deletar_memoria_usuario(row["owner_ref"], row["fact_ref"])

    # Supabase pode ter linhas espelhadas de outro servidor (que não estão neste
    # SQLite). Varre direto, mesma chave Fernet; o que não decifra fica.
    removidos_supabase = 0
    ilegiveis_supabase = 0
    linhas_supabase: list[dict[str, Any]] = []
    supabase_erro = None
    if db.supabase_configured():
        try:
            linhas_supabase = db.sb_select("susbot_memorias")
        except Exception as exc:  # tabela ausente, rede, credencial
            supabase_erro = str(exc)[:200]
    for row in linhas_supabase:
        payload = _decrypt(row.get("payload_encrypted") or "")
        if payload is None:
            ilegiveis_supabase += 1
            continue
        if _remover(str(payload.get("chave") or "")):
            db._sync_delete("susbot_memorias", {"owner_ref": row["owner_ref"], "fact_ref": row["fact_ref"]})
            removidos_supabase += 1
    return {
        "removidos": removidos,
        "ilegiveis": ilegiveis,
        "removidos_supabase": removidos_supabase,
        "ilegiveis_supabase": ilegiveis_supabase,
        "supabase_erro": supabase_erro,
    }


if __name__ == "__main__":  # pragma: no cover - uso operacional
    from pathlib import Path as _Path
    from dotenv import load_dotenv
    load_dotenv(_Path(__file__).resolve().parents[2] / ".env")
    db.init_db()
    print(limpar_chaves_removidas())
