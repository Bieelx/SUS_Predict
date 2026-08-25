import { expect, test } from '@playwright/test';

test('replay histórico de dengue segue funcional e coerente', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', error => {
    pageErrors.push(String(error));
  });
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/?demo=crise-historica');

  await page.getByRole('button', { name: /acessar demonstração/i }).click();

  await expect(page.getByRole('heading', { name: /visão geral/i })).toBeVisible();
  await expect(page.getByText(/campinas\/sp · corte temporal jan\/2024/i)).toBeVisible();
  await expect(page.getByText(/corte temporal jan\/2024/i)).toBeVisible();

  const avancarMes = page.getByRole('button', { name: /avançar mês/i });
  await avancarMes.click();
  await expect(page.getByText(/dengue em alta de 210\.1% no corte atual\./i)).toBeVisible();

  await avancarMes.click();
  await expect(page.getByText(/dengue em alta de 128\.6% no corte atual\./i)).toBeVisible();

  await page.locator('button').filter({ hasText: /Alertas/i }).first().click();
  await expect(page.getByRole('heading', { name: /central de alertas/i })).toBeVisible();
  await page.getByRole('button', { name: /ver detalhes/i }).first().click();
  await expect(page.locator('tspan').filter({ hasText: 'abr/2024' }).first()).toBeVisible();
  await page.getByRole('button', { name: /fechar detalhes do alerta/i }).click();

  await page.locator('button').filter({ hasText: /Visão Geral/i }).first().click();
  await expect(page.getByRole('heading', { name: /visão geral/i })).toBeVisible();
  await avancarMes.click();
  await expect(page.getByText(/dengue em alta de 18\.5% no corte atual\./i)).toBeVisible();
  await expect(page.getByText(/revelação da curva real/i)).toBeVisible();

  await page.getByRole('button', { name: /gerar etp/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /gerar etp/i })).toBeVisible();
  await dialog.getByRole('button', { name: 'Próximo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Próximo', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /revisei e aprovo o texto acima/i }).check();
  await dialog.getByRole('button', { name: /gerar documento/i }).click();
  await expect(page.getByText(/etp gerado/i)).toBeVisible({ timeout: 10000 });

  await page.locator('button').filter({ hasText: /Documentos/i }).first().click();
  await expect(page.getByRole('heading', { name: /documentos/i })).toBeVisible();
  await expect(page.getByRole('cell', { name: /dipirona 500mg/i })).toBeVisible();
  await expect(page.getByText('01/04/2024')).toBeVisible();

  await page.locator('button').filter({ hasText: /Alertas/i }).first().click();
  await expect(page.getByText(/em andamento/i)).toBeVisible();

  await page.locator('button').filter({ hasText: /Visão Geral/i }).first().click();
  await avancarMes.click();
  await expect(page.getByText(/casos de dengue recuaram 12\.8%, mas a pressão sobre insumos segue crítica\./i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /janela de decisão/i })).toBeVisible();
  await expect(page.locator('p').filter({ hasText: /^6 dias$/ }).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
