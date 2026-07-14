# SusPredict — Arquitetura do Agente SusBot

**Status: PROPOSTO**

## Escopo deste documento

Este documento fecha a parte de backend deixada pendente em
[telas/07-pontos-em-aberto.md](./telas/07-pontos-em-aberto.md) e em
[telas/08-painel-susbot.md](./telas/08-painel-susbot.md): como o SusBot efetivamente
responde a uma pergunta livre do usuário — não o layout do painel (já fechado), mas o
"cérebro" por trás dele.

**Mudança de escopo em relação ao roadmap anterior:** [02-produto.md](./02-produto.md)
descreve duas fases — Fase 1 (Gemini gerando 3-4 linhas de texto automático, sem
LangGraph) e Fase 2 (agente completo via LangGraph, pós-MVP). O grupo decidiu, na
conversa que originou este documento, puxar boa parte da Fase 2 para dentro do MVP: o
SusBot deve responder perguntas livres do usuário com acesso a dado real (não só gerar
texto automático). O texto automático da Camada 2 da Visão Geral continua existindo como
está — este documento cobre o agente conversacional que roda por trás do painel de chat.
[03-arquitetura.md](./03-arquitetura.md) já antecipava "FastAPI + LangGraph (SusBot)" na
camada de aplicação da arquitetura de visão — este spec é a materialização concreta
disso, adiantada para o MVP.

## Estado atual do backend (ponto de partida)

Antes de desenhar o agente, o que já existe hoje:

- **Dado real:** apenas resultados de runs do DATASUS (SIM, SIH, SINASC, SINAN) —
  séries temporais, distribuição por sexo/faixa etária, top causas — persistidos em
  SQLite sempre e Supabase quando configurado (`api/core/db.py`).
- **Não existe** tabela de estoque/insumos real — o módulo de Insumos
  ([telas/02-ruptura-insumos.md](./telas/02-ruptura-insumos.md)) ainda é só protótipo
  mockado no frontend.
- **Não existe** tabela de alertas real — a Central de Alertas
  ([telas/03-central-alertas.md](./telas/03-central-alertas.md)) também é só protótipo.
- **Não existe** integração com Gemini nem com LangChain/LangGraph em nenhum lugar do
  código — nenhuma dependência no `requirements_api.txt`.
- **Não existe** vínculo usuário↔município no backend — `auth.py` só faz
  signup/login via Supabase GoTrue (email/senha); o parâmetro `ibge` é aceito solto em
  qualquer request, sem checar propriedade/permissão.

Este spec, portanto, inclui criar duas tabelas novas (estoque e alertas) — não é só
"conectar o agente a dado que já existe".

## Decisão 1 — Dados novos: tabelas de estoque e alertas

Para o agente responder de forma útil sobre estoque e alertas (os exemplos centrais do
produto, ver [02-produto.md](./02-produto.md)), o MVP precisa de dado real mínimo, não
só mockado no frontend:

- **`estoque`**: município (ibge6), item, quantidade atual, consumo médio (unidade/dia),
  atualizado_em. Cálculo de "dias restantes" é derivado (`quantidade / consumo_médio`),
  não armazenado.
- **`alertas`**: município (ibge6), tipo (`surto` / `ruptura` / `ocupação`), item ou
  condição de origem, severidade, status (`novo` / `em_andamento` / `resolvido`),
  criado_em.

Ambas seguem o mesmo padrão de `api/core/db.py` (SQLite sempre, Supabase quando
configurado). **Decisão:** ambas nascem populadas com **dado sintético gerado para a
demonstração** (mesmo espírito do fallback sintético que `api/main.py` já usa quando o
PySUS está indisponível — SIM +1,8%/ano, SIH +1,5%/ano, etc.), não vazias aguardando
CRUD manual. Isso garante que o agente sempre tem algo a responder na demo, mesmo sem
um fluxo de cadastro de estoque implementado ainda.

## Decisão 2 — Um agente, múltiplas ferramentas (não multi-agente com roteador)

Um único agente conversacional, não um roteador despachando para agentes especialistas.
Motivo: para o escopo atual (3-4 domínios de dado: epidemiologia, estoque, alertas), um
roteador adiciona uma chamada de LLM extra por pergunta e mais uma camada para debugar,
sem ganho real — o próprio modelo, com function calling, já decide qual ferramenta
chamar a partir da pergunta.

Ferramentas da v1:
- `consultar_epidemiologia(ibge6, sistema, ano_ini, ano_fim, doenca_cod=None)` — lê de
  `datasus_runs`/`datasus_serie`, dado já existente.
- `consultar_estoque(ibge6, item=None)` — lê da tabela `estoque` nova.
- `consultar_alertas(ibge6, status=None, tipo=None)` — lê da tabela `alertas` nova.

## Decisão 3 — Ferramentas híbridas: parametrizadas + fallback de SQL controlado

- **Caminho padrão:** as três ferramentas acima, com parâmetros tipados — o modelo
  nunca escreve SQL para essas perguntas, só escolhe função + argumentos. Cobre a
  maioria dos casos de uso esperados (docs/02-produto.md, exemplos de pergunta).
