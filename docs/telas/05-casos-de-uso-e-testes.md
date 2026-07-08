# Validação — Casos de Uso e Testes de Funcionamento

**Status: PROPOSTO**

## Objetivo deste documento

As telas `00` a `04` foram desenhadas e aprovadas **uma a uma**. Este documento faz a
checagem que só é possível olhando para o conjunto: os fluxos se conectam entre telas sem
contradição? Os estados batem (o que "Em andamento" em Alertas significa para o que
aparece em Insumos)? A UX é consistente (mesmo padrão de clique, mesmo vocabulário de
status) de ponta a ponta?

Não é uma tela nova — é uma auditoria do que já existe, para decidir o que corrigir antes
de desenhar o próximo lote de telas (Epidemiologia, Internações, Superlotação).

## Como ler

- **Casos de uso**: user stories da persona, usadas para confirmar que toda necessidade
  real tem uma tela que a resolve.
- **Cenários ponta-a-ponta**: fluxos narrados que atravessam mais de uma tela — o teste
  mais valioso, porque é onde inconsistência entre documentos aparece.
- **Tabela de testes**: verificação pontual por camada de cada tela.
- **Achados de UX**: o que foi corrigido diretamente nos docs `00`-`04` nesta mesma
  passada, e o que virou pergunta em aberto por exigir decisão de produto.

---

## Casos de uso por persona

Personas de referência: [../02-produto.md](../02-produto.md).

### Dra. Márcia Oliveira — Secretária Municipal de Saúde (persona principal)

| Caso de uso | Tela que atende |
|---|---|
| "Quero saber em 30 segundos se preciso agir hoje" | Visão Geral, Camadas 1-2 |
| "Quero entender o porquê de um alerta sem precisar interpretar gráfico" | Visão Geral, Camada 2 (texto SusBot) + Alertas, Camada 2 (evidência inline) |
| "Quero saber quais insumos vão faltar e agir sobre isso" | Insumos, Camadas 1-2 |
| "Quero comparar o custo de agir agora vs. esperar a ruptura" | Insumos, Camada 1 ("economia estimada") |
| "Quero abrir uma licitação sem escrever o documento do zero" | Gerador de ETP, fluxo completo |
| "Quero ter certeza de que não estou assinando um documento com erro de IA" | Gerador de ETP, Etapa 3 (trava de revisão) |
| "Quero saber o que já resolvi e o que ainda está pendente" | Alertas, Camadas 3-4 (fluxo de estados + histórico) |
| "Quero achar o PDF que gerei semana passada" | Documentos (histórico), ver [00-navegacao.md](./00-navegacao.md) |

### Farmacêutico Hospitalar / Coordenador de Farmácia (persona secundária)

| Caso de uso | Tela que atende |
|---|---|
| "Sinto a ruptura antes do gestor — preciso ver isso primeiro, por medicamento" | Insumos, Camada 2 (lista priorizada por dias restantes) |
| "Preciso manter o estoque atualizado no sistema" | Insumos → CRUD de estoque ("Atualizar estoque") |
| "Preciso saber se um dado de estoque está desatualizado antes de confiar nele" | Insumos, indicador de "confiança reduzida" |

**Cobertura:** todos os casos de uso centrais listados em docs/02 para as 4 telas do MVP
core têm uma tela correspondente. Nenhuma lacuna de cobertura encontrada nesta checagem —
os gaps encontrados (abaixo) são de **consistência entre telas**, não de casos de uso sem
tela.

---

## Cenários ponta-a-ponta

### Cenário A — Alerta de ruptura → ETP → PDF (fluxo feliz)

1. Dra. Márcia abre a plataforma → Visão Geral mostra status "Município em alerta" (Camada 1)
2. Texto do SusBot (Camada 2) já menciona a Dipirona especificamente
3. Ela vê o mesmo alerta na lista de prioritários (Camada 3) e clica `Gerar ETP`
4. Modal abre — Etapa 1 já traz medicamento = Dipirona, quantidade estimada, previsão de demanda (dados vêm do módulo Insumos)
5. Etapa 2 — ela preenche dotação orçamentária e unidade requisitante
6. Etapa 3 — revisa o texto gerado, marca "Revisei e aprovo", avança
7. Etapa 4 — PDF gerado, toast aparece, modal fecha, volta para a Visão Geral
8. O alerta de ruptura em Alertas muda de **Novo** para **Em andamento** (a ação de gerar ETP conta como a ação que move o estado, conforme [03-central-alertas.md](./03-central-alertas.md))
9. O documento aparece no histórico de Documentos

