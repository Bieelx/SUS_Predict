import json
import logging
import urllib.request
from api.core.constants import CIDADES_FALLBACK, ESTADOS_FALLBACK

log = logging.getLogger("sus_predict.ibge")

_ESTADOS_LOCAL: list[tuple[str, str]] = [
    ("AC","Acre"),("AL","Alagoas"),("AM","Amazonas"),("AP","Amapá"),
    ("BA","Bahia"),("CE","Ceará"),("DF","Distrito Federal"),("ES","Espírito Santo"),
    ("GO","Goiás"),("MA","Maranhão"),("MG","Minas Gerais"),("MS","Mato Grosso do Sul"),
    ("MT","Mato Grosso"),("PA","Pará"),("PB","Paraíba"),("PE","Pernambuco"),
    ("PI","Piauí"),("PR","Paraná"),("RJ","Rio de Janeiro"),("RN","Rio Grande do Norte"),
    ("RO","Rondônia"),("RR","Roraima"),("RS","Rio Grande do Sul"),("SC","Santa Catarina"),
    ("SE","Sergipe"),("SP","São Paulo"),("TO","Tocantins"),
]

_MUNICIPIOS_CACHE: dict[str, list[dict]] = {}


def get_estados() -> list[dict]:
    return [{"sigla": s, "nome": n} for s, n in _ESTADOS_LOCAL]


def buscar_municipios(uf: str) -> list[dict]:
    """
    Returns all municipalities for a state as [{nome, ibge}].
    Primary: IBGE API (full 5570-city list, sorted by name).
    Fallback: CIDADES_FALLBACK (hardcoded subset).
    Results are cached in-memory per server session.
    """
    uf = uf.upper()
    if uf in _MUNICIPIOS_CACHE:
        return _MUNICIPIOS_CACHE[uf]

    url = f"https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios?orderBy=nome"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SUSPredict/2.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
        resultado = [{"nome": m["nome"], "ibge": str(m["id"])} for m in dados]
        _MUNICIPIOS_CACHE[uf] = resultado
        log.info(f"IBGE: {len(resultado)} municípios carregados para {uf}")
        return resultado
    except Exception as exc:
        log.warning(f"IBGE API falhou para {uf} ({exc}) — usando fallback")
        fallback = [{"nome": n, "ibge": c} for n, c in CIDADES_FALLBACK.get(uf, [])]
        return fallback
