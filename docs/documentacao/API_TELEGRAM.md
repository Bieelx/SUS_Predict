# API de integração do SusBot com o Telegram

## 1. Objetivo

Esta API conecta uma conta do Telegram a um usuário autenticado do SusPredict. Depois
do pareamento, as mensagens enviadas ao bot usam o mesmo SusBot, o mesmo município e o
mesmo histórico acessível pela interface web.

A integração foi desenhada com quatro propriedades principais:

- o Telegram não recebe a senha nem o token de autenticação do SusPredict;
- o código de conexão é aleatório, temporário e de uso único;
- a conta encontrada no Telegram precisa ser confirmada no SusPredict autenticado;
- cada identidade externa fica vinculada a somente um usuário interno ativo.

## 2. Estado atual

O provedor suportado nesta versão é `telegram`. A implementação inclui:

- criação, consulta, confirmação e cancelamento de pareamentos;
- revogação da conexão pelo SusPredict;
- recebimento de mensagens pelo webhook do Telegram;
- validação do segredo do webhook;
- deduplicação de updates repetidos;
- restrição a conversas privadas;
- continuidade do histórico entre web e Telegram;
- memória pessoal isolada por usuário;
- apresentação específica para o Telegram;
- bloqueio de ações que exigem confirmação no aplicativo.

## 3. Componentes

| Componente | Responsabilidade |
|---|---|
| `api/core/channel_router.py` | Rotas REST, webhook, pareamento, adaptação de mensagens e chamada ao SusBot |
| `api/core/db.py` | Persistência de pareamentos, conexões, eventos, conversas e mensagens |
| `api/core/susbot_agent.py` | Criação e execução do agente com histórico e contexto |
| `api/core/susbot_memory.py` | Aprendizado, consulta e exclusão da memória pessoal criptografada |
| `frontend/src/shared/susbotClient.js` | Cliente HTTP usado pela interface de conexão |
| `frontend/src/pages/SusBotPanel.jsx` | Fluxo visual de conectar, confirmar e desconectar o Telegram |
| `start_dev.sh` | Túnel HTTPS temporário e registro automático do webhook em desenvolvimento |

Todas as rotas descritas abaixo usam o prefixo:

```text
/api/susbot
```

## 4. Visão da arquitetura

```text
┌───────────────────────┐       HTTPS        ┌────────────────────────┐
│ Aplicativo SusPredict│ ─────────────────▶ │ API FastAPI            │
│ usuário autenticado  │                  │ /api/susbot/canais    │
└───────────────────────┘                  └───────────┬────────────┘
          ▲                                            │
          │ confirmação                                │ persiste identidade,
          │                                            │ conversa e eventos
          │                                  ┌─────────▼─────────┐
┌─────────┴─────────────┐    webhook HTTPS     │ SQLite local      │
│ Telegram / SusBot     │ ─────────────────────▶ │ + agente SusBot   │
│ conversa privada      │ ◀───────────────────── │                   │
└───────────────────────┘   Bot API sendMessage └───────────────────┘
```

O Telegram entrega mensagens para a API por webhook. A API localiza a conexão pelo
identificador do remetente, carrega a conversa e a memória pertencentes ao usuário
interno, executa o SusBot e envia a resposta pela Bot API.

## 5. Configuração

### 5.1 Variáveis obrigatórias

```dotenv
TELEGRAM_BOT_USERNAME=SusPredictBot
TELEGRAM_BOT_TOKEN=token_fornecido_pelo_BotFather
TELEGRAM_WEBHOOK_SECRET=segredo_longo_aleatorio
CHANNEL_PAIRING_SECRET=outro_segredo_independente_com_32_ou_mais_caracteres
```

| Variável | Uso | Regras |
|---|---|---|
| `TELEGRAM_BOT_USERNAME` | Monta o deep link `t.me/<bot>?start=<codigo>` | Pode ser informado com ou sem `@` |
| `TELEGRAM_BOT_TOKEN` | Autoriza chamadas da API para a Bot API | Segredo de alto impacto; nunca versionar |
| `TELEGRAM_WEBHOOK_SECRET` | Autentica requests recebidos do Telegram | Em desenvolvimento, apenas letras, números, `_` e `-`; máximo de 256 caracteres |
| `CHANNEL_PAIRING_SECRET` | Gera o HMAC dos códigos de pareamento | Deve ser independente e ter pelo menos 32 caracteres |

