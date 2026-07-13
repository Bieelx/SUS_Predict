# Tela 08 — Painel de Conversa do SusBot

**Status: PROPOSTO**

## Escopo deste documento

Este documento fecha a parte 1 dos "pontos em aberto" registrados em
[07-pontos-em-aberto.md](./07-pontos-em-aberto.md): a experiência de **abrir o chat e
conversar** — layout, estado inicial, histórico, formato de resposta.

**O que NÃO está aqui:** a arquitetura do agente que responde as perguntas (que
ferramentas ele tem, como decide rodar uma query no banco, orquestração
multi-agente, guardrails de segurança). Na conversa que originou este documento, o
grupo definiu que o SusBot deve evoluir para um agente (ou sistema multi-agente) com
acesso a query real no banco — isso é substancialmente mais que a Fase 1 (Gemini
texto automático) descrita em [../02-produto.md](../02-produto.md), e mais próximo da
Fase 2 (LangGraph) que o próprio documento de produto classifica como pós-MVP. Por
ser uma decisão de arquitetura de backend (não uma tela), vira um **spec separado**,
com seu próprio brainstorming — este documento assume apenas que existe algum backend
que recebe uma pergunta + contexto de tela e devolve uma resposta em texto.

## O que já estava decidido antes deste documento

- O SusBot é um ícone de chat flutuante, sempre visível, não um item de menu
  ([00-navegacao.md](./00-navegacao.md)).
- O texto automático de 3-4 linhas que aparece na Visão Geral (Camada 2,
  [01-visao-geral.md](./01-visao-geral.md)) é gerado por Gemini a partir do payload já
  carregado na tela — isso continua existindo independente do painel de conversa.

## Gatilho e disponibilidade

Ícone flutuante presente em **todas as telas autenticadas** (Visão Geral, Insumos,
Alertas, ETP, Epidemiologia/Internações/Superlotação, Configurações, Perfil) —
consistência de acesso, sem exceção por tipo de tela.

## Layout — painel lateral (dock à direita)

O painel abre como uma coluna fixa na lateral direita da tela, sobrepondo ou
empurrando o conteúdo principal (a decidir na implementação, conforme espaço
disponível). Diferente de um modal de tela cheia, o usuário continua vendo o
dashboard por trás — pode conferir um número na tela enquanto formula a pergunta ou
lê a resposta.

## Estado inicial

Abre direto no campo de texto livre, **sem sugestões de pergunta pré-definidas** —
comportamento de chat padrão (mais próximo de um assistente genérico que de um menu
de opções guiadas). Isso é uma inversão do que estava cogitado em
[01-visao-geral.md](./01-visao-geral.md) (pergunta em aberto nº 2 daquele documento),
resolvida aqui: não há necessidade de botão "perguntar mais" com sugestões, o campo
livre já cumpre esse papel.

## Contexto de tela

Cada mensagem enviada carrega, além do texto digitado pelo usuário, a informação de
**qual tela/rota o usuário está vendo no momento** (ex: `insumos`, `visao-geral`).
Isso permite que perguntas como "quanto dura esse estoque?" sejam respondidas sem o
usuário precisar especificar de qual item está falando — o backend recebe o contexto
implícito. O mecanismo exato de como o backend usa esse contexto (que dado buscar,
como resolver ambiguidade) é parte do spec de arquitetura do agente, não deste
documento.

## Conversas como threads (não uma linha do tempo única)

Decisão: o histórico não é um chat contínuo e infinito — é uma **lista de conversas
discretas** (mesmo modelo do ChatGPT/Claude), cada uma com identidade própria (id,
data de início, "título" = primeira pergunta do usuário truncada).

- **Fechar o painel (X) não encerra a conversa** — só esconde o painel. Cada
  mensagem já persiste no banco conforme é enviada, então reabrir o painel retoma a
  mesma conversa de onde parou. Isso evita que um clique acidental no X descarte uma
  conversa em andamento.
- **"Nova conversa"** é a ação explícita que encerra a conversa atual (ela vai para
  o histórico) e abre uma em branco. Botão no cabeçalho do painel.
- **Histórico** é acessível por um ícone no cabeçalho (relógio) que troca a área de
  mensagens por uma lista das conversas passadas, mais recente primeiro, cada item
  rotulado pela primeira pergunta + data relativa ("há 2 dias"). Clicar num item
  abre a conversa inteira — **não é somente leitura**: o campo de envio continua
  ativo, permitindo continuar aquela conversa antiga em vez de forçar sempre uma
  nova.

Persiste em banco, associado ao usuário — implica duas tabelas novas (ex:
`susbot_conversas`: id, usuário, título, criada_em; `susbot_mensagens`: conversa_id,
tela de origem, pergunta, resposta, timestamp) — mesma lógica de persistência já
usada para runs ([../03-arquitetura.md](../03-arquitetura.md), SQLite sempre /
Supabase quando configurado).

**Paginação:** dentro de uma conversa, carregar as mensagens mais recentes primeiro
e buscar mais para trás sob demanda (scroll para cima), em vez de carregar a
conversa inteira de uma vez — evita degradar performance em conversas muito longas,
sem impor um limite artificial de tamanho.

