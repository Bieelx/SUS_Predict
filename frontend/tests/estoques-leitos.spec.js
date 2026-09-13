import { expect, test } from '@playwright/test';

const unidade = { id: '3550302027275', cnes: '2027275', no_fantasia: 'UBS Vila Albertina', no_municipio: 'São Paulo' };
async function preparar(page) {
  let confirmado = false;
  let rascunho = null;
  await page.addInitScript(() => localStorage.setItem('sus_predict_token', 'e2e-registros'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'ana', email: 'gestor@example.test' } });
    if (path.endsWith('/dados/municipios')) return route.fulfill({ json: { municipios: [{ ibge6: '355030', nome: 'São Paulo', uf: 'SP' }] } });
    if (path.endsWith('/estabelecimentos')) return route.fulfill({ json: { itens: [unidade] } });
    if (path.endsWith('/estabelecimentos/3550302027275/registros')) return route.fulfill({ json: {
      estabelecimento: unidade,
      vacinacao: { saldo: confirmado ? [{ id: 1, nome_vacina: 'COVID-19', qtd_doses: 500, data_atualizacao: '2026-09-13T12:00:00Z' }] : [], historico: [] },
      medicamento: { saldo: [{ id: 2, nome_medicamento: 'Paracetamol', concentracao: '500 mg', forma_farmaceutica: 'comprimido', tipo_embalagem: 'caixa', quantidade_por_embalagem: 20, qtd_embalagens: 10 }], historico: [] },
      internacao: { saldo: [{ id: 3, tipo_leito: 'UTI', qtd_leitos_ocupados: 19, qtd_leitos_disponiveis: 1 }], historico: [] },
    } });
    if (path.endsWith('/rascunhos') && route.request().method() === 'POST') {
      expect(route.request().postDataJSON().id_estabelecimento).toBe(unidade.id);
      rascunho = { id: 'draft-1', id_estabelecimento: unidade.id, versao: 1, tipo: 'vacinacao', texto_original: 'Entrada de 500 doses da vacina COVID-19', estabelecimento: unidade, payload_proposto: { nome_vacina: 'COVID-19', qtd_doses: 500, tipo_movimentacao: 'entrada' } };
      return route.fulfill({ json: rascunho });
    }
    if (path.endsWith('/rascunhos')) return route.fulfill({ json: { itens: rascunho && !confirmado ? [rascunho] : [] } });
    if (path.endsWith('/confirmar')) { confirmado = true; return route.fulfill({ json: { status: 'confirmado' } }); }
    return route.fulfill({ json: {} });
  });
}

test('seleciona unidade real, revisa e confirma antes de mostrar o saldo', async ({ page }) => {
  await preparar(page);
  await page.goto('/registros-unidade');
  await expect(page.getByRole('heading', { name: 'Estoques e leitos' })).toBeVisible();
  await expect(page.getByText('PS piloto')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Unidade de saúde' }).selectOption(unidade.id);
  await expect(page.getByRole('heading', { name: 'Ainda não há dados registrados' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo registro' }).click();
  await page.getByLabel('Descreva o que aconteceu na unidade').fill('Entrada de 500 doses da vacina COVID-19');
  await page.getByRole('button', { name: 'Preparar para revisão' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar registro' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar registro' }).click();
  await page.getByRole('button', { name: 'Situação atual' }).click();
  await expect(page.getByRole('cell', { name: '500 doses' })).toBeVisible();
  await page.getByRole('button', { name: 'Medicamentos', exact: true }).click();
  await expect(page.getByRole('cell', { name: '10 embalagens' })).toBeVisible();
  await expect(page.getByText('comprimido · caixa com 20 unidades')).toBeVisible();
  await page.getByRole('button', { name: 'Leitos', exact: true }).click();
  await expect(page.getByRole('cell', { name: '19 ocupados · 1 disponível' })).toBeVisible();
  await page.screenshot({ path: 'test-results/estoques-leitos-desktop.png', fullPage: true, animations: 'disabled' });
});

test('celular mantém seleção e ações sem transbordar a página', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page);
  await page.goto('/registros-unidade');
  await page.getByRole('combobox', { name: 'Unidade de saúde' }).selectOption(unidade.id);
  await page.getByRole('button', { name: 'Leitos', exact: true }).click();
  await expect(page.getByRole('cell', { name: '19 ocupados · 1 disponível' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.re-tabela-wrap').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/estoques-leitos-mobile.png', fullPage: true, animations: 'disabled' });
});
