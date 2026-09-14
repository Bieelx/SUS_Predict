"""Interpreta somente frases operacionais explícitas; nunca usa texto como SQL."""
import re
import unicodedata

from api.core.local_records_service import fail


_AMBIGUOUS = re.compile(
    r"\b(nao|amanha|talvez|exemplo|aproximadamente|cerca de|vou|vamos|se eu|se nos)\b"
)
_OPERATIONAL_EVENT = re.compile(
    r"\b(aplic\w*|receb\w*|chegaram|retir\w*|utiliz\w*|entrada|saida|leitos?|intern\w*)\b"
)


def _plain(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c))


def _positive(value, field="quantidade"):
    number = int(value)
    if number <= 0:
        fail(422, "valor_invalido", f"{field.capitalize()} deve ser maior que zero.")
    return number


def _without_ambiguous_clauses(text):
    """Mascara só orações negadas, futuras, hipotéticas ou aproximadas."""

    parts = []
    rejected_event = False
    for match in re.finditer(r"[^,.!?;]+[,.!?;]?", text):
        clause = match.group()
        ambiguous = bool(_AMBIGUOUS.search(clause) or "?" in clause)
        if ambiguous and _OPERATIONAL_EVENT.search(clause):
            rejected_event = True
            parts.append(" " * len(clause))
        else:
            parts.append(clause)
    return "".join(parts).strip(" ,.;!?"), rejected_event


def _without_date_phrases(text):
    text = re.sub(r"\b(?:em\s+)?(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b[, :]?", " ", text)
    return " ".join(text.split())


def interpret_operational_input(text):
    source = " ".join(str(text or "").split()).strip()
    plain = _plain(source)
    plain, rejected_event = _without_ambiguous_clauses(plain)
    plain = _without_date_phrases(plain)
    plain = re.sub(r"^(?:(?:clara|oi|ola|bom dia|boa tarde|boa noite)[,!:]?\s*)+", "", plain)
    plain = re.sub(r"^(?:(?:hoje|ontem)[, :]*)\s*", "", plain).rstrip('.! ')
    plain = re.sub(r"^(?:eu |nos )?(?:recebi|recebemos|chegaram)\s+(?:(?:hoje|ontem)\s+)?", "entrada de ", plain)
    plain = re.sub(r"^(?:eu |nos )?(?:retirei|retiramos|utilizei|utilizamos)\s+(?:(?:hoje|ontem)\s+)?", "saida de ", plain)
    plain = re.sub(r"^(?:estamos com|temos)\s+", "", plain)

    vaccine = re.fullmatch(
        r"(?:registrar\s+)?(entrada|saida)\s+(?:de\s+)?(\d+)\s+doses?\s+(?:da\s+vacina\s+|de\s+)?(.+)",
        plain,
    )
    if vaccine:
        movement, amount, name = vaccine.groups()
        return {"tipo": "vacinacao", "payload": {"nome_vacina": name.strip(),
                "qtd_doses": _positive(amount, "quantidade de doses"), "tipo_movimentacao": movement}}

    beds = re.fullmatch(
        r"(?:atualizar\s+)?(.+?):?\s+(\d+)\s+leitos?\s+ocupados?\s+e\s+(\d+)\s+(?:leitos?\s+)?disponive(?:l|is)",
        plain,
    )
    if beds:
        kind, occupied, available = beds.groups()
        return {"tipo": "internacao", "payload": {"tipo_leito": kind.strip().removesuffix(":"),
                "qtd_leitos_ocupados": int(occupied), "qtd_leitos_disponiveis": int(available)}}

    # Formato deliberadamente rotulado: a apresentação completa identifica o
    # estoque; omitir um campo poderia movimentar outro medicamento.
    medicine = re.fullmatch(
        r"(?:registrar\s+)?(entrada|saida)\s+de\s+(\d+)\s+embalagens?\s+de\s+([^;]+);\s*"
        r"concentracao\s+([^;]+);\s*forma\s+([^;]+);\s*embalagem\s+([^;]+);\s*"
        r"(\d+)\s+unidades?\s+por\s+embalagem",
        plain,
    )
    if medicine:
        movement, amount, name, concentration, form, package, per_package = medicine.groups()
        return {"tipo": "medicamento", "payload": {
            "nome_medicamento": name.strip(), "concentracao": concentration.strip(),
            "forma_farmaceutica": form.strip(), "tipo_embalagem": package.strip(),
            "quantidade_por_embalagem": _positive(per_package, "quantidade por embalagem"),
            "qtd_embalagens": _positive(amount, "quantidade de embalagens"),
            "tipo_movimentacao": movement,
        }}

    if rejected_event:
        fail(422, "input_ambiguo", "Descreva uma movimentação realizada ou a situação medida dos leitos, sem hipóteses ou aproximações.")
    fail(422, "input_operacional_nao_reconhecido",
         "Informe uma movimentação de vacina ou medicamento, ou a situação atual dos leitos, no formato orientado.")


