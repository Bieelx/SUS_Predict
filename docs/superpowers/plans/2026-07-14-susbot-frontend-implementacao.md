# SusBot - Roadmap de Implementacao do Painel (Frontend)

> Objetivo: trocar o mock atual do painel do SusBot por uma integracao real com o backend
> do agente, preservando o layout e o fluxo definidos em `docs/telas/08-painel-susbot.md`.

**Leitura obrigatoria antes de executar:**
- `docs/telas/08-painel-susbot.md`
- `docs/06-agente-susbot.md`
- `docs/07-briefing-implementacao-chatbot.md`
- `frontend/src/pages/SusBotPanel.jsx`

**Estado atual observado:** o painel ja existe no frontend e ja respeita a estrutura base
do spec. Este roadmap nao recomeça o layout do zero; ele substitui o mock por contratos
reais, persistencia e refinamento final.

---

## Fase 0 - Auditoria rapida do painel atual

**Objetivo:** mapear o que pode ser reaproveitado sem mexer no desenho aprovado.

**O que fazer:**
- Ler o componente atual `frontend/src/pages/SusBotPanel.jsx`.
- Marcar o que ja atende ao spec 08: dock lateral, botao flutuante, historico em threads,
  estado vazio, loading, erro, link `ver em X`.
- Marcar o que ainda e mock: `askSusBot`, seed local de threads e keyword routing.

**Resultado esperado:**
- Fica claro que o trabalho e de integracao, nao de redesenho.

**Aceite:**
- Um resumo curto identifica o que sera mantido e o que sera trocado.

---

## Fase 1 - Fechar contrato de integracao com o backend

**Objetivo:** deixar o painel dependente de um contrato unico e previsivel.

**O que fazer:**
- Confirmar payload de envio: `pergunta`, `tela_atual`, `conversa_id`, `ibge`.
- Confirmar eventos SSE: `conversa_id`, `status`, `token`, `referencia`, `fim`.
- Definir formato do historico vindo do backend: conversas e mensagens.
- Definir comportamento de erro e timeout no chat.

**Resultado esperado:**
- O painel sabe exatamente o que enviar e o que esperar.

**Aceite:**
- Existe um contrato escrito sem ambiguidade entre frontend e backend.

---

## Fase 2 - Criar o client de chat e o parser SSE

**Objetivo:** isolar toda a comunicacao de rede fora do componente visual.

**O que fazer:**
- Criar um helper ou service para abrir a conexao com o endpoint do SusBot.
- Consumir streaming SSE por eventos nomeados.
- Expor callbacks ou um fluxo unico para atualizar estado da conversa.
- Tratar encerramento, erro e timeout.

**Resultado esperado:**
- O componente principal nao conhece detalhes de `fetch`/stream parsing.

**Aceite:**
- Existe uma funcao unica para conversar com o backend.
- Eventos `token` e `status` chegam ao estado do painel.

---

## Fase 3 - Substituir o mock de resposta pelo backend real

**Objetivo:** remover o roteamento por palavra-chave e usar resposta real do agente.

**O que fazer:**
- Trocar `askSusBot` pelo client real da Fase 2.
- Manter a experiencia de `digitando...` enquanto o stream chega.
- Adicionar mensagens tokenizadas a bolha atual da resposta.
- Persistir a conversa ativa no estado local durante o envio.

**Resultado esperado:**
- Pergunta real gera resposta real do backend, em stream.

**Aceite:**
- Enviar uma pergunta mostra status, tokens chegando e fim de conversa.
- Erro de backend vira mensagem amigavel no chat.

---

## Fase 4 - Conectar historico real e conversas persistidas

**Objetivo:** abandonar o seed local de threads e buscar conversas reais.

**O que fazer:**
- Carregar a lista de conversas do backend ao abrir o painel.
- Carregar mensagens da conversa selecionada.
- Manter `conversa_id` ativo entre novas perguntas.
- Implementar `Nova conversa` como troca de thread persistida.

**Resultado esperado:**
- Historico deixa de ser mockado e vira estado real do usuario.

**Aceite:**
- Recarregar a pagina nao apaga o historico.
- Selecionar uma conversa antiga restaura as mensagens corretas.

---

## Fase 5 - Contexto de tela e links `ver em X`

**Objetivo:** garantir que o painel seja contextual e navegavel a partir da resposta.

**O que fazer:**
- Enviar a rota/tela atual em toda pergunta.
- Preservar o microtexto `enviado em X` nas mensagens do usuario.
- Consumir a referencia de rota retornada pelo backend.
- Navegar para a tela de origem ao clicar em `ver em X`.

**Resultado esperado:**
- O SusBot responde com contexto e direciona o usuario para a tela certa.

**Aceite:**
- Perguntas feitas em Insumos chegam com contexto de Insumos.
- Respostas com referencia navegam corretamente.

---

## Fase 6 - Refinamento visual e comportamental

**Objetivo:** polir o painel sem mudar a estrutura aprovada.

**O que fazer:**
- Ajustar estados de vazio, loading e erro para ficarem consistentes com o spec.
- Revisar largura, espacamento, scroll e comportamento em telas menores.
- Garantir que o painel abra/feche sem perder conversa.
- Manter o estilo de texto simples em markdown leve, sem cards embutidos.

**Resultado esperado:**
- O painel parece produto final, nao mock de demonstracao.

**Aceite:**
- Desktop e mobile continuam usaveis.
- O painel nao quebra a leitura do dashboard ao fundo.

---

## Fase 7 - Smoke test final e limpeza

**Objetivo:** provar o fluxo inteiro funcionando com Gemini real.

**O que fazer:**
- Abrir painel em uma tela autenticada.
- Enviar pergunta sobre estoque.
- Validar stream, referencia e persistencia.
- Abrir historico e retomar conversa.
- Revisar eventuais residuos do mock removido.

**Resultado esperado:**
- O chat vira uma funcionalidade real e navegavel do produto.

**Aceite:**
- O fluxo completo roda do navegador ate o backend real sem depender de mock local.
- O historico e a nova conversa funcionam como threads.

---

## Regra de execucao

- Execute uma fase por vez.
- Nao avance se o aceite da fase anterior falhar.
- Se surgir conflito com `docs/telas/08-painel-susbot.md`, o doc da tela vence.
