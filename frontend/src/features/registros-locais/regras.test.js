import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptarResumo, aplicarParamsRegistros, estadoDaVersao, hojeOperacional, intervaloDoAtalho,
  lerParamsRegistros, normalizarRegistro, periodoValido, podeConsolidar, rotuloPendencia,
  somarDias, textoCobertura,
} from './regras.js';

// ─── Datas operacionais ──────────────────────────────────────────────────────

test('data operacional usa o fuso acordado e não retrocede por UTC', () => {
  // 23h30 em São Paulo ainda é o mesmo dia; em UTC já virou o dia seguinte.
  assert.equal(hojeOperacional(new Date('2026-09-12T23:30:00-03:00')), '2026-09-12');
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(somarDias('2026-10-18', 1), '2026-10-19');
});

test('período padrão são os últimos sete dias incluindo hoje', () => {
  assert.deepEqual(intervaloDoAtalho('7dias', '2026-09-12'), { inicio: '2026-09-06', fim: '2026-09-12' });
  assert.deepEqual(intervaloDoAtalho('hoje', '2026-09-12'), { inicio: '2026-09-12', fim: '2026-09-12' });
  assert.deepEqual(intervaloDoAtalho('mes', '2026-09-12'), { inicio: '2026-09-01', fim: '2026-09-12' });
  assert.equal(periodoValido({ inicio: '2026-09-13', fim: '2026-09-12' }), false);
});

// ─── Rota ────────────────────────────────────────────────────────────────────

test('parâmetros inválidos na URL não viram filtro', () => {
  const lido = lerParamsRegistros('?unidade=u-1&inicio=quinta&fim=2026-09-12&aba=inventada&indicador=doses_vacina_aplicadas', '2026-09-12');
  assert.equal(lido.unidade, 'u-1');
  assert.equal(lido.aba, 'confirmados');
  assert.equal(lido.atalho, '7dias');
  assert.equal(lido.indicador, 'doses_vacina_aplicadas');
  assert.ok(periodoValido(lido));
});

test('atalho é reconhecido pelo intervalo, não guardado na URL', () => {
  assert.equal(lerParamsRegistros('?inicio=2026-09-12&fim=2026-09-12', '2026-09-12').atalho, 'hoje');
  assert.equal(lerParamsRegistros('?inicio=2026-09-01&fim=2026-09-12', '2026-09-12').atalho, 'mes');
  assert.equal(lerParamsRegistros('?inicio=2026-08-30&fim=2026-09-02', '2026-09-12').atalho, 'personalizado');
});

test('sair da área remove os parâmetros desta tela da URL', () => {
  const url = new URL('https://app.local/registros-unidade?unidade=u-1&aba=pendentes&tipo=surto');
  aplicarParamsRegistros(url, null);
  assert.equal(url.search, '?tipo=surto');

  const outra = new URL('https://app.local/registros-unidade');
  aplicarParamsRegistros(outra, { unidade: 'u-2', inicio: '2026-09-06', fim: '2026-09-12', aba: 'pendentes' });
  assert.equal(outra.searchParams.get('unidade'), 'u-2');
  assert.equal(outra.searchParams.get('aba'), 'pendentes');
});

// ─── Normalização do payload do serviço ──────────────────────────────────────

const versao = (numero, status, valor, extra = {}) => ({
  numero_versao: numero, status, valor: valor == null ? null : String(valor),
  periodo_inicio: '2026-09-12', periodo_fim: '2026-09-12', dimensoes: { vacina: 'dengue' },
  vigente: extra.vigente ?? true, criada_por: extra.autor || 'ana',
  confirmada_por: status === 'confirmado' ? 'marcos' : null,
  confirmada_em: status === 'confirmado' ? '2026-09-12T18:40:00-03:00' : null,
  criada_em: '2026-09-12T18:20:00-03:00', motivo_alteracao: extra.motivo || null,
  pendencias: extra.pendencias || [],
});

const bruto = (versoes, capacidades = { registrar: true, revisar: true, consolidar: false }, criadoPor = 'ana') => ({
  id: 'reg-1', relato_id: 'rel-1', unidade_id: 'u-1', criado_por: criadoPor, criado_em: '2026-09-12T18:20:00-03:00',
  indicador: 'doses_vacina_aplicadas', indicador_nome: 'Doses aplicadas', unidade_medida: 'dose',
  versoes, atual: versoes[versoes.length - 1],
  confirmada_vigente: versoes.find(item => item.vigente && item.status === 'confirmado') || null,
  capacidades,
});

test('correção em elaboração não substitui o confirmado vigente', () => {
  const item = normalizarRegistro(bruto([
    versao(1, 'confirmado', 32),
    versao(2, 'rascunho', 30, { vigente: false, motivo: 'Recontagem' }),
  ]), { aba: 'confirmados' });
  assert.equal(item.valor, 32, 'a aba de confirmados mostra o valor que continua valendo');
  assert.equal(item.correcao_em_elaboracao, true);
  assert.equal(item.valor_confirmado_vigente, 32);
  // A mutação precisa da versão mais recente, não da exibida.
  assert.equal(item.versao_esperada, 2);
  assert.equal(item.numero_versao, 1);
});

