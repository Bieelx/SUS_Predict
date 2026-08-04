import { expect, test } from '@playwright/test';

test('abre a aplicação e renderiza a interface inicial', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/sus\s*predict/i);
  await expect(page.getByText(/entrar na plataforma|visão geral/i)).toBeVisible();
});