Para a memória pessoal do SusBot em produção, também é recomendado configurar:

```dotenv
SUSBOT_MEMORY_KEY=<chave-fernet>
```

Em desenvolvimento, o projeto pode criar uma chave local em `api/.secrets/`. Em
produção, a chave deve vir de um gerenciador de segredos e permanecer estável; sua
perda impede a leitura das memórias já criptografadas.

### 5.2 Gerando segredos

Exemplo para gerar segredos sem reutilizar o token do bot:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Execute o comando separadamente para `TELEGRAM_WEBHOOK_SECRET` e
`CHANNEL_PAIRING_SECRET`.

### 5.3 Desenvolvimento local

Com as quatro variáveis do Telegram preenchidas:

```bash
bash start_dev.sh
```

O script:

1. inicia a API em `http://localhost:8000`;
2. instala ou reutiliza o `cloudflared` local;
3. abre um Quick Tunnel HTTPS para a API;
4. registra automaticamente o endpoint abaixo com `setWebhook`;
5. limita os updates solicitados ao tipo `message`;
6. remove o webhook temporário quando o script é encerrado normalmente.

```text
https://<subdominio-temporario>.trycloudflare.com/api/susbot/telegram/webhook
```

O túnel automático pode ser desativado:

```dotenv
ENABLE_TELEGRAM_TUNNEL=false
```

O Quick Tunnel é adequado apenas para desenvolvimento. Sua URL muda a cada execução.

### 5.4 Produção

Em produção, publique a API em um domínio HTTPS estável e registre o webhook uma
única vez:

```bash
curl --request POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --header "Content-Type: application/json" \
  --data "{
    \"url\": \"https://api.exemplo.com/api/susbot/telegram/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\"]
  }"
```

O proxy ou balanceador deve encaminhar o header
`X-Telegram-Bot-Api-Secret-Token` sem removê-lo.

## 6. Autenticação

As rotas de gerenciamento de canais exigem a autenticação normal do SusPredict:

```http
Authorization: Bearer <token-do-usuario>
```

O endpoint do webhook não usa o token de um usuário. Ele valida o segredo enviado
pelo Telegram:

```http
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

Se `TELEGRAM_WEBHOOK_SECRET` não estiver configurado, o webhook responde `503`. Se o
header estiver ausente ou incorreto, responde `403`.

## 7. Fluxo de pareamento

```text
1. Usuário autenticado solicita um pareamento no SusPredict
2. API gera 32 bytes aleatórios e devolve código + deep link
3. API persiste somente HMAC-SHA256(código), nunca o código bruto
4. Usuário abre o bot e envia /start <código>
5. Telegram entrega o update ao webhook
6. API marca o pareamento como reivindicado e mostra a conta encontrada no app
7. Usuário confirma a conexão dentro do SusPredict autenticado
8. API ativa a conexão e avisa o usuário no Telegram
```

O código expira em **10 minutos** e só pode ser reivindicado uma vez. Criar um novo
pareamento cancela os pareamentos ainda abertos do mesmo usuário e provedor.

### Estados do pareamento

```text
emitido ──▶ reivindicado ──▶ confirmado
   │             │
   └──▶ cancelado ◀──┘

