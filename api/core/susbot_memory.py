"""Memória pessoal criptografada e isolada por usuário para o SusBot."""

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


_CHAVES_PUBLICAS = {"nome", "area_atuacao", "cargo", "preferencia_resposta"}
_ROTULOS = {
    "nome": "Nome",
    "area_atuacao": "Área de atuação",
    "cargo": "Cargo ou função",
    "preferencia_resposta": "Preferência de resposta",
}
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
    ]
    return any(re.search(padrao, normalizado, flags=re.IGNORECASE) for padrao in padroes)


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
            "area_atuacao",
            "profissional",
            re.compile(
                r"\b(?:trabalho|atuo)\s+(?:na area de|na|no|com|em)\s+(.+?)"
                r"(?=\s+(?:e|mas)\b|[,.!?]|$)",
                re.IGNORECASE,
            ),
        ),
        (
            "area_atuacao",
            "profissional",
            re.compile(r"\bminha area (?:é|e)\s+(.+?)(?=\s+(?:e|mas)\b|[,.!?]|$)", re.IGNORECASE),
        ),
        (
            "cargo",
            "profissional",
            re.compile(
                r"\b(?:meu cargo|minha funcao) (?:é|e)\s+(.+?)(?=\s+(?:e|mas)\b|[,.!?]|$)",
                re.IGNORECASE,
            ),
        ),
        (
            "cargo",
            "profissional",
            re.compile(
                r"\bsou\s+((?:gestor|gestora|analista|coordenador|coordenadora|diretor|diretora|"
                r"enfermeiro|enfermeira|medico|medica)(?:\s+de\s+.+?)?)(?=\s+(?:e|mas)\b|[,.!?]|$)",
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
        if len(valor) < 2 or _contem_dado_sensivel(valor):
            continue
        if chave == "nome":
            valor = valor.title()
        aprendidos.append(
            salvar_fato(
                usuario,
                chave,
                valor,
                categoria=categoria,
                origem=origem,
                confianca=1.0,
            )
        )

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
    if nome and not _contem_dado_sensivel(nome):
        salvar_fato(usuario, "nome", nome.title(), categoria="identidade", origem=origem, confianca=1.0)


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
        "area": "area_atuacao",
        "minha area": "area_atuacao",
        "cargo": "cargo",
        "meu cargo": "cargo",
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
