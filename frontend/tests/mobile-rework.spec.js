import { expect, test, webkit } from '@playwright/test';

// Synthetic fixtures exercise layout only; they are never served by the app.
const municipio = { ibge6: '351300', nome: 'Cotia', uf: 'SP' };
const meta = { fonte: 'Supabase', data_referencia: '2026-08-15', tabelas: ['painel_risco_aquisicao_municipal'] };
const ruptura = {
  meta, municipio, competencia: { competencia_referencia: '2025-12-01' },
  resumo: { itens_risco_alto_atual: 310, itens_risco_alto_anterior: 280, itens_risco_moderado_atual: 124, valor_adquirido_atual: 1234567, casos_atual: 1030, periodo_inicio: '2025-01-01', periodo_fim: '2025-12-01' },
  resumo_mensal: Array.from({ length: 12 }, (_, i) => ({ competencia: `2025-${String(i + 1).padStart(2, '0')}-01`, itens_risco_alto: 15 + i, itens_risco_moderado: 8, total_casos_dengue: 100 + i })),
  serie_mensal: [],
  alertas: [{ insumo_padronizado: 'Solução fisiológica de cloreto de sódio 0,9% para uso intravenoso', unidade_fornecimento: 'Frasco de 500 ml', faixa_risco_aquisicao: 'ALTO', quantidade_adquirida: 12300, valor_adquirido: 120000, total_fornecedores: 3 }],
};
async function setup(page) {
  await page.addInitScript(() => localStorage.setItem('sus_predict_token', 'layout-test'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/auth/me') body = { id: 'layout', email: 'layout@dev.local', role: 'authenticated' };
    else if (path.endsWith('/municipios')) body = { municipios: [municipio, { ibge6: '355030', nome: 'São Paulo', uf: 'SP' }] };
    else if (path.endsWith('/ruptura')) body = ruptura;
    else if (path.endsWith('/visao-geral')) body = { meta, municipio, kpis: { casos_notificados: 1030, indice_risco_regional: 56, municipios_alerta_suprimento: 1, internacoes_sih: 240 }, serie: [], evolucao: [], alertas: [], mapa_mesorregiao: [], ruptura_categorias: [] };
    else if (path.endsWith('/epidemiologia')) body = { meta, municipio, casos: { casos_atual: 1030 }, incidencia: {}, taxa_hospitalizacao: {}, taxa_obito: {}, faixa_etaria: [], genero: [], desfecho_anual: [], distribuicao_cidades: [], sazonalidade: [] };
    else if (path.endsWith('/internacoes')) body = { meta, consolidado: { internacoes_atual: 240 }, permanencia: {}, mortalidade: {}, hospitais: [], municipios: [], faixa_etaria: [] };
    else if (path.endsWith('/vacinacao')) body = { meta, municipio, doses: {}, incidencia: {}, hospitalar_estadual: {}, faixa_etaria: [], comparativo_municipios: [], limitacoes: [] };
    else if (path.includes('/susbot/')) body = { itens: [], total: 0, pagina: 1 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
async function checkPages(page, browserName) {
  await setup(page);
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 780 });
    for (const path of ['insumos', 'visao-geral', 'alertas', 'epidemiologia', 'internacoes', 'vacinacao', 'documentos', 'configuracoes', 'perfil']) {
      await page.goto(`http://127.0.0.1:3000/${path}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('.loading-layout')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${browserName} ${width} ${path}`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('http://127.0.0.1:3000/insumos');
  await expect(page.getByText('310', { exact: true })).toBeVisible();
  await expect(page.locator('.app-main')).toHaveCSS('position', 'relative');
  await expect(page.locator('.app-content-scroll')).toHaveCSS('overflow-y', 'visible');
  const metric = await page.getByText('310', { exact: true }).boundingBox();
  expect(metric.y + metric.height).toBeLessThan(600);
  await page.screenshot({ path: `test-results/mobile-rework-${browserName}.png` });
  await page.locator('.source-mobile summary').click();
  await expect(page.locator('.source-mobile')).toContainText('painel_risco_aquisicao_municipal');
  await page.getByLabel('Território em análise').selectOption('355030');
  await expect(page.getByLabel('Território em análise')).toHaveValue('355030');
  await page.locator('.supply-table').scrollIntoViewIfNeeded();
  await expect(page.getByText('Frasco de 500 ml')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Visão', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Mais', exact: true }).click();
  await expect(page.locator('.mobile-more-sheet button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Mais', exact: true })).toBeFocused();
}
test('mobile populated routes, scrolling, territory and disclosure', async ({ page }) => {
  await checkPages(page, 'chromium');
});
test('WebKit mobile populated routes and touch layout', async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try { await checkPages(page, 'webkit'); } finally { await browser.close(); }
});