test('ações vêm das capacidades do serviço e do estado da versão', () => {
  const rascunhoRevisor = normalizarRegistro(bruto([versao(1, 'rascunho', 14)]), { aba: 'pendentes' });
  assert.deepEqual(rascunhoRevisor.capacidades, { confirmar: true, rejeitar: true, editar_rascunho: true, corrigir: false, cancelar: false });

  const rascunhoRegistrador = normalizarRegistro(
    bruto([versao(1, 'rascunho', 14)], { registrar: true, revisar: false, consolidar: false }, 'ana'),
    { aba: 'pendentes', usuario: 'ana' },
  );
  assert.equal(rascunhoRegistrador.capacidades.confirmar, false, 'registrador não confirma');
  assert.equal(rascunhoRegistrador.capacidades.editar_rascunho, true, 'mas edita o rascunho que criou');

  const deOutraPessoa = normalizarRegistro(
    bruto([versao(1, 'rascunho', 14)], { registrar: true, revisar: false, consolidar: false }, 'bruno'),
    { aba: 'pendentes', usuario: 'ana' },
  );
  assert.equal(deOutraPessoa.capacidades.editar_rascunho, false);

  const confirmado = normalizarRegistro(bruto([versao(1, 'confirmado', 32)]), { aba: 'confirmados' });
  assert.equal(confirmado.capacidades.corrigir, true);
  assert.equal(confirmado.capacidades.cancelar, true);
  assert.equal(confirmado.capacidades.confirmar, false);
});

test('valor decimal em texto vira número e ausência continua ausente', () => {
  const semValor = normalizarRegistro(bruto([versao(1, 'rascunho', null)]), { aba: 'pendentes' });
  assert.equal(semValor.valor, null);
  const zero = normalizarRegistro(bruto([versao(1, 'confirmado', 0)]), { aba: 'confirmados' });
  assert.equal(zero.valor, 0, 'zero medido é valor, não ausência');
});

// ─── Resumo ──────────────────────────────────────────────────────────────────

test('total só é somado quando os grupos têm a mesma granularidade', () => {
  const [homogeneo, misturado] = adaptarResumo({
    itens: [
      { indicador: 'a', nome: 'Doses', unidade_medida: 'dose', dimensoes: { vacina: 'dengue' }, valor: '32', quantidade_unidades_cobertas: 1 },
      { indicador: 'a', nome: 'Doses', unidade_medida: 'dose', dimensoes: { vacina: 'influenza' }, valor: '10', quantidade_unidades_cobertas: 1 },
      { indicador: 'b', nome: 'Atendimentos', unidade_medida: 'atendimento', dimensoes: { doenca: 'dengue' }, valor: '8', quantidade_unidades_cobertas: 1 },
      { indicador: 'b', nome: 'Atendimentos', unidade_medida: 'atendimento', dimensoes: { doenca: 'dengue', origem: 'demanda' }, valor: '3', quantidade_unidades_cobertas: 1 },
    ],
  });
  assert.equal(homogeneo.total, 42, 'mesmas chaves de dimensão: soma segura');
  assert.equal(misturado.total, null, 'granularidades diferentes podem se sobrepor');
  assert.equal(misturado.grupos.length, 2);
});

test('zero medido aparece no resumo e indicador sem medição não entra', () => {
  const grupos = adaptarResumo({ itens: [{ indicador: 'a', nome: 'Atendimentos', unidade_medida: 'atendimento', dimensoes: {}, valor: '0', quantidade_unidades_cobertas: 1 }] });
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].total, 0);
  assert.deepEqual(adaptarResumo({ itens: [] }), []);
});

test('cobertura só é afirmada com contagem real de unidades', () => {
  assert.equal(textoCobertura(null), null);
  assert.equal(textoCobertura({ unidades_informaram: 5 }), 'Informado por 5 unidades participantes');
  assert.equal(textoCobertura({ unidades_informaram: 5, unidades_autorizadas: 8 }), '5 de 8 unidades autorizadas informaram');
});

test('consolidação depende de capacidade explícita', () => {
  assert.equal(podeConsolidar({ capacidades: { consolidar: true } }), true);
  assert.equal(podeConsolidar({ capacidades: { revisar: true } }), false);
  assert.equal(podeConsolidar(null), false);
});

// ─── Textos ──────────────────────────────────────────────────────────────────

test('estado desconhecido não vira confirmado', () => {
  assert.equal(estadoDaVersao('confirmado').rotulo, 'Confirmado');
  assert.equal(estadoDaVersao('rascunho').rotulo, 'Aguardando revisão');
  assert.equal(estadoDaVersao(undefined).rotulo, 'Estado não informado');
});

test('pendência do serviço vira instrução legível', () => {
  const catalogo = { indicadores: [{ codigo: 'doses_vacina_aplicadas', dimensoes: [{ codigo: 'vacina', nome: 'Vacina' }] }] };
  assert.equal(rotuloPendencia('valor', catalogo, 'doses_vacina_aplicadas'), 'Informe a quantidade.');
  assert.equal(rotuloPendencia('dimensoes.vacina', catalogo, 'doses_vacina_aplicadas'), 'Informe vacina.');
  assert.equal(rotuloPendencia('periodo_inicio', catalogo, 'doses_vacina_aplicadas'), 'Informe a data do fechamento.');
});
