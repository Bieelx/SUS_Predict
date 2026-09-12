"""Casos de uso transacionais da Clara; nenhum SQL fornecido por usuário/LLM."""
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
import unicodedata
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from api.core.local_records_models import RegistroValores


def fail(status, code, message, **extra):
    raise HTTPException(status, {"codigo": code, "mensagem": message, **extra})


def decode(value):
    return json.loads(value) if isinstance(value, str) else value


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def normalized(value):
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def now():
    return datetime.now(timezone.utc).isoformat()


def capabilities(role):
    return {"registrar": True, "revisar": role in {"revisor", "gestor_unidade"},
            "consolidar": role == "gestor_unidade"}


class LocalRecords:
    def __init__(self, store, access_loader):
        self.store, self.access_loader = store, access_loader

    def access(self, tx, actor):
        # Respeita desativação local já usada pelo restante do produto e cadastro
        # remoto dentro da mesma transação. Nunca provisiona permissões aqui.
        access = self.access_loader(actor)
        row = tx.one("SELECT * FROM usuarios_acesso WHERE usuario=?", (actor,))
        if not row or not row["ativo"]:
            fail(403, "acesso_negado", "Acesso não autorizado.")
        return access, row

    def authorize(self, tx, actor, unit, review=False, summary=False):
        unit_row = tx.lock_unit(str(unit))
        access, remote = self.access(tx, actor)
        link = tx.one("SELECT * FROM local_usuarios_unidades WHERE usuario=? AND unidade_id=?",
                      (actor, str(unit)))
        if not unit_row or not unit_row["ativa"] or not link or not link["ativo"]:
            fail(403, "unidade_nao_autorizada", "Você não tem acesso ativo a esta unidade.")
        # Admin administra vínculos, mas para operar também precisa de vínculo.
        cities = tuple(decode(remote["municipios"]))
        if unit_row["ibge6"] not in access.municipios and not (access.perfil == "admin" and "*" in access.municipios):
            fail(403, "municipio_nao_autorizado", "Município não autorizado.")
        if unit_row["ibge6"] not in cities and not (remote["perfil"] == "admin" and "*" in cities):
            fail(403, "municipio_nao_autorizado", "Município não autorizado.")
        caps = capabilities(link["papel"])
        if review and not caps["revisar"] or summary and not caps["consolidar"]:
            fail(403, "papel_insuficiente", "Seu papel nesta unidade não permite esta operação.")
        return unit_row, link, caps

    def units(self, actor):
        with self.store.transaction() as tx:
            self.access(tx, actor)
            rows = tx.all("SELECT u.* FROM local_unidades_saude u JOIN local_usuarios_unidades l "
                          "ON l.unidade_id=u.id WHERE l.usuario=? AND l.ativo=true AND u.ativa=true ORDER BY u.nome", (actor,))
            result = []
            for row in rows:
                try:
                    _, link, caps = self.authorize(tx, actor, row["id"])
                except HTTPException as exc:
                    if exc.status_code == 403:
                        continue
                    raise
                result.append({**row, "papel": link["papel"], "capacidades": caps})
            return {"itens": result, "origem": "registros_unidade"}

    def catalog(self, actor, unit):
        with self.store.transaction() as tx:
            self.authorize(tx, actor, unit)
            items = tx.all("SELECT * FROM local_indicadores WHERE ativo=true ORDER BY codigo")
            for item in items:
                item["dimensoes"] = tx.all("SELECT * FROM local_indicador_dimensoes WHERE indicador_id=? AND ativa=true ORDER BY ordem", (item["id"],))
                for dim in item["dimensoes"]:
                    dim["valores_permitidos"] = decode(dim["valores_permitidos"])
            return {"itens": items}

    def validate(self, tx, indicator, values, strict=False):
        indicator_row = tx.one("SELECT * FROM local_indicadores WHERE codigo=? AND ativo=true", (indicator,))
        if not indicator_row:
            fail(422, "indicador_invalido", "Indicador indisponível no catálogo.")
        try:
            value = RegistroValores.model_validate(values).model_dump(mode="json")
        except ValidationError:
            fail(422, "campos_invalidos", "Quantidade, período ou dimensões inválidos.")
        pending = []
        for key in ("periodo_inicio", "periodo_fim", "valor"):
            if value[key] is None:
                pending.append(key)
        start, end = value["periodo_inicio"], value["periodo_fim"]
        if start and end and start != end:
            fail(422, "periodo_invalido", "O piloto aceita somente fechamento diário.")
        if value["valor"] is not None:
            amount = Decimal(str(value["valor"]))
            if amount != amount.to_integral_value() or amount < Decimal(str(indicator_row["valor_minimo"])):
                fail(422, "valor_invalido", "Informe uma quantidade inteira não negativa.")
            if amount == 0 and not indicator_row["aceita_zero"]:
                fail(422, "valor_invalido", "Este indicador não aceita zero.")
            if indicator_row["valor_maximo"] is not None and amount > Decimal(str(indicator_row["valor_maximo"])):
                fail(422, "valor_invalido", "Quantidade acima do limite do indicador.")
            value["valor"] = str(int(amount))
        dims = tx.all("SELECT * FROM local_indicador_dimensoes WHERE indicador_id=? AND ativa=true", (indicator_row["id"],))
        allowed = {d["codigo"]: d for d in dims}
        if set(value["dimensoes"]) - set(allowed):
            fail(422, "dimensao_invalida", "Dimensão não prevista no catálogo.")
        for key, val in list(value["dimensoes"].items()):
            definition = allowed[key]
            if definition["tipo_dado"] != "texto" or not isinstance(val, str) or not val.strip():
                fail(422, "dimensao_invalida", "Informe um texto válido para a dimensão.")
            val = normalized(val)
            options = decode(definition["valores_permitidos"])
            if options is not None and val not in options:
                fail(422, "dimensao_invalida", "Valor não aceito no catálogo.", campo=key)
            value["dimensoes"][key] = val
        for dim in dims:
            if dim["obrigatoria"] and dim["codigo"] not in value["dimensoes"]:
                pending.append("dimensoes." + dim["codigo"])
        if strict and pending:
            fail(422, "campos_pendentes", "Complete os campos antes de confirmar.", campos=pending)
        return indicator_row, value, pending

    def create_report(self, actor, unit, text, event_id, proposals, conversation=None,
                      channel="web", input_type="texto"):
        fingerprint = digest({"unidade": str(unit), "texto": text, "conversa": conversation,
                              "canal": channel, "tipo": input_type})
        with self.store.transaction() as tx:
            self.authorize(tx, actor, unit)
            existing = tx.one("SELECT * FROM local_relatos WHERE usuario=? AND canal=? AND external_event_id=?",
                              (actor, channel, event_id))
            if existing:
                if existing["request_hash"] != fingerprint:
                    fail(409, "idempotencia_conflitante", "Esta chave já foi usada para outro relato.")
                return self._report(tx, existing)
            if not proposals or len(proposals) > 20:
                fail(422, "relato_sem_indicadores", "Não identifiquei um indicador do piloto. Informe o que aconteceu e a quantidade.")
            report = str(uuid4())
            tx.execute("INSERT INTO local_relatos (id,unidade_id,usuario,canal,external_event_id,conversa_id,tipo_entrada,texto_original,transcricao,status,request_hash,recebido_em,atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (report, str(unit), actor, channel, event_id, conversation, input_type,
                        text if input_type == "texto" else None, text if input_type == "audio" else None,
                        "aguardando_confirmacao", fingerprint, now(), now()))
            for index, proposal in enumerate(proposals, 1):
                indicator, values, pending = self.validate(tx, proposal["indicador"], {k: v for k, v in proposal.items() if k != "indicador"})
                record = str(uuid4())
                tx.execute("INSERT INTO local_registros (id,relato_id,item_relato,unidade_id,indicador_id,criado_por,criado_em) VALUES (?,?,?,?,?,?,?)",
                           (record, report, index, str(unit), indicator["id"], actor, now()))
                self._version(tx, record, 1, values, "rascunho", actor, "", "criacao", fingerprint, indicator, pending, True)
            return self._report(tx, tx.one("SELECT * FROM local_relatos WHERE id=?", (report,)))

    def _report(self, tx, report):
        rows = tx.all("SELECT id FROM local_registros WHERE relato_id=? ORDER BY item_relato", (report["id"],))
        return {"relato_id": report["id"], "unidade_id": report["unidade_id"], "status": report["status"],
                "registros": [self._detail(tx, r["id"]) for r in rows], "origem": "registros_unidade"}

    def _version(self, tx, record, number, values, status, actor, reason, operation, request_hash, indicator, pending, current, key=None):
        tx.execute("INSERT INTO local_registro_versoes (id,registro_id,numero_versao,periodo_inicio,periodo_fim,valor,dimensoes,chave_fechamento,status,vigente,criada_por,confirmada_por,motivo_alteracao,criada_em,confirmada_em,operacao_id,request_hash,pendencias,versao_definicao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (str(uuid4()), record, number, values.get("periodo_inicio"), values.get("periodo_fim"), values.get("valor"),
                    canonical(values.get("dimensoes", {})), key, status, current, actor,
                    actor if status == "confirmado" else None, reason, now(), now() if status == "confirmado" else None,
                    operation, request_hash, canonical(pending), indicator["versao_definicao"]))

    def _detail(self, tx, record):
        row = tx.one("SELECT r.*, i.codigo AS indicador, i.nome AS indicador_nome, i.unidade_medida "
                     "FROM local_registros r JOIN local_indicadores i ON i.id=r.indicador_id WHERE r.id=?", (record,))
        versions = tx.all("SELECT * FROM local_registro_versoes WHERE registro_id=? ORDER BY numero_versao", (record,))
        for v in versions:
            v["dimensoes"], v["pendencias"] = decode(v["dimensoes"]), decode(v["pendencias"])
            v.pop("request_hash", None)
            v.pop("operacao_id", None)
        row["versoes"] = versions
        row["atual"] = versions[-1]
        row["confirmada_vigente"] = next((v for v in versions if v["vigente"] and v["status"] == "confirmado"), None)
        row["origem"] = "registros_unidade"
        return row

    def _record_access(self, tx, actor, record, review=False):
        row = tx.one("SELECT * FROM local_registros WHERE id=?", (record,))
        if not row:
            fail(404, "nao_encontrado", "Registro não encontrado.")
        _, link, caps = self.authorize(tx, actor, row["unidade_id"], review=review)
        if link["papel"] == "registrador" and row["criado_por"] != actor:
            fail(403, "acesso_negado", "Registro não autorizado.")
        return row, caps

    def detail(self, actor, record):
        with self.store.transaction() as tx:
            _, caps = self._record_access(tx, actor, record)
            detail = self._detail(tx, record)
            report = tx.one("SELECT * FROM local_relatos WHERE id=?", (detail["relato_id"],))
            detail["relato"] = {k: report[k] for k in ("id", "usuario", "canal", "conversa_id", "texto_original", "transcricao", "recebido_em", "status")}
            detail["capacidades"] = caps
            return detail

    def mutate(self, actor, record, action, request):
        data = request.model_dump(mode="json")
        fingerprint = digest({"acao": action, "dados": data})
        operation = data["chave_idempotencia"]
        with self.store.transaction() as tx:
            row, caps = self._record_access(tx, actor, record, review=action in {"confirmar", "corrigir", "cancelar", "rejeitar"})
            replay = tx.one("SELECT * FROM local_registro_versoes WHERE registro_id=? AND criada_por=? AND operacao_id=?",
                            (record, actor, operation))
            if replay:
                if replay["request_hash"] != fingerprint:
                    fail(409, "idempotencia_conflitante", "Esta chave já foi usada para outra operação.")
                return {**self._detail(tx, record), "replay": True, "versao_resultado": replay["numero_versao"]}
            detail = self._detail(tx, record)
            latest = detail["atual"]
            effective = detail["confirmada_vigente"]
            if latest["numero_versao"] != data["versao_esperada"]:
                fail(409, "versao_desatualizada", "O registro mudou. Revise a versão atual.")
            reason = data.get("motivo", "").strip()
            if action in {"corrigir", "cancelar"} and not reason:
                fail(422, "motivo_obrigatorio", "Informe o motivo da alteração.")
            status = latest["status"]
            if action in {"editar", "confirmar", "rejeitar"} and status != "rascunho":
                fail(409, "estado_invalido", "Esta operação exige um rascunho.")
            if action == "corrigir" and (not effective or status == "rascunho"):
                fail(409, "estado_invalido", "Abra a correção de um confirmado sem rascunho pendente.")
            if action == "cancelar" and not effective:
                fail(409, "estado_invalido", "Somente registros confirmados podem ser cancelados.")
            if action == "editar" and not caps["revisar"] and (row["criado_por"] != actor or effective):
                fail(403, "papel_insuficiente", "Você só pode editar seu rascunho inicial.")
            values = ({k: data[k] for k in ("periodo_inicio", "periodo_fim", "valor", "dimensoes")}
                      if action in {"editar", "corrigir"} else {k: latest[k] for k in ("periodo_inicio", "periodo_fim", "valor", "dimensoes")})
            if action == "confirmar":
                for key in ("periodo_inicio", "periodo_fim", "valor", "dimensoes"):
                    if key in request.model_fields_set:
                        values[key] = data[key]
            row_indicator = detail["indicador"]
            if action in {"cancelar", "rejeitar"}:
                # Desativar catálogo impede novas medições, não o encerramento
                # de uma informação existente. Usa conteúdo histórico intacto.
                base = effective if action == "cancelar" else latest
                values = {k: base[k] for k in ("periodo_inicio", "periodo_fim", "valor", "dimensoes")}
                pending = base["pendencias"]
                indicator = {"versao_definicao": base["versao_definicao"]}
            else:
                indicator, values, pending = self.validate(tx, row_indicator, values, strict=action == "confirmar")
            if effective and action == "editar":
                reason = reason or latest["motivo_alteracao"]
            if effective and action == "confirmar":
                reason = reason or latest["motivo_alteracao"]
                if not reason:
                    fail(422, "motivo_obrigatorio", "Informe o motivo da correção.")
            new_status = {"editar": "rascunho", "corrigir": "rascunho", "confirmar": "confirmado",
                          "rejeitar": "rejeitado", "cancelar": "cancelado"}[action]
            key = None
            if action == "confirmar":
                key = digest({"unidade": str(row["unidade_id"]), "indicador": row_indicator,
                              "inicio": values["periodo_inicio"], "fim": values["periodo_fim"], "dimensoes": values["dimensoes"]})
                others = tx.all("SELECT v.*,r.id AS outro_id FROM local_registro_versoes v JOIN local_registros r ON r.id=v.registro_id "
                                "WHERE r.unidade_id=? AND r.indicador_id=? AND r.id<>? AND v.vigente=true AND v.status='confirmado' "
                                "AND v.periodo_inicio<=? AND v.periodo_fim>=?",
                                (str(row["unidade_id"]), str(row["indicador_id"]), record, values["periodo_fim"], values["periodo_inicio"]))
                for other in others:
                    dims = decode(other["dimensoes"])
                    shared = set(dims) & set(values["dimensoes"])
                    if all(dims[k] == values["dimensoes"][k] for k in shared):
                        fail(409, "possivel_duplicidade", "Já existe fechamento possivelmente sobreposto. Revise ou corrija o registro existente.", registro_id=str(other["outro_id"]))
            # Um rascunho de correção não retira o confirmado dos totais.
            preserve_effective = bool(effective and new_status in {"rascunho", "rejeitado"})
            if not preserve_effective:
                tx.execute("UPDATE local_registro_versoes SET vigente=false WHERE registro_id=? AND vigente=true", (record,))
            self._version(tx, record, latest["numero_versao"] + 1, values, new_status, actor,
                          reason, operation, fingerprint, indicator, pending, not preserve_effective, key)
            # Relato resolvido somente quando nenhum item possuir rascunho atual.
            states = tx.all("SELECT v.status FROM local_registros r JOIN local_registro_versoes v ON v.registro_id=r.id "
                            "WHERE r.relato_id=? AND v.numero_versao=(SELECT MAX(x.numero_versao) FROM local_registro_versoes x WHERE x.registro_id=r.id)", (row["relato_id"],))
            has_confirmed = tx.one("SELECT v.id FROM local_registro_versoes v JOIN local_registros r ON r.id=v.registro_id WHERE r.relato_id=? AND v.status='confirmado' AND v.vigente=true LIMIT 1", (row["relato_id"],))
            report_status = "aguardando_confirmacao" if any(s["status"] == "rascunho" for s in states) else "confirmado" if has_confirmed else "rejeitado"
            tx.execute("UPDATE local_relatos SET status=?,atualizado_em=? WHERE id=?", (report_status, now(), row["relato_id"]))
            return {**self._detail(tx, record), "replay": False, "versao_resultado": latest["numero_versao"] + 1}

    def listing(self, actor, unit, start, end, tab="confirmados", indicator=None, page=1, size=30):
        if end < start:
            fail(422, "periodo_invalido", "Período final anterior ao inicial.")
        with self.store.transaction() as tx:
            _, link, caps = self.authorize(tx, actor, unit)
            # Rascunhos sem data devem continuar descobríveis para revisão.
            query = "SELECT r.id FROM local_registros r JOIN local_indicadores i ON i.id=r.indicador_id JOIN local_registro_versoes v ON v.registro_id=r.id WHERE r.unidade_id=?"
            params = [str(unit)]
            if link["papel"] == "registrador":
                query += " AND r.criado_por=?"
                params.append(actor)
            if indicator:
                query += " AND i.codigo=?"
                params.append(indicator)
            if tab == "confirmados":
                query += " AND v.vigente=true AND v.status='confirmado'"
            else:
                query += " AND v.numero_versao=(SELECT MAX(x.numero_versao) FROM local_registro_versoes x WHERE x.registro_id=r.id)"
                if tab == "pendentes":
                    query += " AND v.status='rascunho'"
            query += " AND (v.periodo_inicio IS NULL OR v.periodo_inicio<=?) AND (v.periodo_fim IS NULL OR v.periodo_fim>=?) ORDER BY r.criado_em DESC,r.id"
            params += [str(end), str(start)]
            rows = tx.all(query + " LIMIT ? OFFSET ?", (*params, size + 1, (page - 1) * size))
            details = [self._detail(tx, str(r["id"])) for r in rows[:size]]
            return {"itens": details, "proxima_pagina": page + 1 if len(rows) > size else None,
                    "capacidades": caps, "origem": "registros_unidade"}

    def summary(self, actor, unit, start, end):
        if end < start:
            fail(422, "periodo_invalido", "Período final anterior ao inicial.")
        with self.store.transaction() as tx:
            self.authorize(tx, actor, unit, summary=True)
            rows = tx.all("SELECT i.codigo,i.nome,i.unidade_medida,v.valor,v.dimensoes FROM local_registro_versoes v "
                          "JOIN local_registros r ON r.id=v.registro_id JOIN local_indicadores i ON i.id=r.indicador_id "
                          "WHERE r.unidade_id=? AND v.vigente=true AND v.status='confirmado' AND v.periodo_inicio>=? AND v.periodo_fim<=?",
                          (str(unit), str(start), str(end)))
            groups = {}
            for row in rows:
                dims = decode(row["dimensoes"])
                key = (row["codigo"], canonical(dims))
                item = groups.setdefault(key, {"indicador": row["codigo"], "nome": row["nome"], "unidade_medida": row["unidade_medida"],
                                              "dimensoes": dims, "valor": Decimal(0), "quantidade_unidades_cobertas": 1})
                item["valor"] += Decimal(str(row["valor"]))
            return {"itens": [{**g, "valor": str(g["valor"])} for g in groups.values()],
                    "periodo_inicio": str(start), "periodo_fim": str(end), "unidade_id": str(unit), "origem": "registros_unidade"}

    def create_unit(self, actor, data):
        with self.store.transaction() as tx:
            access, remote = self.access(tx, actor)
            if access.perfil != "admin" or remote["perfil"] != "admin":
                fail(403, "admin_obrigatorio", "Somente administradores gerenciam unidades.")
            unit = str(uuid4())
            tx.execute("INSERT INTO local_unidades_saude (id,cnes,nome,tipo_unidade,ibge6,uf,ativa,criada_em,atualizada_em) VALUES (?,?,?,?,?,?,true,?,?)",
                       (unit, data.cnes, data.nome, data.tipo_unidade, data.ibge6, data.uf, now(), now()))
            return tx.one("SELECT * FROM local_unidades_saude WHERE id=?", (unit,))

    def link_user(self, actor, unit, data):
        with self.store.transaction() as tx:
            unit_row = tx.lock_unit(str(unit))
            access, remote = self.access(tx, actor)
            if access.perfil != "admin" or remote["perfil"] != "admin":
                fail(403, "admin_obrigatorio", "Somente administradores gerenciam vínculos.")
            if not unit_row:
                fail(404, "nao_encontrado", "Unidade não encontrada.")
            if not tx.one("SELECT usuario FROM usuarios_acesso WHERE usuario=?", (data.usuario,)):
                fail(422, "usuario_invalido", "Usuário não cadastrado no controle de acesso.")
            tx.execute("INSERT INTO local_usuarios_unidades (usuario,unidade_id,papel,ativo,atribuido_por,criado_em,atualizado_em) VALUES (?,?,?,?,?,?,?) "
                       "ON CONFLICT(usuario,unidade_id) DO UPDATE SET papel=excluded.papel,ativo=excluded.ativo,atribuido_por=excluded.atribuido_por,atualizado_em=excluded.atualizado_em",
                       (data.usuario, str(unit), data.papel, data.ativo, actor, now(), now()))
            return {"usuario": data.usuario, "unidade_id": str(unit), "papel": data.papel, "ativo": data.ativo}
