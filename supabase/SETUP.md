# Configuração do Supabase — autenticação e segurança do SUS Predict

Este guia configura um projeto fechado: não existe cadastro público, somente
usuários com a role de negócio `admin` entram, e novos usuários são convidados
por outro Admin na aba **Perfil do Usuário**.

> As telas do Supabase podem mudar levemente de nome. O guia foi revisado em
> 04/08/2026 e usa a documentação oficial indicada em cada seção.

## 1. Entenda quais chaves usar

Abra o projeto no Supabase e acesse **Project Settings → API Keys**.

Copie para o `.env` do backend:

- **Project URL** → `SUPABASE_URL`;
- **Publishable key** (`sb_publishable_...`) → `SUPABASE_PUBLISHABLE_KEY`;
- **Secret key** (`sb_secret_...`) → `SUPABASE_SECRET_KEY`.

Projetos antigos podem mostrar `anon` e `service_role`. O código também aceita
essas chaves pelos nomes `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY`. Para projetos novos, prefira publishable/secret.

Regras obrigatórias:

- a chave secret/service role fica somente no backend;
- nunca crie uma variável `VITE_SUPABASE_SECRET_KEY`;
- nunca cole a chave secret em React, screenshots, commits ou mensagens;
- se uma chave administrativa tiver sido exposta, rotacione-a antes de seguir.

As chaves secret/service role possuem acesso privilegiado e ignoram RLS. Consulte
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Crie o `.env` local:

```bash
cp .env.example .env
chmod 600 .env
```

Preencha ao menos:

```dotenv
APP_ENV=development
SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUBSTITUA
SUPABASE_SECRET_KEY=sb_secret_SUBSTITUA

FRONTEND_URL=http://localhost:3000
AUTH_REDIRECT_URL=http://localhost:3000/auth/update-password
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
```

Não misture `localhost` e `127.0.0.1` durante o mesmo teste: cookies pertencem
ao host que os criou.

## 2. Provisionar o banco e as políticas de acesso

O schema de persistência DATASUS existente permanece versionado para preservar o
funcionamento atual. Em um projeto novo, abra o **SQL Editor** e execute
`supabase/schema.sql`. Ele cria as tabelas agregadas `datasus_runs`,
`datasus_serie`, `datasus_sexo`, `datasus_faixa_etaria`, `datasus_top_causas` e
`datasus_raw_objects`. O provisionamento das estruturas de autenticação, roles,
auditoria e políticas RLS deve ser realizado diretamente no projeto Supabase por
uma pessoa autorizada da equipe.

