"""Exporta os cortes calculados pelo motor histórico para a demo local da UI.

Execute da raiz: venv/bin/python scripts/gerar_demo_historica_frontend.py
Não consulta nem altera dados operacionais.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api.core.demo_crise_historica import calcular_replay, listar_cortes


def gerar():
    # O futuro observado só aparece ao avançar o corte, nunca nas previsões.
    estados = []
    for corte in listar_cortes()["cortes"]:
        estado = calcular_replay(corte["mes"])
        estado.pop("serie_futura_real", None)
        estados.append(estado)
    return estados


if __name__ == "__main__":
    destino = ROOT / "frontend/src/demo/replay.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(gerar(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"12 cortes exportados: {destino.relative_to(ROOT)}")
