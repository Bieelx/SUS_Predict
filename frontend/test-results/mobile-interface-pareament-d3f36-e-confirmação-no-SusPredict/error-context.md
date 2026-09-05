# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-interface.spec.js >> pareamento do Telegram exige confirmação no SusPredict
- Location: tests/mobile-interface.spec.js:87:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: /painel da clara/i }).getByRole('button', { name: /conectar ao telegram/i })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "Menu principal" [ref=e4]:
    - paragraph [ref=e8]: SusPredict
    - navigation "Navegação principal" [ref=e9]:
      - generic [ref=e10]:
        - paragraph [ref=e11]: OPERACIONAL
        - button "Visão Geral" [ref=e12] [cursor=pointer]:
          - generic [ref=e14]: grid_view
        - button "Alertas" [ref=e17] [cursor=pointer]:
          - generic [ref=e18]: notifications
        - button "Insumos" [ref=e21] [cursor=pointer]:
          - generic [ref=e22]: medication
      - button "ANÁLISES" [ref=e26] [cursor=pointer]:
        - generic [ref=e28]: expand_more
      - button "Documentos" [ref=e30] [cursor=pointer]:
        - generic [ref=e31]: description
    - generic [ref=e34]:
      - button "Configurações" [ref=e35] [cursor=pointer]:
        - generic [ref=e36]: settings
        - generic [ref=e39]: chevron_right
      - button "T Teste" [ref=e40] [cursor=pointer]:
        - generic [ref=e41]: T
        - paragraph [ref=e43]: Teste
  - banner [ref=e44]:
    - 'generic "Página atual: Visão Geral" [ref=e46]':
      - generic [ref=e48]:
        - paragraph [ref=e49]: Visão Geral
        - generic [ref=e50]: Cotia · SP
    - button "Ir para a Central de Alertas" [ref=e51] [cursor=pointer]:
      - generic [ref=e52]: notifications
  - main [ref=e53]:
    - generic [ref=e57]:
      - generic [ref=e58]:
        - generic [ref=e59]:
          - heading "Visão Geral — Cotia, SP" [level=1] [ref=e60]:
            - text: Visão Geral
            - generic [ref=e61]: — Cotia, SP
          - paragraph [ref=e62]: Síntese executiva de dengue, pressão hospitalar e suprimento.
        - generic [ref=e63]:
          - generic [ref=e64]:
            - generic [ref=e65]: Território
            - combobox "Território" [ref=e66]:
              - option "Cotia, SP" [selected]
              - option "São Paulo (estado)"
          - generic [ref=e67]:
            - generic [ref=e68]: Comparativo
            - combobox "Comparativo" [ref=e69]:
              - option "Mês" [selected]
              - option "Trimestre"
              - option "Ano"
      - alert [ref=e71]:
        - generic [ref=e72]: cloud_off
        - generic [ref=e74]:
          - heading "Dados reais indisponíveis" [level=2] [ref=e75]
          - paragraph [ref=e76]: Token inválido ou expirado
        - button "Tentar novamente" [ref=e77] [cursor=pointer]
  - region [ref=e78]:
    - generic [ref=e80]:
      - generic [ref=e81]:
        - paragraph [ref=e82]: Mais áreas
        - heading [level=2] [ref=e83]: Análises e conta
      - button [ref=e84] [cursor=pointer]:
        - generic [ref=e85]: close
    - generic [ref=e86]:
      - button [ref=e87] [cursor=pointer]:
        - generic [ref=e88]: coronavirus
        - generic [ref=e90]:
          - strong [ref=e91]: Epidemiologia
          - generic [ref=e92]: Análise sob demanda
        - generic [ref=e93]: chevron_right
      - button [ref=e94] [cursor=pointer]:
        - generic [ref=e95]: bed
        - generic [ref=e97]:
          - strong [ref=e98]: Internações
          - generic [ref=e99]: Análise sob demanda
        - generic [ref=e100]: chevron_right
      - button [ref=e101] [cursor=pointer]:
        - generic [ref=e102]: vaccines
        - generic [ref=e104]:
          - strong [ref=e105]: Vacinação
          - generic [ref=e106]: Análise sob demanda
        - generic [ref=e107]: chevron_right
      - button [ref=e108] [cursor=pointer]:
        - generic [ref=e109]: description
        - generic [ref=e111]:
          - strong [ref=e112]: Documentos
          - generic [ref=e113]: ETPs e rascunhos
        - generic [ref=e114]: chevron_right
      - button [ref=e115] [cursor=pointer]:
        - generic [ref=e116]: settings
        - generic [ref=e118]:
          - strong [ref=e119]: Configurações
          - generic [ref=e120]: Preferências do sistema
        - generic [ref=e121]: chevron_right
      - button [ref=e122] [cursor=pointer]:
        - generic [ref=e123]: person
        - generic [ref=e125]:
          - strong [ref=e126]: Perfil
          - generic [ref=e127]: Identidade e acesso
        - generic [ref=e128]: chevron_right
  - navigation "Navegação principal no celular" [ref=e129]:
    - generic [ref=e130]:
      - button "Visão" [ref=e131] [cursor=pointer]:
        - generic [ref=e132]: grid_view
      - button "Alertas" [ref=e135] [cursor=pointer]:
        - generic [ref=e136]: notifications
      - button "Insumos" [ref=e139] [cursor=pointer]:
        - generic [ref=e140]: medication
      - button "Abrir Clara" [ref=e143] [cursor=pointer]:
        - generic [ref=e144]: SB
        - generic [ref=e145]: Clara
      - button "Mais" [ref=e146] [cursor=pointer]:
        - generic [ref=e147]: menu
  - dialog "Painel da Clara" [ref=e150]:
    - generic [ref=e151]:
      - generic [ref=e152]:
        - generic [ref=e153]: SB
        - generic [ref=e154]:
          - paragraph [ref=e155]: Clara
          - paragraph [ref=e156]: Visão Geral
      - generic [ref=e157]:
        - button "Conversas anteriores" [ref=e158] [cursor=pointer]:
          - generic [ref=e159]: history
        - button "Conectar canal de mensagens" [ref=e160] [cursor=pointer]:
          - generic [ref=e161]: hub
          - generic [ref=e162]: Conectar canal
        - button "Nova conversa" [ref=e163] [cursor=pointer]:
          - generic [ref=e164]: edit_square
        - button "Fechar (a conversa continua salva)" [ref=e165] [cursor=pointer]:
          - generic [ref=e166]: close
    - generic [ref=e168]:
      - paragraph [ref=e169]: O que você precisa decidir agora?
      - paragraph [ref=e170]: Pergunte sobre Visão Geral ou sobre qualquer dado do município.
      - generic [ref=e171]:
        - button "Qual é o alerta mais urgente hoje?" [ref=e172] [cursor=pointer]
        - button "Quais insumos rompem estoque nos próximos 30 dias?" [ref=e173] [cursor=pointer]
        - button "Como está a tendência de dengue no município?" [ref=e174] [cursor=pointer]
    - generic [ref=e175]:
      - generic [ref=e176]:
        - textbox "Mensagem para a Clara" [active] [ref=e177]:
          - /placeholder: Pergunte sobre este município…
        - generic [ref=e178]:
          - paragraph [ref=e179]: enter envia · shift+enter quebra linha
          - button "Enviar mensagem à Clara" [disabled] [ref=e180]:
            - generic [ref=e181]: arrow_upward
      - paragraph [ref=e182]: respostas geradas · confira antes de decidir
