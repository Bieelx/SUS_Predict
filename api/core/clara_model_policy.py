"""Política explícita de escolha de modelo para a Clara.

O modelo local atende conversa e consultas leves. Um modelo externo só pode
participar de uma etapa de planejamento que realmente exija raciocínio mais
longo; a execução continua passando pelas validações e confirmações do backend.
"""

from __future__ import annotations


RACIOCINIO_LEVE = "leve"
RACIOCINIO_AVANCADO = "avancado"


def perfil_para_plano(plano: dict | None) -> str:
    """Classifica a tarefa, nunca a identidade nem os dados do usuário."""

    if (plano or {}).get("ferramenta") == "gerar_etp":
        return RACIOCINIO_AVANCADO
    return RACIOCINIO_LEVE


def usa_gemini_para_perfil(perfil: str) -> bool:
    return perfil == RACIOCINIO_AVANCADO