Não edite `auth.users` diretamente. O schema `auth` é administrado pelo Supabase;
dados adicionais devem ficar em estruturas públicas relacionadas por UUID. Esse
é o padrão descrito em
[Managing user data](https://supabase.com/docs/guides/auth/managing-user-data).

Antes de seguir, confirme no **Table Editor** que as estruturas necessárias à
aplicação foram provisionadas. Em **Database → Policies**, confirme que RLS está
habilitado. A proteção visual do React não substitui RLS nem a autorização do
FastAPI. Veja
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
e
[Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).

## 3. Bloquear cadastro público

No painel:

1. Abra **Authentication → General Configuration**;
2. desative **Allow new users to sign up**;
3. desative **Allow anonymous sign-ins**;
4. salve.

Depois abra **Authentication → Sign In / Providers → Email**:

1. mantenha o provedor Email habilitado;
2. mantenha **Confirm Email** habilitado;
3. deixe telefone, anonymous, OAuth e outros provedores desligados enquanto não
   fizerem parte da regra de negócio.

Isso bloqueia o signup no Supabase. O SUS Predict também não possui endpoint nem
botão de cadastro público, criando defesa em profundidade. Consulte
[Auth General Configuration](https://supabase.com/docs/guides/auth/general-configuration).

## 4. Configurar a política de senha

Em **Authentication → Sign In / Providers → Email → Password security**:

1. configure tamanho mínimo de **12 caracteres**;
2. exija minúscula, maiúscula, número e símbolo;
3. se disponível no seu plano, habilite proteção contra senhas vazadas;
4. salve.

O frontend e o FastAPI repetem essa validação para dar feedback rápido, mas o
Supabase deve continuar sendo a autoridade final.

Senhas não devem ser “criptografadas” de forma reversível. O SUS Predict nunca
as grava; o Supabase Auth armazena hashes bcrypt com salt. O transporte em
produção deve usar HTTPS. Consulte
[Password security](https://supabase.com/docs/guides/auth/password-security).

## 5. Configurar URLs de login, convite e recuperação

Abra **Authentication → URL Configuration**.

### Desenvolvimento

Adicione à lista de redirects:

```text
http://localhost:3000/auth/update-password
http://127.0.0.1:3000/auth/update-password
```

Mantenha no `.env` exatamente a URL que realmente usará:

```dotenv
AUTH_REDIRECT_URL=http://localhost:3000/auth/update-password
```

### Produção

1. defina **Site URL** como a URL HTTPS oficial;
2. adicione um redirect exato, por exemplo:

```text
https://sus-predict.exemplo.br/auth/update-password
```

3. configure no backend:

```dotenv
APP_ENV=production
FRONTEND_URL=https://sus-predict.exemplo.br
AUTH_REDIRECT_URL=https://sus-predict.exemplo.br/auth/update-password
CORS_ALLOWED_ORIGINS=https://sus-predict.exemplo.br
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
```

Evite curingas amplos em produção. Se frontend e API estiverem em sites
completamente diferentes, poderá ser necessário `AUTH_COOKIE_SAMESITE=none`;
nesse caso HTTPS é obrigatório. Prefira frontend e API sob o mesmo site.

Garanta que a hospedagem React redirecione rotas desconhecidas para `index.html`,
pois `/auth/update-password` é uma rota da SPA. Consulte
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 6. Configurar envio de e-mail

Sem SMTP próprio, convites e recuperação podem não chegar a usuários externos.

1. Abra **Project Settings → Authentication → SMTP Settings**;
2. habilite **Custom SMTP**;
3. informe host, porta, usuário, senha, remetente e nome do remetente;
4. use um domínio cujo SPF/DKIM esteja configurado;
5. salve e envie um teste.

O SMTP padrão do Supabase é voltado a testes e possui restrições. Consulte
[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Em **Authentication → Email Templates**, revise:

- **Invite user**;
- **Reset password**;
- **Password changed notification**.

Mantenha `{{ .ConfirmationURL }}` nos botões dos templates, salvo se estiver
implementando conscientemente um template customizado. Consulte
[Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## 7. Criar o primeiro Administrador

Esse é o único bootstrap manual. Depois dele, use a aba Perfil do SUS Predict.

1. Abra **Authentication → Users**;
2. escolha **Add user → Send invitation**;
3. informe seu e-mail institucional;
4. solicite ao responsável pelo banco que conceda a role `admin` ao usuário pelo
   procedimento interno de provisionamento;
5. confirme no painel que a permissão foi aplicada;
6. abra o convite recebido, crie uma senha forte e faça login.

Não use `user_metadata` para conceder role: esse campo pode ser alterado pelo
próprio usuário. O projeto consulta `user_roles` no backend. Consulte
[RLS e metadados](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 8. Cadastrar os demais usuários

Com o primeiro Admin autenticado:

1. abra **Perfil do Usuário** no menu lateral;
2. localize **Cadastrar novo usuário**;
3. informe nome, e-mail institucional e cargo;
4. clique em **Enviar convite seguro**.

O backend:

1. valida a sessão no Supabase;
2. consulta `user_roles`;
3. exige `admin`;
4. chama a Admin API com a chave secret;
5. envia o convite;
6. atribui `admin` em `user_roles`;
7. grava a ação em `admin_audit_log`.

O Admin nunca vê nem define a senha do convidado. O convidado abre o link e cria
a própria senha forte. A Admin API deve existir somente em um servidor confiável:
[Auth Admin](https://supabase.com/docs/reference/python/admin-api) e
[Invite user by email](https://supabase.com/docs/reference/python/auth-admin-inviteuserbyemail).

## 9. Testar recuperação e troca de senha

### Usuário sem sessão

1. abra a tela de login;
2. clique em **Esqueci minha senha**;
3. informe o e-mail;
4. confirme que a interface sempre mostra uma resposta genérica;
5. abra o link recebido;
6. defina a nova senha;
7. entre novamente.

### Usuário autenticado

1. abra **Perfil do Usuário**;
2. clique em **Enviar link para trocar senha**;
3. conclua o mesmo fluxo pelo e-mail.

Após a alteração, o SUS Predict encerra a sessão e exige novo login. Consulte
[Password reset flow](https://supabase.com/docs/guides/auth/passwords#resetting-a-password).

## 10. Criar o bucket de dados brutos

Em **Storage**:

1. crie o bucket `datasus-raw`;
2. marque-o como **Private**;
3. mantenha as variáveis:

```dotenv
SUPABASE_BUCKET_RAW=datasus-raw
SUPABASE_ENABLE_RAW_UPLOAD=true
SUPABASE_RAW_MAX_BYTES=250000000
SUPABASE_ENABLE_CACHE_READ=true
```

O upload atual ocorre exclusivamente no backend com chave administrativa. Não
crie uma policy pública de leitura ou escrita para esse bucket.

## 11. Checklist de validação

Antes de considerar o ambiente pronto:

- [ ] aba anônima abre somente a tela de login;
- [ ] texto falso no `localStorage` não libera o dashboard;
- [ ] `/api/runs` sem cookie retorna `401`;
- [ ] `/api/cleanup/...` sem cookie retorna `401`;
- [ ] usuário existente sem registro em `user_roles` recebe `403`;
- [ ] Admin válido acessa dashboard e SusBot;
- [ ] não existe botão “Criar conta” nem “Entrar como dev”;
- [ ] convite chega e permite criar uma senha;
- [ ] “Esqueci minha senha” entrega o e-mail;
- [ ] senha fraca é recusada;
- [ ] logout remove a sessão;
- [ ] `SUPABASE_SECRET_KEY` não aparece no bundle React;
- [ ] RLS está habilitado e `anon` não possui policies;
- [ ] `.env` está fora do Git e com permissão `600`.

## 12. Hardening recomendado para produção

No Supabase:

- revise **Authentication → Rate Limits**;
- planeje CAPTCHA antes de exposição ampla (isso exige integrar o token do
  provedor ao formulário e ao endpoint; não basta ligar a opção no painel);
- considere MFA para uma fase posterior;
- monitore Auth logs e `admin_audit_log`.

Fontes:

- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Custom claims e RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)

Na hospedagem:

- use somente HTTPS;
- armazene secrets no gerenciador da plataforma, não em arquivos;
- mantenha frontend e API com origens CORS exatas;
- desabilite ou proteja `/docs` e `/openapi.json` se não forem necessários;
- aplique backup e criptografia de volume ao SQLite, caso continue armazenando
  conversas do SusBot localmente.

## Solução de problemas

### Login retorna “Autenticação Supabase não configurada”

Falta `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_ANON_KEY`, ou o backend não foi
reiniciado depois de alterar o `.env`.

### Login correto retorna “Usuário sem permissão de Administrador”

O usuário existe no Supabase Auth, mas ainda não recebeu a role de Administrador.
Solicite ao responsável pelo banco que valide e aplique a permissão pelo
procedimento interno de provisionamento descrito na seção 7.

### Convite retorna erro de tabela/role

Peça ao responsável pelo banco que confirme o provisionamento das estruturas de
perfil, autorização e automações necessárias ao cadastro por convite.

### Link abre, mas a tela diz que expirou

Confira `AUTH_REDIRECT_URL`, a allow list do Supabase, o horário do computador e
se o link já foi utilizado.

### Cookie funciona em localhost, mas não em produção

Confira HTTPS, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`,
`AUTH_COOKIE_SECURE=true` e a estratégia `SameSite`. Não use `*` com cookies.
