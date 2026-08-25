import { expect, test } from '@playwright/test';

test('abre a aplicação e renderiza a interface inicial', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/sus\s*predict/i);
  await expect(page.getByRole('heading', { name: /entrar no ambiente de trabalho/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar com credenciais/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /acessar demonstração/i })).toBeVisible();
});