```

# Test source

```ts
  37  | 
  38  | test('Mais preserva as áreas secundárias sem sobrecarregar a navegação', async ({ page }) => {
  39  |   await autenticar(page);
  40  |   await page.goto('/visao-geral');
  41  | 
  42  |   await page.getByRole('button', { name: 'Mais', exact: true }).click();
  43  |   const folha = page.getByRole('region', { name: /mais áreas do suspredict/i });
  44  |   await expect(folha).toBeVisible();
  45  |   await expect(folha.getByRole('button', { name: /epidemiologia/i })).toBeVisible();
  46  |   await expect(folha.getByRole('button', { name: /documentos/i })).toBeVisible();
  47  |   await expect(folha.getByRole('button', { name: /perfil/i })).toBeVisible();
  48  | 
  49  |   await folha.getByRole('button', { name: /documentos/i }).click();
  50  |   await expect(page).toHaveURL(/\/documentos$/);
  51  |   await expect(page.getByRole('button', { name: 'Mais', exact: true })).toHaveAttribute('aria-current', 'page');
  52  | });
  53  | 
  54  | test('Clara abre como experiência mobile em tela cheia', async ({ page }) => {
  55  |   await autenticar(page);
  56  |   await page.route('**/api/susbot/conversas?*', route => route.fulfill({
  57  |     status: 200,
  58  |     contentType: 'application/json',
  59  |     body: JSON.stringify({ itens: [], total: 0, pagina: 1 }),
  60  |   }));
  61  |   await page.goto('/visao-geral');
  62  | 
  63  |   await page.getByRole('button', { name: 'Abrir Clara', exact: true }).click();
  64  |   const painel = page.getByRole('dialog', { name: /painel da clara/i });
  65  |   await expect(painel).toBeVisible();
  66  | 
  67  |   await expect.poll(async () => {
  68  |     const caixa = await painel.boundingBox();
  69  |     return caixa ? {
  70  |       alinhado: caixa.x <= 1 && caixa.y <= 1,
  71  |       telaCheia: caixa.width >= 389 && caixa.height >= 843,
  72  |     } : null;
  73  |   }).toEqual({ alinhado: true, telaCheia: true });
  74  | });
  75  | 
  76  | test('conteúdo não cria rolagem horizontal em celulares estreitos', async ({ page }) => {
  77  |   await autenticar(page);
  78  | 
  79  |   for (const width of [320, 390, 430]) {
  80  |     await page.setViewportSize({ width, height: 844 });
  81  |     await page.goto('/visao-geral');
  82  |     await expect(page.getByRole('heading', { name: /visão geral/i })).toBeVisible();
  83  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  84  |   }
  85  | });
  86  | 
  87  | test('pareamento do Telegram exige confirmação no SusPredict', async ({ page }) => {
  88  |   await autenticar(page);
  89  |   await page.route('**/api/susbot/conversas?*', route => route.fulfill({
  90  |     status: 200,
  91  |     contentType: 'application/json',
  92  |     body: JSON.stringify({ itens: [], total: 0, pagina: 1 }),
  93  |   }));
  94  |   await page.route('**/api/susbot/canais**', async route => {
  95  |     const url = new URL(route.request().url());
  96  |     const metodo = route.request().method();
  97  |     const path = url.pathname;
  98  | 
  99  |     if (metodo === 'GET' && path.endsWith('/canais')) {
  100 |       await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens: [] }) });
  101 |       return;
  102 |     }
  103 |     if (metodo === 'POST' && path.endsWith('/pareamentos')) {
  104 |       await route.fulfill({
  105 |         status: 201,
  106 |         contentType: 'application/json',
  107 |         body: JSON.stringify({
  108 |           id: 'pair-1', provedor: 'telegram', status: 'emitido', codigo: 'codigo-temporario',
  109 |           deep_link: 'https://t.me/SusPredictBot?start=codigo-temporario', configurado: true,
  110 |           expira_em: '2026-08-12T00:10:00Z',
  111 |         }),
  112 |       });
  113 |       return;
  114 |     }
  115 |     if (metodo === 'GET' && path.endsWith('/pareamentos/pair-1')) {
  116 |       await route.fulfill({
  117 |         status: 200,
  118 |         contentType: 'application/json',
  119 |         body: JSON.stringify({ id: 'pair-1', provedor: 'telegram', status: 'reivindicado', external_username: 'marcia' }),
  120 |       });
  121 |       return;
  122 |     }
  123 |     if (metodo === 'POST' && path.endsWith('/pareamentos/pair-1/confirmar')) {
  124 |       await route.fulfill({
  125 |         status: 200,
  126 |         contentType: 'application/json',
  127 |         body: JSON.stringify({ id: 'conn-1', provedor: 'telegram', status: 'ativo', external_username: 'marcia', ibge6: '351300' }),
  128 |       });
  129 |       return;
  130 |     }
  131 |     await route.fulfill({ status: 404, body: '{}' });
  132 |   });
  133 | 
  134 |   await page.goto('/visao-geral');
  135 |   await page.getByRole('button', { name: 'Abrir Clara', exact: true }).click();
  136 |   const painel = page.getByRole('dialog', { name: /painel da clara/i });
> 137 |   await painel.getByRole('button', { name: /conectar ao telegram/i }).click();
      |                                                                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
  138 |   await painel.getByRole('button', { name: 'Conectar', exact: true }).click();
  139 | 
  140 |   await expect(painel.getByText(/expira em 10 minutos e funciona uma vez/i)).toBeVisible();
  141 |   const abrirTelegram = painel.getByRole('link', { name: /abrir no telegram/i });
  142 |   await expect(abrirTelegram).toHaveAttribute('href', 'https://t.me/SusPredictBot?start=codigo-temporario');
  143 |   await expect(painel.getByLabel(/qr code para abrir o susbot/i)).toHaveCount(1);
  144 |   await expect(painel.getByText('codigo-temporario', { exact: true })).toHaveCount(0);
  145 |   const confirmacao = painel.getByRole('group', { name: /confirmar conta telegram/i });
  146 |   await expect(confirmacao).toContainText('@marcia', { timeout: 5000 });
  147 |   await confirmacao.getByRole('button', { name: /confirmar conexão/i }).click();
  148 | 
  149 |   await expect(painel.getByText('@marcia')).toBeVisible();
  150 |   await expect(painel.getByText('Conectado', { exact: true })).toBeVisible();
  151 | });
  152 | 
```