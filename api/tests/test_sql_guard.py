from api.core.sql_guard import ALLOWLIST_TABELAS, validar_sql


def test_select_simples_valido():
    ok, motivo = validar_sql("SELECT item, quantidade_atual FROM estoque WHERE ibge6 = '355030'")

    assert ok is True
    assert motivo == ""


def test_select_com_join_entre_tabelas_permitidas_valido():
    ok, motivo = validar_sql(
        """
        SELECT a.tipo, a.status
        FROM alertas a
        JOIN estoque e ON e.ibge6 = a.ibge6
        WHERE a.ibge6 = '355030'
        """
    )

    assert ok is True
    assert motivo == ""


def test_insert_rejeitado():
    ok, motivo = validar_sql("INSERT INTO estoque (ibge6, item) VALUES ('1', 'x')")

    assert ok is False
    assert "select" in motivo.lower()


def test_update_rejeitado():
    ok, motivo = validar_sql("UPDATE estoque SET quantidade_atual = 0 WHERE ibge6 = '355030'")

    assert ok is False
    assert "select" in motivo.lower()


def test_delete_rejeitado():
    ok, motivo = validar_sql("DELETE FROM alertas WHERE ibge6 = '355030'")

    assert ok is False
    assert "select" in motivo.lower()


def test_drop_rejeitado():
    ok, motivo = validar_sql("DROP TABLE estoque")

    assert ok is False
    assert "select" in motivo.lower()


def test_tabela_fora_da_allowlist_rejeitada():
    ok, motivo = validar_sql("SELECT * FROM susbot_conversas")

    assert ok is False
    assert "não permitida" in motivo.lower() or "allowlist" in motivo.lower()


def test_multiplos_statements_rejeitados():
    ok, motivo = validar_sql("SELECT * FROM estoque; DELETE FROM estoque")

    assert ok is False
    assert "único statement" in motivo.lower()


def test_cte_escondendo_delete_rejeitada():
    ok, motivo = validar_sql(
        """
        WITH x AS (DELETE FROM estoque RETURNING *)
        SELECT * FROM x
        """
    )

    assert ok is False
    assert "select" in motivo.lower()


def test_subquery_com_tabela_nao_permitida_rejeitada():
    ok, motivo = validar_sql(
        """
        SELECT *
        FROM estoque
        WHERE ibge6 IN (SELECT usuario FROM susbot_conversas)
        """
    )

    assert ok is False
    assert "não permitida" in motivo.lower() or "allowlist" in motivo.lower()


def test_allowlist_exposta():
    assert "estoque" in ALLOWLIST_TABELAS
