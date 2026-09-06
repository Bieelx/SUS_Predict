import { expect, test } from '@playwright/test';

async function autenticar(page) {
  await page.route('**/api/dados/municipios', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ meta: { fonte: 'Supabase' }, municipios: [{ ibge6: '351300', ibge7: '3513009', nome: 'Cotia', uf: 'SP', mesorregiao: 'Metropolitana de São Paulo' }] }),
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'teste-mobile', email: 'teste@dev.local', role: 'authenticated' }),
  }));
  await page.addInitScript(() => {
    localStorage.setItem('sus_predict_token', 'teste-mobile');
    localStorage.removeItem('sus_predict_sidebar');
  });
  await page.setViewportSize({ width: 390, height: 844 });
}

test('navega pelos fluxos prioritários com a barra inferior', async ({ page }) => {
  await autenticar(page);
  await page.goto('/visao-geral');

  const nav = page.getByRole('navigation', { name: /navegação principal no celular/i });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Visão', exact: true })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('button', { name: /alertas/i }).click();
  await expect(page).toHaveURL(/\/alertas$/);
  await expect(page.getByRole('heading', { name: /central de alertas/i })).toBeVisible();

  await nav.getByRole('button', { name: 'Insumos', exact: true }).click();
  await expect(page).toHaveURL(/\/insumos$/);
  await expect(page.getByRole('heading', { name: /insumos/i })).toBeVisible();
});

test('Mais preserva as áreas secundárias sem sobrecarregar a navegação', async ({ page }) => {
  await autenticar(page);
  await page.goto('/visao-geral');

  await page.getByRole('button', { name: 'Mais', exact: true }).click();
  const folha = page.getByRole('region', { name: /mais áreas do suspredict/i });
  await expect(folha).toBeVisible();
  await expect(folha.getByRole('button', { name: /epidemiologia/i })).toBeVisible();
  await expect(folha.getByRole('button', { name: /documentos/i })).toBeVisible();
  await expect(folha.getByRole('button', { name: /perfil/i })).toBeVisible();

  await folha.getByRole('button', { name: /documentos/i }).click();
  await expect(page).toHaveURL(/\/documentos$/);
  await expect(page.getByRole('button', { name: 'Mais', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('Clara abre como experiência mobile em tela cheia', async ({ page }) => {
  await autenticar(page);
  await page.route('**/api/susbot/conversas?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ itens: [], total: 0, pagina: 1 }),
  }));
  await page.goto('/visao-geral');

  await page.getByRole('button', { name: 'Abrir Clara', exact: true }).click();
  const painel = page.getByRole('dialog', { name: /painel da clara/i });
  await expect(painel).toBeVisible();

  await expect.poll(async () => {
    const caixa = await painel.boundingBox();
    return caixa ? {
      alinhado: caixa.x <= 1 && caixa.y <= 1,
      telaCheia: caixa.width >= 389 && caixa.height >= 843,
    } : null;
  }).toEqual({ alinhado: true, telaCheia: true });
});

test('conteúdo não cria rolagem horizontal em celulares estreitos', async ({ page }) => {
  await autenticar(page);

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/visao-geral');
    await expect(page.getByRole('heading', { name: /visão geral/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('pareamento do Telegram exige confirmação no SusPredict', async ({ page }) => {
  await autenticar(page);
  await page.route('**/api/susbot/conversas?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ itens: [], total: 0, pagina: 1 }),
  }));
  await page.route('**/api/susbot/canais**', async route => {
    const url = new URL(route.request().url());
    const metodo = route.request().method();
    const path = url.pathname;

    if (metodo === 'GET' && path.endsWith('/canais')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens: [] }) });
      return;
    }
    if (metodo === 'POST' && path.endsWith('/pareamentos')) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'pair-1', provedor: 'telegram', status: 'emitido', codigo: 'codigo-temporario',
          deep_link: 'https://t.me/SusPredictBot?start=codigo-temporario', configurado: true,
          expira_em: '2026-08-12T00:10:00Z',
        }),
      });
      return;
    }
    if (metodo === 'GET' && path.endsWith('/pareamentos/pair-1')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'pair-1', provedor: 'telegram', status: 'reivindicado', external_username: 'marcia' }),
      });
      return;
    }
    if (metodo === 'POST' && path.endsWith('/pareamentos/pair-1/confirmar')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conn-1', provedor: 'telegram', status: 'ativo', external_username: 'marcia', ibge6: '351300' }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: '{}' });
  });

  await page.goto('/visao-geral');
  await page.getByRole('button', { name: 'Abrir Clara', exact: true }).click();
  const painel = page.getByRole('dialog', { name: /painel da clara/i });
  await painel.getByRole('button', { name: /conectar canal de mensagens/i }).click();
  await painel.getByRole('button', { name: 'Conectar', exact: true }).click();

  await expect(painel.getByText(/expira em 10 minutos e funciona uma vez/i)).toBeVisible();
  const abrirTelegram = painel.getByRole('link', { name: /abrir no telegram/i });
  await expect(abrirTelegram).toHaveAttribute('href', 'https://t.me/SusPredictBot?start=codigo-temporario');
  await expect(painel.getByLabel(/qr code para abrir a clara/i)).toHaveCount(1);
  await expect(painel.getByText('codigo-temporario', { exact: true })).toHaveCount(0);
  const confirmacao = painel.getByRole('group', { name: /confirmar conta telegram/i });
  await expect(confirmacao).toContainText('@marcia', { timeout: 5000 });
  await confirmacao.getByRole('button', { name: /confirmar conexão/i }).click();

  await expect(painel.getByText('@marcia')).toBeVisible();
  await expect(painel.getByText('Conectado', { exact: true })).toBeVisible();
});
