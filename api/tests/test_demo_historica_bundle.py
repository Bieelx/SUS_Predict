import json
from pathlib import Path

from api.core.demo_crise_historica import calcular_replay, carregar_dataset
from scripts.gerar_demo_historica_frontend import gerar


def test_bundle_frontend_corresponde_ao_motor():
    path = Path(__file__).resolve().parents[2] / 'frontend/src/demo/replay.json'
    assert json.loads(path.read_text()) == gerar()


def test_previsao_nao_muda_quando_o_futuro_observado_muda(monkeypatch):
    antes = calcular_replay('2024-03')
    dataset = carregar_dataset()
    for item in dataset['serie_mensal']:
        if item['mes'] > '2024-03':
            item['casos'] = 999999
    monkeypatch.setattr('api.core.demo_crise_historica.carregar_dataset', lambda: dataset)
    depois = calcular_replay('2024-03')
    for chave in ['previsao', 'insumos', 'alertas', 'prova_valor']:
        assert antes[chave] == depois[chave]
