import { expect, test } from '@playwright/test';

const ADMIN = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@saude.sp.gov.br',
  full_name: 'Admin Saúde',
  job_title: 'Gestão Municipal',
  role: 'admin',
  roles: ['admin'],
};

test('visitante e token local forjado não acessam o dashboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sus_predict_token', 'token-forjado');
  });
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Sessão ausente' }),
  }));
  await page.route('**/api/auth/refresh', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Sessão expirada' }),
  }));

  await page.goto('/');

  await expect(page).toHaveTitle(/sus\s*predict/i);
  await expect(page.getByRole('heading', { name: /entrar na plataforma/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /visão geral/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /criar conta|entrar como dev/i })).toHaveCount(0);
});

test('sessão Admin validada libera o dashboard', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: ADMIN }),
  }));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /visão geral/i })).toBeVisible();
  await expect(page.getByText('Admin Saúde')).toBeVisible();
  await expect(page.getByRole('heading', { name: /entrar na plataforma/i })).toHaveCount(0);
});

test('esqueci minha senha usa resposta genérica', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Sessão ausente' }),
  }));
  await page.route('**/api/auth/refresh', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Sessão expirada' }),
  }));
  await page.route('**/api/auth/forgot-password', async route => {
    const body = route.request().postDataJSON();
    expect(body.email).toBe('admin@saude.sp.gov.br');
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Se houver uma conta para este e-mail, enviaremos as instruções de acesso.',
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /esqueci minha senha/i }).click();
  await page.getByLabel('E-mail cadastrado').fill('admin@saude.sp.gov.br');
  await page.getByRole('button', { name: /enviar link de recuperação/i }).click();

  await expect(page.getByRole('status')).toContainText(/se houver uma conta/i);
});

test('link de recuperação permite definir senha forte e remove tokens da URL', async ({ page }) => {
  await page.route('**/api/auth/recovery/session', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: ADMIN }),
  }));
  await page.route('**/api/auth/password', async route => {
    expect(route.request().postDataJSON().password).toBe('NovaSenha#2026');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: ADMIN }),
    });
  });
  await page.route('**/api/auth/logout', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true }),
  }));

  await page.goto('/auth/update-password#access_token=token-de-recuperacao&refresh_token=refresh-de-recuperacao&type=recovery');
  await expect(page.getByRole('heading', { name: /defina uma nova senha/i })).toBeVisible();
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha#2026');
  await page.getByLabel('Confirmar nova senha').fill('NovaSenha#2026');
  await page.getByRole('button', { name: /salvar nova senha/i }).click();

  await expect(page.getByRole('heading', { name: /entrar na plataforma/i })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/senha alterada com sucesso/i);
  await expect(page).not.toHaveURL(/access_token|refresh_token/);
});

test('link de convite é processado uma única vez mesmo com React StrictMode', async ({ page }) => {
  let sessionRequests = 0;
  await page.route('**/api/auth/recovery/session', async route => {
    sessionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: ADMIN }),
    });
  });

  await page.goto('/#access_token=token-de-convite-valido&refresh_token=ab3def6hi9kl&type=invite');

  await expect(page.getByRole('heading', { name: /crie sua senha/i })).toBeVisible();
  await page.waitForTimeout(250);
  expect(sessionRequests).toBe(1);
  await expect(page).not.toHaveURL(/access_token|refresh_token/);
});

test('falha transitória ao validar convite permite tentar novamente sem expor tokens', async ({ page }) => {
  let sessionRequests = 0;
  await page.route('**/api/auth/recovery/session', async route => {
    sessionRequests += 1;
    if (sessionRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Serviço de autenticação temporariamente indisponível',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: ADMIN }),
    });
  });

  await page.goto(
    '/auth/update-password'
    + '#access_token=token-de-convite-transitorio'
    + '&refresh_token=refresh-de-convite-transitorio&type=invite',
  );

  await expect(page.getByRole('heading', {
    name: /validação temporariamente indisponível/i,
  })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/verifique sua conexão/i);
  await expect(page).not.toHaveURL(/access_token|refresh_token/);

  await page.getByRole('button', { name: /tentar validar novamente/i }).click();

  await expect(page.getByRole('heading', { name: /crie sua senha/i })).toBeVisible();
  expect(sessionRequests).toBe(2);
});

test('erro devolvido pelo link é apresentado e removido da URL', async ({ page }) => {
  await page.goto(
    '/auth/update-password?error=access_denied&error_code=otp_expired'
    + '&error_description=Email%20link%20is%20invalid%20or%20has%20expired&type=invite',
  );

  await expect(page.getByRole('alert')).toContainText(/inválido ou expirou/i);
  await expect(page).not.toHaveURL(/error=|error_code=|error_description=/);
});

test('Admin envia convite pela aba Perfil', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: ADMIN }),
  }));
  await page.route('**/api/admin/users?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [ADMIN], page: 1, per_page: 100, total: 1 }),
  }));
  await page.route('**/api/admin/users/invite', async route => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      email: 'novo.admin@saude.sp.gov.br',
      full_name: 'Novo Administrador',
      job_title: 'Coordenação',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-0000-0000-000000000002',
          email: body.email,
          full_name: body.full_name,
          job_title: body.job_title,
          role: 'admin',
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Admin Saúde/i }).click();
  await expect(page.getByRole('heading', { name: /perfil do usuário/i })).toBeVisible();

  await page.getByLabel('Nome completo').fill('Novo Administrador');
  await page.getByLabel('E-mail institucional').fill('novo.admin@saude.sp.gov.br');
  await page.getByLabel('Cargo (opcional)').fill('Coordenação');
  await page.getByRole('button', { name: /enviar convite seguro/i }).click();

  await expect(page.getByRole('status')).toContainText(/convite enviado/i);
  await expect(page.getByText('Novo Administrador')).toBeVisible();
});
