"""Interpreta somente frases operacionais explícitas; nunca usa texto como SQL."""
import re
import unicodedata

from api.core.local_records_service import fail


def _plain(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c))


def _positive(value, field="quantidade"):
    number = int(value)
    if number <= 0:
        fail(422, "valor_invalido", f"{field.capitalize()} deve ser maior que zero.")
    return number


def interpret_operational_input(text):
    source = " ".join(str(text or "").split()).strip()
    plain = _plain(source)

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

    fail(422, "input_operacional_nao_reconhecido",
         "Informe uma movimentação de vacina ou medicamento, ou a situação atual dos leitos, no formato orientado.")


def operational_summary(draft):
    payload = draft["payload_proposto"]
    if draft["tipo"] == "vacinacao":
        return f"{payload['tipo_movimentacao'].capitalize()} de {payload['qtd_doses']} doses de {payload['nome_vacina']}."
    if draft["tipo"] == "medicamento":
        return (f"{payload['tipo_movimentacao'].capitalize()} de {payload['qtd_embalagens']} embalagens de "
                f"{payload['nome_medicamento']} ({payload['concentracao']}, {payload['forma_farmaceutica']}).")
    return (f"{payload['tipo_leito']}: {payload['qtd_leitos_ocupados']} leitos ocupados e "
            f"{payload['qtd_leitos_disponiveis']} disponíveis.")