- **Fallback:** quando a pergunta não se encaixa em nenhuma ferramenta parametrizada
  (ex: um cruzamento específico que ninguém previu), o agente pode gerar uma consulta
  `SELECT`, validada antes de executar:
  - Apenas `SELECT` — rejeita qualquer `INSERT`/`UPDATE`/`DELETE`/`DROP`/DDL.
  - Apenas tabelas de uma allowlist explícita (as mesmas do parágrafo acima — nunca
    tabelas de autenticação, credenciais, ou outras não previstas).
  - Um único statement por chamada (sem `;` encadeado).
  - Se a validação rejeitar, o agente recebe o motivo da rejeição como resultado da
    ferramenta (não como erro fatal) e pode tentar reformular ou responder que não
    conseguiu obter o dado — nunca expõe erro de SQL cru ao usuário final.
  - **Decisão:** validação via parser real de SQL (ex: `sqlglot`), não regex/allowlist
    de palavras-chave — um parser entende a árvore da query (consegue distinguir um
    `SELECT` legítimo de uma tentativa de subquery/CTE escondendo uma escrita) de um
    jeito que checagem textual não garante. Mais confiável para algo exposto a
    entrada gerada por LLM.

## Decisão 4 — Isolamento por município: risco aceito nesta fase

Não existe hoje vínculo usuário↔município no backend. Implementar isolamento completo
(um usuário só pode consultar o(s) município(s) da sua conta) depende de autenticação
JWT completa, já listada como item de "Fase 1 pós-TCC" em
[02-produto.md](./02-produto.md). Decisão: **este spec não resolve isolamento
multi-tenant** — é registrado explicitamente como limitação conhecida, não como algo
"OK por enquanto e esquecido". Consequência prática: no estado atual (demo/TCC), tanto
o agente quanto os endpoints REST já existentes (`/api/overview/{ibge}`, etc.) confiam
no `ibge` que o frontend envia, sem checar propriedade. Quando o vínculo
usuário↔município for implementado, o guardrail do agente (ferramentas parametrizadas
e o fallback de SQL) deve passar a receber o `ibge` a partir da sessão autenticada, não
do que o usuário pedir em texto livre — mudança pontual e localizada quando chegar a
hora, não um redesenho.

## Decisão 5 — Orquestração: LangGraph + Gemini

Adota LangGraph já nesta fase (não só function calling nativo do Gemini), antecipando
a infraestrutura que a Fase 2 do produto já previa. Cada ferramenta parametrizada e o
fallback de SQL controlado viram *tools* do grafo; o nó de decisão usa Gemini como LLM
subjacente. Implica adicionar `langgraph`, `langchain-google-genai` (ou equivalente) e
`google-generativeai` ao `api/requirements_api.txt`, e uma variável de ambiente nova
(`GEMINI_API_KEY`) — nenhuma dessas dependências existe hoje no projeto.

## Decisão 6 — Entrega via streaming (SSE)

O endpoint que recebe a pergunta do painel (`08-painel-susbot.md`) entrega a resposta
via Server-Sent Events, token a token, consistente com a UX de "digitando..." já
desenhada na tela. Não é um endpoint de job assíncrono com polling (padrão usado em
`/api/download` + `/api/status/{job_id}` para downloads longos do DATASUS) — a
natureza da interação é conversacional, então streaming direto é mais adequado que
polling.

## Fluxo ponta a ponta

```
Usuário digita pergunta no painel (08-painel-susbot.md)
        ↓
Frontend envia: { pergunta, tela_atual, conversa_id } via SSE request
        ↓
Backend (novo endpoint, ex: POST /api/susbot/perguntar)
        ↓
Grafo LangGraph (Gemini) decide:
   ├─ chamar 1+ ferramentas parametrizadas (estoque / epidemiologia / alertas)
   ├─ ou gerar SQL controlado (fallback, validado antes de executar)
   └─ ou responder direto (pergunta não precisa de dado novo)
        ↓
Resultado da(s) ferramenta(s) volta pro modelo → formula resposta em texto
        ↓
Resposta stream de volta ao frontend (token a token)
        ↓
Mensagem completa persistida em `susbot_mensagens` (já especificado em
08-painel-susbot.md), incluindo referência de tela de origem se houver
(para o link "ver em X")
```

## O que NÃO entra nesta v1

| Removido | Motivo |
|---|---|
| Multi-agente com roteador de intenção | Complexidade desnecessária para 3-4 domínios de dado — um agente com ferramentas já resolve |
| Isolamento multi-tenant completo | Depende de JWT completo, já roadmap de Fase 1 pós-TCC — registrado como risco aceito, não resolvido aqui |
| SQL livre sem validação | Inaceitável — todo fallback de SQL passa por allowlist de tabelas + checagem de SELECT puro |
| Ferramentas para ETP | ETP já tem geração própria via IA (Etapa 3 de [telas/04-gerador-etp.md](./telas/04-gerador-etp.md)) — não é uma pergunta conversacional |
| Limite de custo/taxa de chamadas ao Gemini | Fora de escopo para demo/TCC — considerar se o projeto avançar para uso real com múltiplos municípios |

## Perguntas em aberto para aprovação

Nenhuma pendência bloqueante — ambas as questões da rodada anterior foram resolvidas
(dado sintético para estoque/alertas; `sqlglot` para validação do fallback de SQL).
