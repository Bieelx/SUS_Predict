# SusBot - Roadmap de Implementacao por Janelas Curtas

> Objetivo: quebrar o backend do SusBot em tarefas pequenas, cada uma cabendo em uma
> janela de contexto do GPT-5.4 mini, com criterio de aceite objetivo para voce validar
> antes de seguir para a proxima.

**Escopo:** backend do agente, storage, seed sintetico, guard de SQL, tools, streaming SSE,
router HTTP e wiring final. Frontend fica fora deste roadmap.

**Ordem recomendada:** execute na sequencia. Nao avance para a proxima task se a anterior
nao bater o criterio de aceite.

---

## Task 1 - Fechar schema e CRUD de base do SusBot

**Objetivo:** adicionar ao `api/core/db.py` as tabelas `estoque`, `alertas`,
`susbot_conversas` e `susbot_mensagens`, mais os CRUDs basicos para leitura/escrita.

**O que fazer:**
- Criar o DDL das 4 tabelas na `_SCHEMA`.
- Adicionar funcoes de acesso para estoque, alertas, conversas e mensagens.
- Manter o estilo atual do arquivo (`_conn`, sqlite sempre, supabase opcional).

**Resultado esperado:**
- O banco sobe sem erro com as novas tabelas.
- E possivel inserir, ler e filtrar estoque/alertas/conversas/mensagens.

**Aceite:**
- Um teste simples cria uma conversa e uma mensagem e consegue ler de volta.
- Um teste simples insere estoque e alerta e consegue filtrar por `ibge6`.

---

## Task 2 - Seed sintetico deterministico por municipio

**Objetivo:** criar `api/core/susbot_seed.py` para popular estoque e alertas na primeira
vez que um municipio for consultado.

**O que fazer:**
- Gerar uma lista fixa de itens de estoque.
- Gerar alertas sinteticos para os 3 tipos do MVP.
- Fazer o seed ser deterministico por `ibge6`.
- Garantir que a seed rode so uma vez por municipio.

**Resultado esperado:**
- O mesmo `ibge6` sempre produz o mesmo cenario demo.
- Municipios diferentes geram cenarios diferentes.

**Aceite:**
- Chamar a seed duas vezes para o mesmo municipio nao duplica registros.
- O numero e o tipo dos registros permanecem estaveis entre execucoes.

---

## Task 3 - Guard de SQL com `sqlglot`

**Objetivo:** criar `api/core/sql_guard.py` para validar o fallback SQL do agente.

**O que fazer:**
- Permitir apenas `SELECT`.
- Permitir apenas um statement por chamada.
- Bloquear tabelas fora da allowlist.
- Bloquear escrita, DDL e multiplos statements.

**Resultado esperado:**
- Query segura passa.
- Query perigosa falha com motivo legivel.

**Aceite:**
- `SELECT` simples em tabela permitida passa.
- `INSERT`, `UPDATE`, `DELETE`, `DROP`, CTE maliciosa e multi-statement falham.

---

## Task 4 - Tools do agente

**Objetivo:** criar `api/core/susbot_tools.py` com tools parametrizadas e fallback SQL.

**O que fazer:**
- Implementar `consultar_estoque`.
- Implementar `consultar_alertas`.
- Implementar `consultar_epidemiologia`.
- Implementar `executar_sql_fallback`.
- Fixar `ibge6` por closure.
- Retornar sempre dict com `encontrado`.

**Resultado esperado:**
- As tools devolvem dados estruturados e nao texto cru.
- O modelo nao escolhe municipio.

**Aceite:**
- Consulta de estoque encontrado retorna `dados` e dias restantes derivados.
- Consulta vazia retorna `encontrado: false` com `motivo`.
- SQL fallback respeita o guard e a allowlist.

---

## Task 5 - Grafo do agente e streaming

**Objetivo:** criar `api/core/susbot_agent.py` com o fluxo de resposta em SSE.

**O que fazer:**
- Instanciar Gemini via `GEMINI_API_KEY`.
- Montar o agente com LangGraph.
- Emitir eventos `status`, `token`, `referencia` e `fim`.
- Encadear tool call, tool result e resposta final.

**Resultado esperado:**
- Uma pergunta vira stream progressivo de resposta.
- Se houver dado de outra tela, a resposta pode carregar referencia de rota.

**Aceite:**
- Teste com LLM mockado executa tool e gera token stream.
- O fluxo finaliza com evento `fim`.

---

## Task 6 - Router HTTP do SusBot

**Objetivo:** criar `api/core/susbot_router.py` com pergunta via SSE e historico paginado.

**O que fazer:**
- Criar `POST /api/susbot/perguntar`.
- Criar `GET /api/susbot/conversas`.
- Criar `GET /api/susbot/conversas/{id}/mensagens`.
- Gerar titulo automatico a partir da primeira pergunta.
- Validar ownership da conversa pelo `require_user`.

**Resultado esperado:**
- O backend recebe pergunta, responde em stream e persiste a conversa.
- O historico retorna so as conversas do usuario autenticado.

**Aceite:**
- O endpoint cria conversa nova quando `conversa_id` nao vier.
- O endpoint reutiliza conversa existente quando `conversa_id` vier.
- O historico e as mensagens paginam corretamente.

---

## Task 7 - Wiring final no FastAPI

**Objetivo:** conectar o router ao `api/main.py` e atualizar dependencias/documentacao.

**O que fazer:**
- Incluir o router no app.
- Atualizar `api/requirements_api.txt` com `sqlglot`, `langgraph`, `langchain-google-genai` e `pytest`.
- Documentar `GEMINI_API_KEY` no `CLAUDE.md`.

**Resultado esperado:**
- O backend sobe com as novas rotas expostas.
- A configuracao minima para rodar o SusBot fica documentada.

**Aceite:**
- `uvicorn api.main:app --reload --port 8000` sobe sem erro de import.
- `GET /docs` mostra as rotas novas.

---

## Task 8 - Teste de integracao e smoke final

**Objetivo:** validar o fluxo inteiro com o minimo de manualidade.

**O que fazer:**
- Rodar a bateria de testes do backend.
- Fazer um smoke test de pergunta real com credenciais e banco local.
- Conferir persistencia do historico e retorno SSE.

**Resultado esperado:**
- O SusBot responde com dado real/sintetico conforme o municipio consultado.
- O historico aparece depois da primeira pergunta.

**Aceite:**
- Pergunta simples sobre estoque retorna dias restantes.
- Pergunta sobre alertas retorna contagem/lista coerente.
- Pergunta fora do catalogo cai no fallback SQL ou retorna resposta segura de falha.

---

## Regra de execucao

- Mantenha cada task pequena o suficiente para caber em uma sessao curta.
- Depois de cada task, rode os testes daquele bloco antes de seguir.
- Se um aceite falhar, corrija antes de abrir a proxima task.
