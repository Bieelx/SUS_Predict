"""Rascunho e confirmação dos inputs que alimentam os triggers do time de dados."""
import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from api.core.local_records_service import decode, fail
from api.core.operational_inputs_interpreter import interpret_operational_input


def _now():
    return datetime.now(timezone.utc).isoformat()


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(value):
    return hashlib.sha256(_canonical(value).encode()).hexdigest()


class OperationalInputs:
    def __init__(self, store, access_loader):
        self.store, self.access_loader = store, access_loader

    def _access(self, tx, actor):
        try:
            UUID(str(actor))
        except ValueError:
            fail(403, "acesso_negado", "Identidade autenticada inválida para registrar operações.")
        local = self.access_loader(actor)
        remote = tx.one("SELECT * FROM usuarios_acesso WHERE usuario=?", (actor,))
        if not remote or not remote["ativo"]:
            fail(403, "acesso_negado", "Acesso não autorizado.")
        return local, remote

    def _establishment(self, tx, actor, establishment_id):
        local, remote = self._access(tx, actor)
        row = tx.one("SELECT e.*, b.nome_municipio FROM estabelecimentos e LEFT JOIN ibge_sp b "
                     "ON b.cod_sus=e.municipio_ibge6 WHERE e.id=?", (establishment_id,))
        if not row or not row.get("atende_sus"):
            fail(404, "estabelecimento_nao_encontrado", "Estabelecimento SUS não encontrado.")
        local_cities = tuple(local.municipios)
        remote_cities = tuple(decode(remote["municipios"]))
        local_admin = local.perfil == "admin" and "*" in local_cities
        remote_admin = remote["perfil"] == "admin" and "*" in remote_cities
        city = row["municipio_ibge6"]
        if not (local_admin or city in local_cities) or not (remote_admin or city in remote_cities):
            fail(403, "municipio_nao_autorizado", "Município do estabelecimento não autorizado.")
        return row

    def establishments(self, actor, search="", limit=50):
        with self.store.transaction() as tx:
            local, remote = self._access(tx, actor)
            local_cities, remote_cities = tuple(local.municipios), tuple(decode(remote["municipios"]))
            admin = local.perfil == "admin" and "*" in local_cities and remote["perfil"] == "admin" and "*" in remote_cities
            cities = sorted(set(local_cities) & set(remote_cities) - {"*"})
            if not admin and not cities:
                return {"itens": [], "origem": "estabelecimentos"}
            clauses, values = ["e.atende_sus=true"], []
            if not admin:
                clauses.append("e.municipio_ibge6 IN (" + ",".join("?" for _ in cities) + ")")
                values.extend(cities)
            if search.strip():
                clauses.append("(lower(e.no_fantasia) LIKE ? OR e.cnes LIKE ?)")
                term = "%" + search.strip().casefold() + "%"
                values.extend((term, term))
            values.append(min(max(int(limit), 1), 100))
            rows = tx.all("SELECT e.id,e.cnes,e.no_fantasia,e.no_municipio,e.municipio_ibge6,b.nome_municipio "
                          "FROM estabelecimentos e LEFT JOIN ibge_sp b ON b.cod_sus=e.municipio_ibge6 WHERE "
                          + " AND ".join(clauses) + " ORDER BY e.no_fantasia LIMIT ?", tuple(values))
            return {"itens": rows, "origem": "estabelecimentos"}

    def create_draft(self, actor, establishment_id, text, event_id):
        interpreted = interpret_operational_input(text)
        fingerprint = _hash({"estabelecimento": establishment_id, "texto": text})
        with self.store.transaction() as tx:
            establishment = self._establishment(tx, actor, establishment_id)
            existing = tx.one("SELECT * FROM clara_inputs_operacionais WHERE user_id=? AND chave_idempotencia=?",
                              (actor, event_id))
            if existing:
                if existing["request_hash"] != fingerprint:
                    fail(409, "idempotencia_conflitante", "Esta chave já foi usada para outro input.")
                return self._present(existing, establishment, replay=True)
            draft_id = str(uuid4())
            tx.execute("INSERT INTO clara_inputs_operacionais "
                       "(id,user_id,id_estabelecimento,tipo,texto_original,payload_proposto,status,versao,chave_idempotencia,request_hash,criado_em,atualizado_em) "
                       "VALUES (?,?,?,?,?,?,'rascunho',1,?,?,?,?)",
                       (draft_id, actor, establishment_id, interpreted["tipo"], text,
                        _canonical(interpreted["payload"]), event_id, fingerprint, _now(), _now()))
            row = tx.one("SELECT * FROM clara_inputs_operacionais WHERE id=?", (draft_id,))
            return self._present(row, establishment)

    def _draft(self, tx, actor, draft_id, lock=False):
        suffix = " FOR UPDATE" if lock and tx.postgres else ""
        row = tx.one("SELECT * FROM clara_inputs_operacionais WHERE id=?" + suffix, (draft_id,))
        if not row:
            fail(404, "rascunho_nao_encontrado", "Rascunho operacional não encontrado.")
        establishment = self._establishment(tx, actor, row["id_estabelecimento"])
        if row["user_id"] != actor:
            fail(403, "acesso_negado", "Este rascunho pertence a outro usuário.")
        return row, establishment

    def get(self, actor, draft_id):
        with self.store.transaction() as tx:
            row, establishment = self._draft(tx, actor, draft_id)
            return self._present(row, establishment)

    def list(self, actor, status="rascunho"):
        with self.store.transaction() as tx:
            self._access(tx, actor)
            rows = tx.all("SELECT * FROM clara_inputs_operacionais WHERE user_id=? AND status=? ORDER BY criado_em DESC LIMIT 100",
                          (actor, status))
            result = []
            for row in rows:
                establishment = self._establishment(tx, actor, row["id_estabelecimento"])
                result.append(self._present(row, establishment))
            return {"itens": result, "origem": "input_operacional"}

    def confirm(self, actor, draft_id, expected, operation_key, payload=None):
        with self.store.transaction() as tx:
            row, establishment = self._draft(tx, actor, draft_id, lock=True)
            proposed = decode(row["payload_proposto"])
            confirmed = payload or proposed
            operation_hash = _hash({"rascunho": draft_id, "payload": confirmed})
            if row["status"] == "confirmado" and row["operacao_chave"] == operation_key:
                if row["operacao_hash"] != operation_hash:
                    fail(409, "idempotencia_conflitante", "Esta chave já confirmou outro conteúdo.")
                return self._present(row, establishment, replay=True)
            if row["status"] != "rascunho" or row["versao"] != expected:
                fail(409, "versao_desatualizada", "Revise o estado atual antes de confirmar.")
            parsed = self._validated(row["tipo"], confirmed)
            parsed = self._target_payload(tx, establishment["id"], row["tipo"], parsed)
            table, target_id = self._insert_target(tx, actor, establishment["id"], row["tipo"], parsed)
            timestamp = _now()
            tx.execute("UPDATE clara_inputs_operacionais SET status='confirmado',payload_confirmado=?,operacao_chave=?,"
                       "operacao_hash=?,tabela_destino=?,registro_destino_id=?,confirmado_em=?,confirmado_por=?,atualizado_em=? WHERE id=?",
                       (_canonical(parsed), operation_key, operation_hash, table, target_id, timestamp, actor, timestamp, draft_id))
            return self._present(tx.one("SELECT * FROM clara_inputs_operacionais WHERE id=?", (draft_id,)), establishment)

    def reject(self, actor, draft_id, expected, operation_key, reason=""):
        with self.store.transaction() as tx:
            row, establishment = self._draft(tx, actor, draft_id, lock=True)
            if row["status"] != "rascunho" or row["versao"] != expected:
                fail(409, "versao_desatualizada", "Revise o estado atual antes de rejeitar.")
            timestamp = _now()
            tx.execute("UPDATE clara_inputs_operacionais SET status='rejeitado',operacao_chave=?,rejeitado_em=?,"
                       "rejeitado_por=?,motivo_rejeicao=?,atualizado_em=? WHERE id=?",
                       (operation_key, timestamp, actor, reason, timestamp, draft_id))
            return self._present(tx.one("SELECT * FROM clara_inputs_operacionais WHERE id=?", (draft_id,)), establishment)

    def _validated(self, kind, payload):
        if not isinstance(payload, dict):
            fail(422, "campos_invalidos", "Conteúdo operacional inválido.")
        expected = {
            "vacinacao": {"nome_vacina", "qtd_doses", "tipo_movimentacao"},
            "medicamento": {"nome_medicamento", "concentracao", "forma_farmaceutica", "tipo_embalagem",
                            "quantidade_por_embalagem", "qtd_embalagens", "tipo_movimentacao"},
            "internacao": {"tipo_leito", "qtd_leitos_ocupados", "qtd_leitos_disponiveis"},
        }[kind]
        if set(payload) != expected:
            fail(422, "campos_invalidos", "Revise todos os campos do input operacional.")
        for key, value in payload.items():
            if key.startswith("qtd_") or key == "quantidade_por_embalagem":
                if not isinstance(value, int) or isinstance(value, bool) or value < 0 or (kind != "internacao" and value == 0):
                    fail(422, "valor_invalido", "Quantidades operacionais inválidas.")
            elif not isinstance(value, str) or not value.strip() or len(value) > 200:
                fail(422, "campos_invalidos", "Textos operacionais inválidos.")
        if kind != "internacao" and payload["tipo_movimentacao"] not in {"entrada", "saida"}:
            fail(422, "campos_invalidos", "Movimentação deve ser entrada ou saída.")
        return payload

    def _target_payload(self, tx, establishment, kind, payload):
        """Reusa a grafia da chave consolidada para não criar saldos por caixa."""
        result = dict(payload)
        if kind == "vacinacao":
            current = tx.one("SELECT nome_vacina FROM vacinacao_estabelecimento WHERE id_estabelecimento=? "
                             "AND lower(nome_vacina)=lower(?)", (establishment, payload["nome_vacina"]))
            known = {"covid-19": "COVID-19", "dengue": "Dengue", "influenza": "Influenza",
                     "hepatite b": "Hepatite B", "febre amarela": "Febre Amarela"}
            result["nome_vacina"] = current["nome_vacina"] if current else known.get(
                payload["nome_vacina"].casefold(), payload["nome_vacina"].strip())
        elif kind == "medicamento":
            current = tx.one("SELECT * FROM medicamento_estabelecimento WHERE id_estabelecimento=? "
                             "AND lower(nome_medicamento)=lower(?) AND lower(concentracao)=lower(?) "
                             "AND lower(forma_farmaceutica)=lower(?) AND lower(tipo_embalagem)=lower(?) "
                             "AND quantidade_por_embalagem=?", (establishment, payload["nome_medicamento"],
                             payload["concentracao"], payload["forma_farmaceutica"], payload["tipo_embalagem"],
                             payload["quantidade_por_embalagem"]))
            for field in ("nome_medicamento", "concentracao", "forma_farmaceutica", "tipo_embalagem"):
                if current:
                    result[field] = current[field]
            if not current:
                result["nome_medicamento"] = result["nome_medicamento"].title()
        else:
            current = tx.one("SELECT tipo_leito FROM internacao_estabelecimento WHERE id_estabelecimento=? "
                             "AND lower(tipo_leito)=lower(?)", (establishment, payload["tipo_leito"]))
            result["tipo_leito"] = current["tipo_leito"] if current else (
                "UTI" if payload["tipo_leito"].casefold() == "uti" else payload["tipo_leito"].title())
        return result

    def _insert_target(self, tx, actor, establishment, kind, payload):
        timestamp = _now()
        if kind == "vacinacao":
            row = tx.one("INSERT INTO vacinacao_usuario (user_id,nome_vacina,qtd_doses,tipo_movimentacao,id_estabelecimento,data_atualizacao) "
                         "VALUES (?,?,?,?,?,?) RETURNING id", (actor, payload["nome_vacina"], payload["qtd_doses"],
                         payload["tipo_movimentacao"], establishment, timestamp))
            return "vacinacao_usuario", row["id"]
        if kind == "medicamento":
            row = tx.one("INSERT INTO medicamento_usuario (user_id,nome_medicamento,concentracao,forma_farmaceutica,"
                         "tipo_embalagem,quantidade_por_embalagem,qtd_embalagens,tipo_movimentacao,id_estabelecimento,data_atualizacao) "
                         "VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id", (actor, payload["nome_medicamento"], payload["concentracao"],
                         payload["forma_farmaceutica"], payload["tipo_embalagem"], payload["quantidade_por_embalagem"],
                         payload["qtd_embalagens"], payload["tipo_movimentacao"], establishment, timestamp))
            return "medicamento_usuario", row["id"]
        row = tx.one("INSERT INTO internacao_usuario (user_id,id_estabelecimento,tipo_leito,qtd_leitos_ocupados,"
                     "qtd_leitos_disponiveis,data_atualizacao) VALUES (?,?,?,?,?,?) RETURNING id",
                     (actor, establishment, payload["tipo_leito"], payload["qtd_leitos_ocupados"],
                      payload["qtd_leitos_disponiveis"], timestamp))
        return "internacao_usuario", row["id"]

    def _present(self, row, establishment, replay=False):
        return {**row, "payload_proposto": decode(row["payload_proposto"]),
                "payload_confirmado": decode(row.get("payload_confirmado")),
                "estabelecimento": {k: establishment.get(k) for k in
                    ("id", "cnes", "no_fantasia", "municipio_ibge6", "nome_municipio")},
                "replay": replay, "origem": "input_operacional"}
