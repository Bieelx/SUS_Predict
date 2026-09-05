import { test, expect } from '@playwright/test';

const municipio = { ibge6: '351300', ibge7: '3513009', nome: 'Cotia', uf: 'SP' };
const meta = { fonte: 'Fixture de contrato', data_referencia: '2026-08-22', tabelas: ['tabela_verificada'] };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sus_predict_token', 'audit-test'));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const resource = url.pathname.split('/').at(-1);
    let json = {};
    if (resource === 'me') json = { id: 'audit-test', email: 'auditoria@example.test' };
    if (resource === 'municipios') json = { municipios: [municipio, { ibge6: '355030', nome: 'São Paulo', uf: 'SP' }] };
    if (resource === 'visao-geral') json = { meta, municipio: url.searchParams.get('ibge') === 'TODOS' ? { ...municipio, nome: 'São Paulo (estado)' } : municipio, kpis: { casos_notificados: 14, indice_risco_regional: 69.19, municipios_alerta_suprimento: null }, competencia: { competencia_referencia: '2025-12-01' } };
    if (resource === 'vacinacao') json = { meta, municipio, doses: { doses_aplicadas: 0 }, hospitalar_estadual: { custo_total: null }, limitacoes: [] };
    if (resource === 'ruptura') json = { meta, municipio, resumo: { itens_risco_alto_atual: 3, periodo_inicio: '2025-01-01', periodo_fim: '2025-12-01' }, serie_mensal: [{ insumo_padronizado: 'DIPIRONA', unidade_fornecimento: 'FRASCO', competencia: '2025-12-01', quantidade_adquirida: 0, valor_adquirido: 0 }], alertas: [] };
    if (resource === 'internacoes') json = { meta, estabelecimentos: [{ cnes: '123', nome_hospital: 'Hospital Alfa' }, { cnes: '456', nome_hospital: 'Hospital Beta' }], consolidado: { internacoes_atual: 0 }, hospitais: [], municipios: [], faixa_etaria: [] };
    return route.fulfill({ json });
  });
});

test('visão geral tem um único filtro territorial e não transforma índice em percentual', async ({ page }) => {
  await page.goto('/visao-geral');
  await expect(page.getByText('69,19', { exact: true })).toBeVisible();
  await expect(page.getByText('69,19%', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(2); // território + comparativo
  await page.getByLabel('Município em análise').selectOption('TODOS');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('São Paulo (estado)');
  await page.getByText('Ver tabelas de origem').click();
  await expect(page.getByText('tabela_verificada')).toBeVisible();
});

test('nulos, funções não integradas e série antes não utilizada são explícitos', async ({ page }) => {
  await page.goto('/vacinacao');
  await expect(page.getByText('Não informado', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/R\$\s*0,00/)).toHaveCount(0);
  await expect(page.getByText('0', { exact: true }).first()).toBeVisible();
  await page.goto('/documentos');
  await expect(page.getByText('Histórico de documentos ainda não integrado')).toBeVisible();
  await page.goto('/insumos');
  await expect(page.getByRole('heading', { name: 'Histórico de aquisições por insumo' })).toBeVisible();
  await expect(page.getByLabel('Insumo e apresentação')).toHaveValue(JSON.stringify(['DIPIRONA', 'FRASCO']));
  await page.goto('/alertas');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Central de Alertas');
  await expect(page.getByLabel('Período', { exact: true })).toHaveCount(0);
});

test('resposta atrasada de outro município não substitui a seleção atual', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let started;
  const first = new Promise(resolve => { started = resolve; });
  await page.route('**/api/dados/visao-geral?*', async route => {
    const ibge = new URL(route.request().url()).searchParams.get('ibge');
    if (ibge === '351300') { started(); await gate; }
    await route.fulfill({ json: { meta, municipio: { ...municipio, nome: ibge === '351300' ? 'Cotia' : 'São Paulo' }, kpis: { casos_notificados: ibge === '351300' ? 14 : 9876 } } });
  });
  await page.goto('/visao-geral');
  await first;
  await page.getByLabel('Município em análise').selectOption('355030');
  await expect(page.getByText('9.876', { exact: true })).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.url().includes('visao-geral?ibge=351300'));
  release();
  await oldResponse;
  // Flush the old fetch continuation, then assert the observable selection.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByText('9.876', { exact: true })).toBeVisible();
  await expect(page.getByText('14', { exact: true })).toHaveCount(0);
});

test('404 de estabelecimento mantém a mensagem correta do domínio', async ({ page }) => {
  await page.route('**/api/dados/internacoes?*', route => route.fulfill({ status: 404, json: { detail: 'Estabelecimento não encontrado na base SIH para o período selecionado' } }));
  await page.goto('/internacoes');
  await expect(page.getByRole('alert')).toContainText('Estabelecimento não encontrado');
  await expect(page.getByText(/Atualize o servidor/)).toHaveCount(0);
});
