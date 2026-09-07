import json
import logging
from concurrent.futures import ThreadPoolExecutor

from api.core import susbot_tools as draft


def events(caplog):
    return [json.loads(r.message) for r in caplog.records if r.name == draft._LOG.name]


def test_execucao_e_fallback_com_contagens(monkeypatch, caplog):
    monkeypatch.setattr(draft.db, 'get_estoque', lambda ibge: [])
    monkeypatch.setattr(draft.db, 'get_alertas', lambda *a, **kw: [])
    tools = draft.criar_susbot_tools('3513007')
    for nome, tabela in [('consultar_estoque', 'estoque'), ('consultar_alertas', 'alertas')]:
        caplog.clear()
        with caplog.at_level(logging.WARNING):
            result = tools[nome]()
        logs = events(caplog)
        assert [x['evento'] for x in logs] == ['clara_ferramenta_iniciada', 'clara_consulta_sem_resultado', 'clara_ferramenta_concluida']
        fallback = logs[1]
        assert fallback['ferramenta'] == nome
        assert fallback['tabela'] == tabela
        assert fallback['municipio_id_recebido'] == '3513007'
        assert fallback['ibge6_consultado'] == '351300'
        assert fallback['linhas_retornadas'] == fallback['linhas_apos_filtros'] == 0
        assert fallback['filtros_sql'] == {'ibge6': '351300'}
        assert result['encontrado'] is False
    assert draft._CONSULTA.get() is None


def test_epi_distingue_linhas_sql_de_filtro_municipal(monkeypatch, caplog):
    monkeypatch.setattr(draft.db, 'list_runs', lambda **kw: [{'ibge6': '355030'}])
    draft.criar_susbot_tools('351300')['consultar_epidemiologia']('SINAN', ano_ini=2024)
    fallback = next(x for x in events(caplog) if x['evento'] == 'clara_consulta_sem_resultado')
    assert fallback['linhas_retornadas'] == 1
    assert fallback['linhas_apos_filtros'] == 0
    assert fallback['filtros_sql'] == {'sistema': 'SINAN'}
    assert fallback['filtros_pos_consulta'] == {'ibge6': '351300', 'ano_ini': 2024}
    assert fallback['limite'] == 200


def test_contexto_isolado_e_limpo_em_erro(monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise RuntimeError('segredo-nao-registrar')
    monkeypatch.setattr(draft.db, 'get_alertas', fail)
    def call(ibge):
        try:
            draft.criar_susbot_tools(ibge)['consultar_alertas']()
        except RuntimeError:
            pass
        assert draft._CONSULTA.get() is None
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(call, ['351300', '355030']))
    logs = events(caplog)
    assert 'segredo-nao-registrar' not in caplog.text
    ids = {x['consulta_id'] for x in logs}
    assert len(ids) == 2
    for id in ids:
        assert len({x['ibge6_consultado'] for x in logs if x['consulta_id'] == id}) == 1