## Formato de resposta

Texto corrido (markdown simples — negrito, listas), **sem componentes visuais
embutidos** (sem mini-gráficos, sem cards de KPI dentro da bolha de mensagem — mais
simples de implementar nesta rodada). Quando a resposta cita um dado que pertence a
outra tela (ex: usuário pergunta de estoque estando na Visão Geral), a resposta inclui
um **link/atalho clicável** que navega direto para a tela de origem daquele dado (ex:
"ver em Insumos →").

## Loading e erro

- **Enquanto processa:** indicador de "digitando", podendo detalhar etapa quando o
  backend expuser essa informação (ex: "consultando estoque..."), em vez de um
  spinner genérico sem contexto.
- **Em caso de falha/timeout:** mensagem de erro amigável dentro do próprio fluxo de
  chat (não um alerta de sistema separado), sugerindo tentar novamente ou reformular a
  pergunta.

## Wireframe textual

```
  (ícone flutuante, canto inferior direito, visível em qualquer tela autenticada)

                                                              ┌───────────────────┐
                                                              │  💬 SusBot 🕐 + [x]│
                                                              ├───────────────────┤
                                                              │                   │
  ┌──────────────────────────────────────┐                   │  Você:            │
  │                                       │                   │  Quanto dura meu  │
  │         (dashboard ao fundo,          │                   │  estoque de soro? │
  │          visível por trás do          │                   │                   │
  │          painel lateral)              │                   │  SusBot está      │
  │                                       │                   │  digitando...     │
  │                                       │                   │                   │
  └──────────────────────────────────────┘                   │                   │
                                                              ├───────────────────┤
                                                              │ [ digite aqui...] │
                                                              └───────────────────┘

  (resposta chegando)

                                                              │  SusBot:          │
                                                              │  Seu estoque de   │
                                                              │  Soro Fisiológico │
                                                              │  1L aguenta 12    │
                                                              │  dias no consumo  │
                                                              │  atual.           │
                                                              │  ver em Insumos → │
```

**Clicando no ícone de histórico (🕐):**

```
                                                              ┌───────────────────┐
                                                              │  ← Histórico  [x] │
                                                              ├───────────────────┤
                                                              │  Quanto dura meu  │
                                                              │  estoque de soro? │
                                                              │  há 2 dias        │
                                                              ├───────────────────┤
                                                              │  Tendência de     │
                                                              │  dengue este mês  │
                                                              │  há 5 dias        │
                                                              ├───────────────────┤
                                                              │  ...              │
                                                              └───────────────────┘
```

Clicar num item da lista abre aquela conversa (com campo de envio ativo). O ícone
`←` volta para a conversa atual sem passar pelo histórico de novo.

## De onde vêm os dados

| Bloco | Fonte |
|---|---|
| Contexto de tela atual | Estado de navegação do frontend (rota ativa) |
| Resposta em texto | Backend do agente SusBot (spec de arquitetura separado) |
| Lista de conversas (histórico) | Tabela nova `susbot_conversas` no banco (SQLite/Supabase), por usuário |
| Mensagens de uma conversa | Tabela nova `susbot_mensagens`, vinculada a `susbot_conversas` por `conversa_id` |
| Link de "ver em X" | Mapeamento estático rota→nome de tela, resolvido no frontend a partir de uma referência retornada pelo backend, navega na mesma aba |

## O que NÃO entra nesta tela

| Removido | Motivo |
|---|---|
| Sugestões de pergunta pré-definidas no estado inicial | Decisão desta rodada: campo livre já cobre o caso de uso, sem necessidade de atalhos guiados |
| Mini-gráficos/cards embutidos na resposta | Mais simples nesta rodada — texto + link já cobre a necessidade de referenciar outra tela |
| Arquitetura do agente (ferramentas, acesso a banco, multi-agente) | Spec de backend separado — decisão de escopo desta rodada, ver seção acima |
| Painel fora de telas autenticadas (Login) | Não aplicável — SusBot só faz sentido com usuário e município selecionados |
| Histórico como linha do tempo única (infinita) | Substituído pelo modelo de conversas discretas (threads) — ver seção acima |
| "Limpar conversa" que apaga dados | Não existe exclusão — "Nova conversa" só arquiva a atual no histórico, nada é perdido |

## Decisões já fechadas (resolvidas após primeira rodada)

1. **Histórico não é infinito** — é segmentado em conversas (threads), com lista de
   conversas passadas acessível pelo ícone de histórico. Ver seção "Conversas como
   threads" acima.
2. **Botão "Nova conversa" confirmado** — encerra a atual (vai pro histórico) e abre
   uma em branco.
3. **Link "ver em X" navega na mesma aba**, para a rota da tela correta, com o
   painel permanecendo aberto por cima.

## Perguntas em aberto para aprovação

Nenhuma pendência bloqueante identificada nesta rodada. Pontos menores que podem ser
refinados na implementação sem impacto de design: limite exato de itens carregados
por página no histórico, e se o título da conversa deve poder ser editado
manualmente pelo usuário (hoje: sempre auto-gerado da primeira pergunta).
