import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sus_predict_token', 'beta-test'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    const municipio = { ibge6: '351300', nome: 'Cotia', uf: 'SP' };
    let body = {};
    if (path === '/api/auth/me') body = { id: 'beta-test', email: 'avaliacao@example.test' };
    if (path === '/api/dados/municipios') body = { municipios: [municipio] };
    if (path === '/api/dados/visao-geral') body = {
      municipio, meta: { fonte: 'Fixture de teste visual', dados_reais: false },
      kpis: { casos_notificados: 120, indice_risco_regional: 32, municipios_alerta_suprimento: 0, internacoes_sih: 48 },
      serie: [], evolucao: [], alertas: [],
    };
    if (path === '/api/dados/ruptura') body = { municipio, alertas: [], meta: { fonte: 'Fixture de teste' } };
    return route.fulfill({ json: body });
  });
});

test('beta mantém links, histórico e saída para a interface original', async ({ page }) => {
  await page.goto('/beta');
  await expect(page.locator('.beta-app')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /visão geral/i })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/beta-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Alertas', exact: true }).first().click();
  await expect(page).toHaveURL(/\/beta\/alertas$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/beta$/);
  await page.goto('/beta/alertas/aquisicao-1?tipo=surto');
  await expect(page.getByRole('heading', { level: 1, name: /central de alertas/i })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/beta\/alertas\/aquisicao-1\?tipo=surto$/);
  await page.getByRole('link', { name: /interface original/i }).click();
  await expect(page).toHaveURL(/\/alertas\/aquisicao-1\?tipo=surto$/);
  await expect(page.locator('.app-content-frame')).toBeVisible();
  await expect(page.locator('.beta-app')).toHaveCount(0);
});

test('beta no celular conserva navegação e cabe na tela', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/beta');
  await expect(page.getByRole('heading', { level: 1, name: /visão geral/i })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegação principal no celular' });
  await expect(nav).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: 'test-results/beta-mobile.png', fullPage: true });
  await nav.getByRole('button', { name: 'Alertas', exact: true }).click();
  await expect(page).toHaveURL(/\/beta\/alertas$/);
});

test('configurações alternam três versões, persistem a escolha e isolam o original', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/beta/configuracoes');
  for (const version of ['v1', 'v2', 'v3']) {
    const option = page.getByRole('button', { name: new RegExp(`Beta ${version} ·`) });
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`.beta-${version}`)).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: `test-results/beta-${version}-settings.png` });
    await page.reload();
    await expect(page.locator(`.beta-${version}`)).toBeVisible();
    if (version === 'v2') {
      await page.getByRole('navigation', { name: 'Áreas do sistema beta' }).getByRole('button', { name: 'Visão Geral' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name: 'Visão Geral' }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: /visão geral/i })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: `test-results/beta-${version}-overview.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: `Beta ${version}, escolher versão` }).click();
  }
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Versões da interface beta' })).toHaveCount(0);
  await expect(page.locator('.beta-app')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('todas as versões permitem trocar preferências e navegar no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/beta/configuracoes');
  for (const version of ['v1', 'v2', 'v3']) {
    const option = page.getByRole('button', { name: new RegExp(`Beta ${version} ·`) });
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('navigation', { name: 'Navegação principal no celular' }).getByRole('button', { name: 'Visão', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /visão geral/i })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: `test-results/beta-${version}-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: `Beta ${version}, escolher versão` }).click();
  }
});
