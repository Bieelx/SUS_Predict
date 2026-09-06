# Autenticação e verificação em duas etapas

Estado em 06/09/2026. Substitui a descrição de login que estava em
[03-arquitetura.md](./03-arquitetura.md); as regras de perfil e permissão continuam em
[09-identidade-permissoes-memoria.md](./09-identidade-permissoes-memoria.md).

---

## Os três fluxos

### Cadastro — `POST /api/auth/signup`

```
nome + e-mail + senha  →  GoTrue cria o usuário  →  e-mail de confirmação
```

A resposta é **sempre a mesma**, exista ou não o e-mail:

```json
{ "ok": true, "mensagem": "Se o e-mail for válido, enviamos as instruções…" }
```

Duas razões: o registro cru do GoTrue (UUID, `identities`, `app_metadata`) não deve
chegar ao navegador, e responder diferente para e-mail existente permitiria levantar
quem tem conta. Erros de formulário que o usuário precisa ver — senha com menos de 8
caracteres, e-mail sem `@` — são validados **antes** da chamada ao GoTrue e devolvem
400 de verdade.

Quem cria conta entra como `visitante` e não enxerga dado de saúde até um admin liberar
pela tela de administração de usuários.

### Login em duas etapas

```
1. e-mail + senha   → POST /api/auth/login            → { "codigo_enviado": true }
2. código (6 díg.)  → POST /api/auth/verificar-codigo → { access_token, refresh_token, user }
```

**A senha correta não devolve sessão.** O backend valida a senha no GoTrue, descarta a
sessão que veio de lá sem que ela toque o navegador, e dispara o código por e-mail. O
token só é emitido contra o código. Quem tem a senha mas não tem a caixa de entrada não
entra.

O envio usa `POST /auth/v1/otp` com `create_user: false` — este caminho nunca cria
conta, então não dá para virar usuário só tentando entrar.

No modo de demonstração local (`SUS_PREDICT_DEV_AUTH=true`, sem Supabase) não há caixa
de entrada: o login devolve a sessão direto, sem segunda etapa.

### Sessão

`sessao_publica()` em `api/core/auth.py` recorta a resposta antes de sair: tokens mais
`{id, email, created_at, last_sign_in_at, user_metadata.nome}`. `identities`,
`app_metadata`, `aud`, `role`, `phone`, `is_anonymous` ficam no backend. Vale para
`/login`, `/verificar-codigo`, `/refresh`, `/dev-login` e `/me`.

---

## Configuração obrigatória no Supabase

O template precisa conter `{{ .Token }}` e **não pode conter link clicável**. Cole
[`supabase_emails/magic_link.html`](../supabase_emails/magic_link.html) em
**Authentication → Emails → Magic Link**.

### Por que o link foi removido (06/09/2026)

O template original trazia um botão `{{ .ConfirmationURL }}` junto do código. Resultado:
o código chegava certo e a tela recusava com *"Token has expired or is invalid"*.

Causa: o token do GoTrue é de **uso único**, e o link e o código são o mesmo token.
Filtros de segurança de e-mail — Microsoft Defender / Safe Links no Outlook, entre outros
— **abrem os links da mensagem para escanear**, antes de a pessoa ler. Esse acesso
consome o token. Quando a pessoa digita os 6 dígitos, já foram gastos.

Além do bug, um link de login automático dentro de um e-mail de segundo fator anula o
próprio segundo fator: quem conseguir ler ou receber a mensagem encaminhada entra sem a
senha. E-mail de 2FA leva código, nunca link.

### Tipo de verificação

`verificar_codigo_email` tenta `email`, depois `magiclink`, depois `signup`. O GoTrue
guarda o código em colunas distintas conforme quem o gerou, e o tipo errado devolve
exatamente a mesma mensagem de token inválido. Tentar em ordem elimina a adivinhação; o
caminho comum (`email`) resolve na primeira chamada.

Quando todos falham, a API responde com uma mensagem que explica o que fazer, em vez de
repassar o texto do GoTrue: vale o código do e-mail mais recente, uma vez só.

---

## Limites de tentativa

`api/core/rate_limit.py`, contador em memória por IP e por rota:

| Rota | Limite |
|---|---|
| `/api/auth/signup` | 5 / min |
| `/api/auth/login` | 8 / min |
| `/api/auth/verificar-codigo` | 10 / min |

Some no restart e não é compartilhado entre réplicas — suficiente para uma instância.
O GoTrue tem os limites dele por cima disso.

---

## Superfície fechada (auditoria de 06/09/2026)

| Item | Antes | Agora |
|---|---|---|
| `/docs`, `/openapi.json` | públicos | 404, salvo `SUS_PREDICT_DOCS=1` |
| `DELETE /api/cleanup/{job}` | sem auth | `require_admin` |
| `/api/download`, `/status`, `/resultado`, `/export` | sem auth | `require_acesso()` |
| `/api/runs`, `/api/overview`, `/api/dengue/*` | sem auth | `require_acesso()` |
| `/api/sistemas`, `/estados`, `/cidades`, `/doencas`, `/capacidades`, `/ano_limite` | sem auth | `require_acesso()` |
| Cabeçalhos de defesa | nenhum | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS`, `CSP` |

Abertos de propósito: `/` e `/health` (sonda do Railway).

O header `server: uvicorn` é escrito pelo protocolo e não sai por middleware. Suba o
serviço com `uvicorn --no-server-header` para removê-lo.

Testes: `api/tests/test_seguranca_auth.py` (21).

---

## O que continua pendente

- **RLS no Postgres** com JWT do usuário (Fase 4 de docs/09). Hoje a autorização é toda
  na camada da API.
- **Escopo por município** (`acesso.municipios`) ainda não é validado nos endpoints.
- **Segundo fator por app autenticador (TOTP)** como alternativa ao e-mail, para quem
  não quiser depender da caixa de entrada.