**Resultado:** ✅ fluxo consistente. Passo 8 estava implícito, mas não escrito em nenhum
dos dois documentos antes desta checagem — corrigido nesta passada (achado UX-3, ver
abaixo): a regra "gerar ETP sempre move o alerta relacionado para Em andamento" agora está
explícita em `03-central-alertas.md` e `04-gerador-etp.md`.

### Cenário B — Mesmo ETP, disparado direto de Insumos (origem diferente)

Idêntico ao Cenário A a partir do passo 4, mas o gatilho é o botão `Gerar ETP` na linha do
medicamento em Insumos, não em Alertas. Pré-preenchimento é o mesmo (dados do item de
estoque). Diferença: **não existe necessariamente um alerta ativo em Alertas** para esse
medicamento no momento do clique (ex: a gestora decidiu agir preventivamente, antes do
sistema gerar o alerta formal).

**Resultado:** ✅ resolvido nesta passada (achado UX-3/UX-4). Regra fechada: gerar ETP a
partir de Insumos sem alerta ativo prévio **cria um registro diretamente em "Em
andamento"** (pula "Novo", já que a gestora agiu antes do sistema alertar) — preserva a
rastreabilidade da decisão preventiva.

### Cenário C — Estoque nunca cadastrado + tentativa de alerta de ruptura

Secretaria nova, nunca fez upload de estoque (Camada 0 de Insumos, estado vazio). O modelo
de previsão epidemiológica está rodando normalmente (SINAN). Pergunta: o sistema tentaria
gerar um alerta de "ruptura iminente" sem ter nenhum dado de estoque para calcular dias
restantes?

**Resultado:** ✅ resolvido nesta passada (achado UX-1). Confirmado como regra obrigatória:
um alerta de ruptura **não existe** para um item sem estoque cadastrado — escrito
explicitamente em `02-ruptura-insumos.md` e `03-central-alertas.md`.

### Cenário D — Estoque desatualizado usado para gerar ETP

Um medicamento está com estoque não atualizado há 19 dias (indicador "confiança reduzida"
em Insumos, Camada 2). A gestora mesmo assim clica `Gerar ETP` nesse item.

**Resultado:** ✅ resolvido nesta passada (achado UX-2). A Etapa 1 do fluxo de ETP agora
mostra um aviso **não bloqueante** ("Estoque atualizado há X dias") quando a origem tem
confiança reduzida. Não bloqueia porque estoque parado às vezes é legítimo — um insumo de
baixa rotatividade pode simplesmente não ter sido consumido, não significa negligência de
cadastro. A decisão fica com a gestora, com a informação visível.

### Cenário E — Alerta "Em andamento" há muito tempo sem confirmação

Um alerta de ocupação de UTI entrou em "Em andamento" (plano acionado) há 45 dias, e o
dado de ocupação ainda não caiu abaixo do threshold — pode ser que o plano não esteja
funcionando, ou que o dado de origem (CNES) simplesmente atualize devagar.

**Resultado:** ⚠️ ambíguo — já registrado como pergunta em aberto original em
[03-central-alertas.md](./03-central-alertas.md) (pergunta 2). Mantido como pergunta, não
resolvido nesta passada — é decisão de produto (definir um limiar de "tempo parado" exige
saber a cadência real de atualização de cada fonte de dado, o que ainda não está definido).

### Cenário F — ETP em rascunho, clique novamente no mesmo item

A gestora começou um ETP para "Soro Fisiológico" na semana passada (ficou como rascunho,
não finalizou a Etapa 3). Ela volta ao módulo de Insumos e clica `Gerar ETP` na mesma linha
de novo.

**Resultado:** ✅ resolvido nesta passada (achado UX-5). Regra fechada: **retoma** o
rascunho existente, abrindo direto na etapa onde parou — não cria um novo documento
concorrente para o mesmo item.

