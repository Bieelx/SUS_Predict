import sqlite3

from api.tests.susbot_seed_fixture import gerar_estoque_sintetico
from scripts.quarantine_legacy_demo import quarantine


def test_quarantine_preserves_real_rows_and_full_backup(tmp_path):
    path = tmp_path / 'source.sqlite'
    seed = gerar_estoque_sintetico('351300')[0]
    with sqlite3.connect(path) as con:
        con.execute('CREATE TABLE estoque (ibge6 TEXT, item TEXT, quantidade_atual REAL, consumo_medio_dia REAL, atualizado_em TEXT)')
        con.execute('CREATE TABLE alertas (ibge6 TEXT)')
        con.execute('INSERT INTO estoque VALUES (:ibge6, :item, :quantidade_atual, :consumo_medio_dia, :atualizado_em)', seed)
        con.execute('INSERT INTO estoque VALUES (?, ?, ?, ?, ?)', ('351300', 'Registro real', 17, 2, '2026-09-05'))
    assert quarantine(path, tmp_path)['matches']['estoque'] == 1
    with sqlite3.connect(path) as con:
        assert con.execute('SELECT COUNT(*) FROM estoque').fetchone()[0] == 2
    result = quarantine(path, tmp_path, apply=True)
    with sqlite3.connect(path) as con:
        assert con.execute('SELECT item FROM estoque').fetchall() == [('Registro real',)]
        assert con.execute('SELECT COUNT(*) FROM legacy_demo_quarantine').fetchone()[0] == 1
    with sqlite3.connect(result['backup']) as con:
        assert con.execute('SELECT COUNT(*) FROM estoque').fetchone()[0] == 2
    assert quarantine(path, tmp_path, apply=True)['matches']['estoque'] == 0
