"""Extração conservadora do piloto: somente relatos explícitos, nunca confirmação.

Primeiro incremento deliberadamente determinístico. Trechos ambíguos deixam
campos pendentes ou são recusados; nenhum modelo recebe autoridade para gravar.
"""
from datetime import date, datetime, timedelta
import re
import unicodedata
from zoneinfo import ZoneInfo

from api.core.local_records_service import fail

NUMBERS = {"zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
           "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
           "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "quinze": 15,
           "dezesseis": 16, "dezessete": 17, "dezoito": 18, "dezenove": 19, "vinte": 20}
NUMBER = r"(?:\d+(?:[.,]\d+)?|" + "|".join(NUMBERS) + r")"


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c))


def interpret(text, today=None):
    today = today or datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    source = fold(text)
    # Não interpretar instruções sobre exemplos, hipóteses ou quantidades aproximadas.
    if re.search(r"\b(se |talvez|exemplo|simul|aproximad|cerca de|entre \d|nao |nenhum|amanha)", source):
        fail(422, "relato_ambiguo", "Informe apenas o acontecimento realizado e a quantidade medida, sem hipóteses ou aproximações.")
    dates = re.findall(r"\b(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b", source)
    relative = re.findall(r"\b(hoje|ontem)\b", source)
    period = None
    if len(set(dates)) + len(set(relative)) > 1:
        fail(422, "periodo_ambiguo", "Envie um dia de cada vez e informe a data do fechamento.")
    if dates:
        try:
            period = (date.fromisoformat(dates[0]) if "-" in dates[0] else datetime.strptime(dates[0], "%d/%m/%Y").date()).isoformat()
        except ValueError:
            fail(422, "periodo_invalido", "Informe uma data válida.")
    elif relative:
        period = (today - timedelta(days=1 if relative[0] == "ontem" else 0)).isoformat()
    # Separação pelos verbos impede que a quantidade de uma cláusula contamine outra.
    verbs = r"apliquei|aplicamos|atendi|atendemos|encaminhei|encaminhamos"
    clauses = re.split(r"(?=\b(?:" + verbs + r")\b)", source)
    proposals = []
    for clause in clauses:
        match = re.match(r"(" + verbs + r")\s+(" + NUMBER + r")\b(.*)", clause, re.S)
        if not match:
            continue
        verb, number, rest = match.groups()
        if "." in number or "," in number:
            fail(422, "quantidade_ambigua", "Informe a quantidade inteira sem separador de milhar ou decimal.")
        if re.match(r"\s*(?:a |ou |e (?:" + NUMBER + r")\b)", rest):
            fail(422, "quantidade_ambigua", "Informe uma quantidade única por indicador.")
        amount = str(NUMBERS[number]) if number in NUMBERS else number.replace(",", ".")
        dims = {}
        if verb in ("apliquei", "aplicamos"):
            if not re.match(r"\s+doses?\b", rest):
                continue
            indicator = "doses_vacina_aplicadas"
            vaccines = [v for v in ("dengue", "covid-19", "influenza", "hepatite b", "febre amarela") if v in rest]
            if len(vaccines) == 1:
                dims["vacina"] = vaccines[0]
            dose_types = [canonical for word, canonical in (("primeira", "primeira"), ("segunda", "segunda"), ("reforco", "reforço"))
                          if re.search(r"\b" + word + r"\b", rest)]
            if len(dose_types) == 1:
                dims["tipo_dose"] = dose_types[0]
        elif verb in ("atendi", "atendemos"):
            if "suspeita" not in rest:
                continue
            indicator = "atendimentos_suspeita_dengue"
            if "dengue" in rest:
                dims["doenca"] = "dengue"
        else:
            indicator = "encaminhamentos_dengue"
            if "dengue" in rest:
                dims["doenca"] = "dengue"
            if re.search(r"\bpara (?:o )?hospital\b", rest):
                dims["destino"] = "hospital"
        proposals.append({"indicador": indicator, "valor": amount, "periodo_inicio": period,
                          "periodo_fim": period, "dimensoes": dims})
    if not proposals:
        fail(422, "relato_sem_indicadores", "Informe, por exemplo: Hoje aplicamos 32 doses contra dengue. Estoque e internações ainda não fazem parte deste piloto.")
    return proposals


def report_summary(report):
    lines = ["Preparei os rascunhos abaixo. Nenhum valor entrou nos indicadores confirmados."]
    for record in report["registros"]:
        v = record["atual"]
        lines.append(f"• {record['indicador_nome']}: {v['valor']}, data {v['periodo_inicio'] or 'a informar'}.")
        if v["pendencias"]:
            lines.append("  Complete: " + ", ".join(v["pendencias"]) + ".")
    lines.append("Revise os dados e solicite a confirmação por uma pessoa autorizada da unidade.")
    return "\n".join(lines)