emitido ou reivindicado ──▶ expirado, apó expira_em
```

`expirado` é um estado calculado na leitura quando um pareamento aberto ultrapassa
`expira_em`.

## 8. Referência dos endpoints

### 8.1 Listar conexões ativas

```http
GET /api/susbot/canais
Authorization: Bearer <token>
```

Resposta `200`:

```json
{
  "itens": [
    {
      "id": "9fbd...",
      "provedor": "telegram",
      "external_username": "gabriel",
      "ibge6": "351300",
      "status": "ativo",
      "conectado_em": "2026-08-12T20:00:00+00:00",
      "ultimo_uso_em": "2026-08-12T20:04:00+00:00"
    }
  ]
}
```

Os identificadores numéricos internos do Telegram não são expostos nesta resposta.

### 8.2 Criar pareamento

```http
POST /api/susbot/canais/pareamentos
Authorization: Bearer <token>
Content-Type: application/json
```

Corpo:

```json
{
  "provedor": "telegram",
  "ibge6": "351300"
}
```

Resposta `201`:

```json
{
  "id": "2c99...",
  "provedor": "telegram",
  "ibge6": "351300",
  "status": "emitido",
  "external_username": null,
  "criado_em": "2026-08-12T20:00:00+00:00",
  "expira_em": "2026-08-12T20:10:00+00:00",
  "reivindicado_em": null,
  "confirmado_em": null,
  "codigo": "codigo-opaco-de-uso-unico",
  "deep_link": "https://t.me/SusPredictBot?start=codigo-opaco-de-uso-unico",
  "configurado": true
}
```

Possíveis erros:

| Status | Motivo |
|---|---|
| `400` | Provedor não suportado ou `ibge6` inválido |
| `401` | Usuário não autenticado ou inválido |
| `503` | Integração real ativa sem `CHANNEL_PAIRING_SECRET` |

### 8.3 Consultar pareamento

```http
GET /api/susbot/canais/pareamentos/{pareamento_id}
Authorization: Bearer <token>
```

A interface consulta esta rota a cada dois segundos enquanto o status é `emitido` ou
`reivindicado`.

Possíveis erros:

| Status | Motivo |
|---|---|
| `403` | O pareamento pertence a outro usuário |
| `404` | Pareamento inexistente |

### 8.4 Confirmar pareamento

```http
POST /api/susbot/canais/pareamentos/{pareamento_id}/confirmar
Authorization: Bearer <token>
```

Não possui corpo. Só aceita um pareamento `reivindicado`, ainda válido e pertencente
ao usuário autenticado.

Resposta `200`:

```json
{
  "id": "b831...",
  "provedor": "telegram",
  "external_username": "gabriel",
  "ibge6": "351300",
  "status": "ativo",
  "conectado_em": "2026-08-12T20:03:00+00:00",
  "ultimo_uso_em": null
}
```

Possíveis erros:

| Status | Motivo |
|---|---|
| `403` | O pareamento pertence a outro usuário |
| `404` | Pareamento inexistente |
| `409` | Ainda não reivindicado ou conta externa conectada a outro usuário |
| `410` | Pareamento expirado ou indisponível |

### 8.5 Cancelar pareamento

```http
DELETE /api/susbot/canais/pareamentos/{pareamento_id}
Authorization: Bearer <token>
```

Resposta `204`, sem corpo. Cancela pareamentos `emitido` ou `reivindicado`.

### 8.6 Revogar conexão

```http
DELETE /api/susbot/canais/telegram
Authorization: Bearer <token>
```

Resposta `204`, sem corpo. A conexão passa para `revogado`, perde sua conversa atual e
o bot avisa a conta desconectada. Uma nova utilização exige outro pareamento.

### 8.7 Webhook do Telegram

```http
POST /api/susbot/telegram/webhook
X-Telegram-Bot-Api-Secret-Token: <segredo>
Content-Type: application/json
```

Exemplo reduzido de update aceito:

```json
{
  "update_id": 123456,
  "message": {
    "text": "Quais insumos estão em falta?",
    "from": {
      "id": 778899,
      "username": "gabriel"
    },
    "chat": {
      "id": 778899,
      "type": "private"
    }
  }
}
```

Resposta imediata `200`:

```json
{
  "ok": true
}
```

O processamento da mensagem é colocado em uma `BackgroundTask` do FastAPI para que o
webhook responda rapidamente. Updates sem texto ou sem identificadores de remetente e
chat são ignorados.

## 9. Processamento de uma mensagem

Depois que a conexão está ativa, o fluxo é:

1. validar e deduplicar o `update_id`;
2. aceitar somente `chat.type = private`;
3. localizar a conexão ativa por `provedor + external_user_id`;
4. obter a conversa atual ou criar uma nova;
5. carregar as oito mensagens recentes da conversa;
6. aprender somente fatos pessoais permitidos da nova mensagem;
7. fornecer histórico, memória pessoal, município e origem `telegram` ao SusBot;
8. executar as ferramentas de consulta do agente;
9. persistir pergunta e resposta em `susbot_mensagens`;
10. adaptar a apresentação ao Telegram;
11. enviar a resposta por `sendMessage`.

O `ibge6` usado pelo bot vem da conexão confirmada, não de um código livre enviado
na mensagem.

## 10. Comandos do bot

| Comando | Comportamento |
|---|---|
| `/start <codigo>` | Reivindica um pareamento emitido pelo SusPredict |
| `/nova` | Encerra a referência à conversa atual; a próxima pergunta cria uma conversa |
| `/new` | Alias de `/nova` |
| `/clear` | Alias de `/nova`; não apaga o histórico persistido |
| `/memoria` | Mostra os fatos pessoais e assuntos frequentes memorizados |
| `/memory` | Alias de `/memoria` |
| `/esquecer` | Apaga toda a memória pessoal do usuário |
| `/forget` | Alias de `/esquecer` |
| `/esquecer nome` | Remove uma categoria específica, quando existente |

O histórico e a memória são conceitos diferentes: `/clear` inicia uma nova conversa,
enquanto `/esquecer` remove fatos pessoais memorizados.

## 11. Apresentação das respostas

O texto armazenado no histórico continua sendo a resposta completa do SusBot. Antes
de enviá-lo ao Telegram, a API cria uma versão apropriada para telas pequenas:

- estoque vira uma lista vertical com estado, cobertura e metadados consolidados;
- alertas viram blocos verticais com severidade e descrição;
- o subconjunto usado de Markdown é convertido para HTML do Telegram;
- texto externo é escapado antes da inclusão de tags;
- previews de links são desativados;
- mensagens longas são divididas em partes de até 3.500 caracteres, preservando
  parágrafos e palavras sempre que possível.

Exemplo:

```text
📦 Cobertura do estoque
8 itens consultados

