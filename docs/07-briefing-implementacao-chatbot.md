# Briefing — Do Spec ao Código: Gaps de Backend do Chatbot (SusBot)

## Para que serve este documento

Este arquivo **não é um spec novo** — é o ponto de partida para a próxima sessão de
brainstorming/grilling, focada em transformar as decisões de arquitetura já fechadas
([06-agente-susbot.md](./06-agente-susbot.md) e
[telas/08-painel-susbot.md](./telas/08-painel-susbot.md)) num plano de implementação
concreto. Ele resume o que já está decidido (pra não reabrir debate) e lista, por
categoria, as perguntas que ainda faltam responder antes de começar a codar — cole
este arquivo como contexto na próxima conversa.

**Chatbot é o próximo entregável.** O objetivo da próxima sessão é sair com respostas
suficientes para escrever um plano de implementação (arquivos a criar/editar, ordem de
construção, critérios de pronto).

## O que já está fechado (não rediscutir)

| Decisão | Onde está |
|---|---|
| Painel lateral à direita, campo livre, sem sugestões pré-definidas | [telas/08](./telas/08-painel-susbot.md) |
| Conversas como threads (não linha do tempo única), histórico navegável, "Nova conversa" arquiva a atual | [telas/08](./telas/08-painel-susbot.md) |
| Link "ver em X" navega na mesma aba, painel continua aberto | [telas/08](./telas/08-painel-susbot.md) |
| Um agente, múltiplas ferramentas (não multi-agente com roteador) | [06](./06-agente-susbot.md) |
| Ferramentas híbridas: parametrizadas (padrão) + SQL controlado via `sqlglot` (fallback) | [06](./06-agente-susbot.md) |
| LangGraph + Gemini, entrega via streaming (SSE) | [06](./06-agente-susbot.md) |
| Tabelas `estoque` e `alertas` nascem com **dado sintético** para demo | [06](./06-agente-susbot.md) |
| Isolamento por município: **risco aceito nesta fase** (sem JWT completo ainda) | [06](./06-agente-susbot.md) |

## Estado atual do código (não precisa re-explorar)

- `api/core/db.py`: SQLite sempre + Supabase opcional. Só tem tabelas de runs
  DATASUS (`datasus_runs`, `datasus_serie`, `datasus_sexo`, `datasus_faixa_etaria`,
  `datasus_top_causas`, `datasus_resultado`). Nenhuma tabela de estoque, alerta ou
  conversa existe ainda.
- `frontend/src/App.jsx` (linha ~1082 em diante) já tem um **mock** de SusBot
  (`FloatingChat`, `askSusBot`) com respostas fixas/simuladas — é o protótipo que
  **não será reaproveitado** (mesma decisão geral do resto do `App.jsx`, ver
  `CLAUDE.md`), mas serve de referência de onde o componente novo entra na árvore.
- `api/core/auth.py`: só signup/login via Supabase GoTrue (email/senha). Nenhum
  vínculo usuário↔município.
- **Não existe nenhuma suíte de testes no projeto** (nem backend nem frontend) —
  qualquer estratégia de teste para o agente parte do zero.
- `api/requirements_api.txt` não tem `langgraph`, `langchain-google-genai`,
  `google-generativeai`, nem `sqlglot`.

## O que falta decidir, por categoria

### 1. Schema exato das tabelas novas

O spec 06 dá os campos em prosa, não o DDL. Falta fechar, para cada tabela
(`estoque`, `alertas`, e as de conversa do spec 08 — `susbot_conversas`,
`susbot_mensagens`):
- Tipos de coluna exatos, chaves primárias/estrangeiras, índices.
- `estoque`: uma linha por item por município, ou histórico de mudanças de
  quantidade ao longo do tempo (para o agente responder "como meu estoque variou")?
- `alertas`: precisa de campo de texto livre (descrição) além de tipo/severidade/
  status, ou os campos estruturados bastam para o agente formular a resposta?
- `susbot_conversas.usuario`: qual identificador usar, já que não há tabela de
  usuários local — o `user_id` do Supabase GoTrue (retornado por `auth.get_user`)?

