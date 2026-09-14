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
TENS = {"vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50, "sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90}
NUMBER = r"(?:\d+(?:[.,]\d+)?|(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)(?: e (?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|" + "|".join(NUMBERS) + r")"


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c))


def parse_number(value):
    """Converte algarismo ou número por extenso entre zero e noventa e nove."""

    value = fold(str(value)).strip()
    if value.isdigit():
        return int(value)
    if value in NUMBERS:
        return NUMBERS[value]
    parts = value.split(" e ")
    if len(parts) == 2 and parts[0] in TENS and parts[1] in NUMBERS and 0 < NUMBERS[parts[1]] < 10:
        return TENS[parts[0]] + NUMBERS[parts[1]]
    raise ValueError(f"Número não reconhecido: {value}")


def parse_report_date(text, today=None, max_age_days=None):
    """Extrai uma data explícita do relato; ausência permanece desconhecida."""

    today = today or datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    source = fold(text)
    if re.search(r"\bamanha\b", source):
        fail(422, "periodo_futuro", "A data informada está no futuro. Informe quando o acontecimento realmente ocorreu.")
    dates = re.findall(r"\b(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b", source)
    relative = re.findall(r"\b(hoje|ontem)\b", source)
    if len(set(dates)) + len(set(relative)) > 1:
        fail(422, "periodo_ambiguo", "Envie um dia de cada vez e informe a data do acontecimento.")
    if dates:
        try:
            reported = date.fromisoformat(dates[0]) if "-" in dates[0] else datetime.strptime(dates[0], "%d/%m/%Y").date()
        except ValueError:
            fail(422, "periodo_invalido", "Informe uma data válida.")
    elif relative:
        reported = today - timedelta(days=1 if relative[0] == "ontem" else 0)
    else:
        return None
    if reported > today:
        fail(422, "periodo_futuro", "A data informada está no futuro. Informe quando o acontecimento realmente ocorreu.")
    if max_age_days is not None and reported < today - timedelta(days=max_age_days):
        fail(422, "periodo_muito_antigo", f"A data informada tem mais de {max_age_days} dias. Registre apenas acontecimentos recentes.")
    return reported.isoformat()


def interpret(text, today=None):
    today = today or datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    source = fold(text)
    # Não interpretar instruções sobre exemplos, hipóteses ou quantidades aproximadas.
    if re.search(r"\b(se |talvez|exemplo|simul|aproximad|cerca de|entre \d|nao |nenhum|amanha)", source):
        fail(422, "relato_ambiguo", "Informe apenas o acontecimento realizado e a quantidade medida, sem hipóteses ou aproximações.")
    period = parse_report_date(source, today=today)
    # Voz passiva e data entre verbo/quantidade são relatos do mesmo acontecimento.
    source = re.sub(r"\bforam aplicad[ao]s?\b", "aplicamos", source)
    source = re.sub(r"\bforam atendid[ao]s?\b", "atendemos", source)
    source = re.sub(r"\bforam encaminhad[ao]s?\b", "encaminhamos", source)
    # "tivemos 3 encaminhamentos" / "houve 2 atendimentos" viram verbo + quantidade.
    source = re.sub(r"\b(?:tivemos|tive|teve|houve|registramos|foram|foi|mais)\s+(" + NUMBER + r")\s+encaminhamentos?\b",
                    r"encaminhamos \1", source)
    source = re.sub(r"\b(?:tivemos|tive|teve|houve|registramos|foram|foi|mais)\s+(" + NUMBER + r")\s+atendimentos?\b",
                    r"atendemos \1", source)
    source = re.sub(r"\b(apliquei|aplicamos|atendi|atendemos|encaminhei|encaminhamos)\s+(?:hoje|ontem)\s+", r"\1 ", source)
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
        amount = str(parse_number(number))
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
        fail(422, "relato_sem_indicadores", "Informe, por exemplo: Hoje aplicamos 32 doses contra dengue. Para estoque, descreva uma entrada ou saída; para leitos, informe ocupados e disponíveis.")
    return proposals


def report_summary(report, footer="Revise os dados e solicite a confirmação por uma pessoa autorizada da unidade."):
    lines = ["Preparei os rascunhos abaixo. Nenhum valor entrou nos indicadores confirmados."]
    for index, record in enumerate(report["registros"], 1):
        v = record["atual"]
        dims = ", ".join(f"{k}: {val}" for k, val in v["dimensoes"].items())
        lines.append(f"{index}. {record['indicador_nome']}: {v['valor']}{' (' + dims + ')' if dims else ''}, data {v['periodo_inicio'] or 'a informar'}.")
        if v["pendencias"]:
            lines.append("  Complete: " + ", ".join(v["pendencias"]) + ".")
    lines.append(footer)
    return "\n".join(lines)