### Cenário G — Clique ambíguo em linha de lista (Insumos e Alertas)

Antes desta checagem: a linha de um item em Insumos e em Alertas tinha um botão de ação
embutido (`Gerar ETP`, etc.) **e** deveria abrir um drawer de detalhe ao clicar — sem
definir qual elemento fazia o quê.

**Resultado:** ✅ corrigido nesta passada. Ver achado UX-6 (correção aplicada, não
pergunta).

---

## Tabela de testes de funcionamento

| ID | Tela | Pré-condição | Passos | Resultado esperado | Status |
|---|---|---|---|---|---|
| T01 | Visão Geral | Município com risco alto (surto + estoque crítico) | Abrir a plataforma | Camada 1 mostra status vermelho com frase específica (não genérica) | ✅ Funcional |
| T02 | Visão Geral | Idem T01 | Ler o texto do SusBot (Camada 2) | Texto cita o medicamento e o prazo específicos, não um resumo genérico | ✅ Funcional |
| T03 | Visão Geral | Existem 5 alertas ativos | Ver Camada 3 | Mostra só os 2-3 mais críticos, com ação embutida | ⚠️ Ambíguo — número exato não está fechado (pergunta 3 de `01-visao-geral.md`, já registrada) |
| T04 | Insumos | Nenhum estoque cadastrado | Abrir Insumos pela primeira vez | Tela mostra CTA de upload/cadastro manual, não tabela vazia | ✅ Funcional |
| T05 | Insumos | Estoque cadastrado, 4 críticos | Abrir Insumos | Lista ordenada por dias restantes, resumo executivo com economia estimada | ✅ Funcional |
| T06 | Insumos | Item com estoque atualizado há 19 dias | Ver linha do item | Indicador de "confiança reduzida" visível | ✅ Funcional |
| T07 | Insumos | Clicar na linha (fora do botão) | — | Abre drawer de detalhe, sem disparar `Gerar ETP` | ✅ Funcional (corrigido nesta passada — achado UX-6) |
| T08 | Insumos → CRUD | Acessar "Atualizar estoque" | Editar quantidade de um item | Muda o valor e atualiza a data de "última atualização" exibida na lista principal | ✅ Funcional |
| T09 | Alertas | 3 alertas novos, 2 em andamento | Abrir Alertas | Contadores da Camada 1 batem com os itens da Camada 2 | ✅ Funcional |
| T10 | Alertas | Alerta novo, clicar botão de ação | — | Estado muda para "Em andamento"; alerta some da contagem de "novos" | ✅ Funcional |
| T11 | Alertas | Alerta "em andamento", condição de origem normaliza | — | Sistema move para "Resolvido" automaticamente, sem ação manual | ✅ Funcional (regra de negação de botão manual está clara) |
| T12 | Alertas | Item sem estoque cadastrado no sistema | Verificar se um alerta de ruptura poderia existir | Não existe alerta para esse item até haver estoque cadastrado | ✅ Funcional (regra fechada — achado UX-1) |
| T13 | Gerador de ETP | Disparado a partir de Alertas | Completar as 4 etapas | Modal fecha, toast aparece, alerta de origem vira "Em andamento" | ✅ Funcional (regra fechada — achado UX-3) |
| T14 | Gerador de ETP | Etapa 3, checkbox não marcado | Tentar avançar para Etapa 4 | Botão "Gerar documento" permanece desabilitado | ✅ Funcional |
| T15 | Gerador de ETP | Dado de origem desatualizado (>15 dias) | Abrir fluxo de ETP para esse item | Etapa 1 mostra aviso não bloqueante de dado desatualizado | ✅ Funcional (regra fechada — achado UX-2) |
| T16 | Gerador de ETP | ETP em rascunho já existe para o item | Clicar `Gerar ETP` de novo no mesmo item | Retoma o rascunho existente, não cria duplicado | ✅ Funcional (regra fechada — achado UX-5) |
| T17 | Documentos | ETP finalizado gerado | Abrir histórico | Item aparece com status "Finalizado" e botão de re-download | ✅ Funcional |
| T18 | Navegação | Menu principal renderizado | Verificar presença de "Documentos" | Aparece como item de baixa prioridade abaixo de "Análises" | ✅ Funcional (corrigido nesta passada) |