### 2. Geração de dado sintético (estoque/alertas)

`api/main.py` já tem um padrão de fallback sintético para SIM/SIH/SINASC/SIA
(tendências percentuais ao ano). Falta decidir o equivalente para estoque/alertas:
- Quantos itens de estoque por município simular, com que nomes (medicamentos
  genéricos fixos, tipo Dipirona/Soro Fisiológico, ou lista maior)?
- Alertas sintéticos: quantos por município, distribuição entre os 3 tipos (surto/
  ruptura/ocupação), quantos em cada status?
- Isso é gerado uma vez (seed fixo) ou recalculado a cada request, como o restante
  do fallback sintético do sistema hoje?

### 3. Dependências e configuração

- Versões exatas a pinar em `requirements_api.txt`: `langgraph`,
  `langchain-google-genai` (ou `google-generativeai` puro?), `sqlglot`.
- Variável de ambiente `GEMINI_API_KEY` — quem já tem/vai gerar essa chave (Google
  AI Studio)? Precisa de instrução no README/CLAUDE.md de onde configurar (mesmo
  padrão do `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`)?
- Qual modelo Gemini usar (ex: `gemini-1.5-flash` vs `gemini-1.5-pro`) — trade-off
  custo/velocidade vs qualidade de resposta, dado que é projeto de TCC sem
  orçamento real.

### 4. Contrato do endpoint

- Rota e verbo (ex: `POST /api/susbot/perguntar`) — payload exato: `pergunta`,
  `tela_atual`, `conversa_id` (novo ou existente)?
- Formato dos eventos SSE: só texto incremental, ou também eventos estruturados
  (ex: um evento `referencia` separado, com a rota de "ver em X", antes do evento de
  texto)?
- Exige autenticação (reaproveitar `require_user` de `auth.py`) desde já, ou fica
  aberto nesta fase por conta do isolamento por município ser risco aceito mesmo
  assim?

### 5. Ferramentas do agente (assinatura e contrato de retorno)

- Assinatura exata de `consultar_epidemiologia`, `consultar_estoque`,
  `consultar_alertas` — parâmetros obrigatórios vs opcionais, formato de retorno
  (dict puro? já formatado como texto parcial?).
- O que cada ferramenta retorna quando não encontra dado (estoque zerado, nenhum
  alerta ativo) — string vazia, `None`, ou uma mensagem estruturada tipo
  `{"encontrado": false}`?

### 6. Validação do fallback de SQL (`sqlglot`)

- Allowlist exata de tabelas e colunas expostas ao modelo para gerar SQL livre —
  schema completo das tabelas do agente, ou uma view/subset reduzido (sem colunas
  internas tipo `raw_bucket`, `raw_object_path`)?
- O que fazer quando o `sqlglot` rejeita a query: quantas tentativas de
  reformulação o agente pode fazer antes de desistir e responder "não consegui"?

### 7. Persistência de conversa (spec 08)

- Regra exata de título da conversa: primeiros N caracteres da primeira pergunta?
  Trunca em quê (palavra, caractere)?
- Paginação: tamanho de página ao carregar mensagens antigas (scroll pra cima) e
  ao listar conversas no histórico.

### 8. Testes

- Como testar um agente que depende de uma API externa (Gemini) de forma
  determinística — mockar as respostas do LLM, gravar fixtures de chamadas reais
  (cassette/VCR), ou só teste manual guiado na demo?
- Vale ter testes automatizados para a validação de SQL (`sqlglot`) pelo menos,
  já que é a peça de segurança mais sensível, mesmo sem suíte de testes do resto
  do projeto?

## Como usar este documento

Colar este arquivo inteiro como contexto na próxima conversa e pedir uma nova
sessão de brainstorming/grilling em cima das 8 categorias acima. O resultado
esperado dessa próxima sessão é um plano de implementação (via `writing-plans` ou
equivalente) com arquivos a criar/editar e ordem de construção — não mais decisões
de arquitetura (essas já estão em 06 e 08).