🟠 Dipirona 500mg
14 dias de cobertura · atenção

📋 Sobre os dados
Fonte: estoque local informado pelo município
Atualização: 14/07/2026
Confiança: reduzida
```

O envio usa `parse_mode: "HTML"`. O conversor suporta títulos Markdown, `**negrito**`
e código inline. Ele não é um renderizador Markdown completo.

## 12. Persistência

### `canal_pareamentos`

Guarda a solicitação temporária, o hash do código, o município, os estados e os
dados externos capturados na reivindicação. O código bruto nunca é persistido.

### `canal_conexoes`

Relaciona o usuário interno à identidade do Telegram. As constraints garantem:

- uma conexão por `usuario + provedor`;
- uma identidade externa por `provedor + external_user_id`.

Uma reconexão do mesmo usuário e provedor atualiza o registro e inicia sem uma
conversa corrente.

### `canal_eventos`

Tem chave primária composta por `provedor + external_id`. O `update_id` é registrado
antes do processamento para impedir que uma reentrega do Telegram gere uma resposta
duplicada.

### `susbot_conversas` e `susbot_mensagens`

As mensagens do Telegram são armazenadas nas mesmas estruturas usadas pelo histórico
web. `tela_origem` recebe `telegram`, permitindo identificar o canal sem separar a
identidade ou duplicar o histórico.

### `susbot_memorias`

Cada fato é associado a `owner_ref`, derivado do usuário autenticado. O payload é
criptografado com Fernet. A camada de memória bloqueia credenciais, dados clínicos
pessoais e outras categorias sensíveis, além de fornecer comandos de transparência e
exclusão.

## 13. Controles de segurança

| Controle | Proteção oferecida |
|---|---|
| Token aleatório de 32 bytes | Dificulta adivinhação do código de pareamento |
| HMAC-SHA256 com segredo próprio | Evita armazenar o código bruto e dificulta ataque offline |
| Validade de 10 minutos | Reduz a janela de exposição |
| Uso único | Impede reaproveitamento do mesmo código |
| Confirmação bilateral | O `/start` sozinho não ativa a conexão |
| Comparação constante do segredo | Reduz vazamento temporal na validação do webhook |
| Conversa privada obrigatória | Evita vincular ou consultar dados em grupos |
| Constraints de unicidade | Impedem uma conta externa ativa em dois usuários |
| Deduplicação por `update_id` | Impede processamento repetido de reentregas |
| Escape de HTML | Impede que conteúdo dinâmico injete tags no Telegram |
| Ações somente no app | Escritas planejadas pelo agente não são executadas no Telegram |
| Memória por `owner_ref` | Impede que o contexto de Gabriel seja carregado na sessão de Yasmin |

Boas práticas operacionais:

- nunca registrar o `TELEGRAM_BOT_TOKEN`, o código bruto ou segredos em logs;
- usar segredos diferentes para webhook, pareamento e criptografia de memória;
- rotacionar imediatamente o token do bot se ele for exposto;
- manter backups protegidos da chave Fernet;
- aplicar rate limiting no proxy de produção;
- monitorar respostas `403`, falhas de envio e aumento anormal de updates.

## 14. Ações com confirmação

O Telegram pode consultar dados e conversar com o SusBot. Quando o agente planeja uma
ferramenta de escrita, como a geração de um ETP, a integração **não executa a
ação**. Ela responde:

```text
⚠️ Esta ação precisa ser confirmada no SusPredict.
```

Essa separação é intencional: o Telegram não possui, nesta versão, um fluxo de
reautenticação e consentimento forte equivalente ao aplicativo.

## 15. Diagnóstico

### O bot não responde

1. confirme que a API e o túnel continuam executando;
2. verifique se o terminal mostrou `Webhook Telegram → registrado`;
3. consulte o webhook atual:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

4. confira `url`, `pending_update_count` e `last_error_message`;
5. verifique os logs da API por `Falha ao processar mensagem do Telegram`;
6. reinicie `start_dev.sh` se a URL temporária do túnel mudou.

### O webhook responde `403`

O `secret_token` registrado no Telegram não coincide com
`TELEGRAM_WEBHOOK_SECRET`, ou o proxy removeu o header de autenticação. Registre o
webhook novamente com o valor atual.

### O webhook responde `503`

`TELEGRAM_WEBHOOK_SECRET` não está disponível no processo da API. Verifique o `.env` e
reinicie a aplicação.

### O bot pede uma nova conexão

A identidade externa não possui conexão ativa. No SusPredict, abra **SusBot → Canais**,
gere outro link, envie `/start <codigo>` no privado e confirme a conta encontrada.

### O link é inválido ou expirou

O código expirou, foi cancelado ou já foi reivindicado. Gere um novo. Códigos não
podem ser reutilizados, mesmo pelo mesmo Telegram.

### Funciona no privado, mas não no grupo

Esse é o comportamento esperado. A implementação rejeita grupos por segurança.

### A resposta aparece no Telegram, mas não no histórico esperado

Confirme que o mesmo usuário autenticado realizou a confirmação do pareamento. Use
`/nova` apenas para iniciar outra conversa; esse comando não remove conversas antigas.

## 16. Testes

Os testes da integração ficam em `api/tests/test_channel_router.py` e cobrem:

- token de uso único, confirmação bilateral e revogação;
- deduplicação de updates;
- continuidade e reinício de conversa;
- entrega do histórico recente ao agente;
- memória pessoal;
- segredo do webhook e ausência de configuração;
- rejeição de grupos;
- apresentação de estoque;
- HTML seguro e divisão de mensagens longas.

Execução:

```bash
source venv/bin/activate
pytest -q api/tests/test_channel_router.py
```

Para validar toda a API:

```bash
source venv/bin/activate
pytest -q api/tests
```

## 17. Limitações atuais e próximos passos

### Limitações

- pareamentos, conexões e eventos ficam no SQLite local nesta implementação;
- a tarefa de processamento roda no mesmo processo da API e não possui fila durável;
- somente mensagens de texto comuns são processadas;
- grupos, arquivos, fotos, áudio, mensagens editadas e callbacks não são suportados;
- a resposta enviada ao Telegram não inclui os artefatos visuais interativos da web;
- ações de escrita precisam ser concluídas no SusPredict;
- o formatador genérico cobre apenas um subconjunto de Markdown.

### Evoluções recomendadas antes de escala real

1. mover identidade de canais e deduplicação para uma persistência compartilhada;
2. substituir `BackgroundTask` por uma fila durável com retry e dead-letter queue;
3. adicionar rate limiting por conta externa e usuário interno;
4. registrar métricas de latência, falha e volume sem armazenar conteúdo sensível;
5. adicionar formatadores tipados para epidemiologia e futuros artefatos;
6. definir um fluxo de consentimento forte antes de permitir qualquer escrita no canal;
7. estabelecer retenção e limpeza de `canal_eventos` e pareamentos antigos.

## 18. Arquivos de referência

- `api/core/channel_router.py`
- `api/core/db.py`
- `api/core/susbot_agent.py`
- `api/core/susbot_memory.py`
- `api/tests/test_channel_router.py`
- `frontend/src/shared/susbotClient.js`
- `frontend/src/shared/susbotContract.js`
- `frontend/src/pages/SusBotPanel.jsx`
- `start_dev.sh`