_N = r"(\d+|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)"
_VACCINE = r"(covid-?19|influenza|hepatite b|febre amarela|dengue)"
_CONNECT = r"(?:\s+(?:d[aoe]s?|contra|para|pra|a|vacinas?))*\s+"


def _int(value):
    from api.core.local_records_interpreter import NUMBERS
    return NUMBERS[value] if value in NUMBERS else int(value)


def interpret_operational_items(text):
    """Extrai vários acontecimentos de uma mesma mensagem (ex.: áudio).

    Retorna [] quando nenhum padrão conhecido aparece, para o chamador cair no
    formato único + Gemini. Cada item ainda passa pela validação do serviço.
    """
    plain = _plain(" ".join(str(text or "").split()))
    plain, rejected_event = _without_ambiguous_clauses(plain)
    plain = _without_date_phrases(plain)
    items = []
    # Doses aplicadas saem do estoque de vacinas da unidade.
    for m in re.finditer(r"\b(?:apliquei|aplicamos|aplicou|aplicaram|foram aplicad[ao]s)\s+(?:hoje\s+)?" + _N +
                         r"\s+doses?" + _CONNECT + _VACCINE, plain):
        items.append((m.start(), {"tipo": "vacinacao", "payload": {
            "nome_vacina": m.group(2).replace("covid19", "covid-19"), "qtd_doses": _int(m.group(1)), "tipo_movimentacao": "saida"}}))
    moves = re.sub(r"\b(?:recebi|recebemos|chegaram)\s+(?:(?:hoje|ontem)\s+)?", "entrada de ", plain)
    moves = re.sub(r"\b(?:retirei|retiramos|utilizei|utilizamos)\s+(?:(?:hoje|ontem)\s+)?", "saida de ", moves)
    for m in re.finditer(r"\b(entrada|saida)\s+(?:de\s+)?" + _N + r"\s+doses?" + _CONNECT + _VACCINE, moves):
        items.append((m.start(), {"tipo": "vacinacao", "payload": {
            "nome_vacina": m.group(3).replace("covid19", "covid-19"), "qtd_doses": _int(m.group(2)), "tipo_movimentacao": m.group(1)}}))
    for m in re.finditer(r"\b(uti|enfermaria|pediatria|obstetricia|isolamento|clinico|cirurgico)\s*:?\s+(\d+)\s+leitos?\s+"
                         r"ocupados?\s+e\s+(\d+)\s+(?:leitos?\s+)?disponive(?:l|is)", plain):
        items.append((m.start(), {"tipo": "internacao", "payload": {"tipo_leito": m.group(1),
            "qtd_leitos_ocupados": int(m.group(2)), "qtd_leitos_disponiveis": int(m.group(3))}}))
    # Internações por dengue: contagem acumulativa, precisa citar dengue na mesma frase.
    for m in re.finditer(r"\b(?:(?:internamos|internei|internaram|foram internad[ao]s|(?:precis\w*|tivemos que|tive que|foi preciso|foi necessario)\s+internar)\s+"
                         + _N + r"(?:\s+(?:pessoas?|pacientes?))?|(?:tivemos|tive|teve|houve|registramos)\s+" + _N +
                         r"\s+internac(?:ao|oes))\b([^.;]{0,60})", plain):
        if "dengue" in m.group(3):
            items.append((m.start(), {"tipo": "internacao_dengue", "payload": {
                "qtd_internacoes": _int(m.group(1) or m.group(2))}}))
    if not items and rejected_event:
        fail(422, "input_ambiguo", "Descreva uma movimentação realizada ou a situação medida dos leitos, sem hipóteses ou aproximações.")
    return [item for _, item in sorted(items, key=lambda pair: pair[0])]


def operational_summary(draft):
    payload = draft["payload_proposto"]
    movement = {"entrada": "Entrada", "saida": "Saída"}.get(payload.get("tipo_movimentacao"))
    if draft["tipo"] == "vacinacao":
        return f"{movement} de {payload['qtd_doses']} doses de {payload['nome_vacina']}."
    if draft["tipo"] == "internacao_dengue":
        return f"{payload['qtd_internacoes']} internação(ões) por dengue."
    if draft["tipo"] == "medicamento":
        return (f"{movement} de {payload['qtd_embalagens']} embalagens de "
                f"{payload['nome_medicamento']} ({payload['concentracao']}, {payload['forma_farmaceutica']}).")
    return (f"{payload['tipo_leito']}: {payload['qtd_leitos_ocupados']} leitos ocupados e "
            f"{payload['qtd_leitos_disponiveis']} disponíveis.")