---

## Achados de UX consolidados

Todos os achados desta rodada foram decididos e corrigidos diretamente nos docs `00`-`04`
— nenhum ficou pendente.

| # | Achado | Severidade | Decisão / correção aplicada |
|---|---|---|---|
| UX-1 | Dependência entre estoque cadastrado (Insumos) e alerta de ruptura (Alertas) não estava declarada | Bloqueante | **Confirmado como regra:** alerta de ruptura não existe sem estoque cadastrado para o item. Escrito em `02-ruptura-insumos.md` e `03-central-alertas.md` |
| UX-2 | Fluxo de ETP não avisava quando o dado de origem estava desatualizado | Importante | **Aviso não bloqueante** na Etapa 1 do ETP ("Estoque atualizado há X dias") — não bloqueia porque estoque parado pode ser legítimo (insumo de baixa rotatividade). Escrito em `04-gerador-etp.md` |
| UX-3 | Conexão entre "gerar ETP" e a mudança de estado do alerta relacionado não estava escrita | Importante | **Confirmado:** gerar ETP sempre move o alerta relacionado para "Em andamento". Escrito em `03-central-alertas.md` e `04-gerador-etp.md` |
| UX-4 | ETP preventivo (sem alerta prévio) sem relação definida com a Central de Alertas | Menor | Resolvido junto com UX-3: **cria registro diretamente em "Em andamento"** (pula "Novo") quando não há alerta ativo prévio |
| UX-5 | Rascunho de ETP existente + novo clique no mesmo item: retoma ou duplica? | Importante | **Confirmado: retoma** o rascunho existente, abre na etapa onde parou. Escrito em `04-gerador-etp.md` |
| UX-6 | Ambiguidade de clique em linhas de lista (Insumos e Alertas): botão de ação e abertura de drawer competiam no mesmo alvo | Importante | Botão de ação é o único alvo que dispara a ação; clicar em qualquer outro ponto da linha abre o drawer. Escrito em `02-ruptura-insumos.md` e `03-central-alertas.md` |
| UX-7 | "Documentos" (histórico de ETP) não aparecia no diagrama de navegação, embora já estivesse definido em `04` | Menor | `00-navegacao.md` atualizado — diagrama e contagem de itens (6 → 7) agora incluem "Documentos" |

---

## Veredito por tela

| Tela | Veredito |
|---|---|
| `00-navegacao.md` | **Funcional.** Ajuste de consistência aplicado (Documentos no diagrama). Perguntas em aberto remanescentes são de estilo visual (sidebar vs. topo), não de estrutura. |
| `01-visao-geral.md` | **Funcional.** Nenhum gap novo encontrado nesta checagem — as perguntas em aberto já existentes (quantidade de alertas na Camada 3, destino do botão "Ver plano") continuam válidas e não bloqueiam o entendimento do fluxo. |
| `02-ruptura-insumos.md` | **Funcional.** Ambiguidade de clique (UX-6) e dependência com Alertas (UX-1) resolvidas e escritas como regra. |
| `03-central-alertas.md` | **Funcional.** Clique corrigido (UX-6); vínculo de estado com o Gerador de ETP (UX-3/UX-4) e dependência de estoque (UX-1) agora explícitos. |
| `04-gerador-etp.md` | **Funcional.** Os três pontos que exigiam decisão de produto (aviso de dado desatualizado, vínculo com Alertas, retomar vs. duplicar rascunho) foram decididos e incorporados ao fluxo. |

## Próximos passos

1. Todas as pendências desta rodada (UX-1 a UX-5) foram decididas e já estão escritas nos
   docs `02`, `03` e `04` — nenhuma decisão de produto em aberto bloqueia o avanço.
2. Seguir para as telas de nível 2 (Epidemiologia, Internações, Superlotação), que herdam
   a mesma lógica de estado de alertas já validada aqui (ocupação e surto usam o mesmo
   fluxo Novo → Em andamento → Resolvido).
