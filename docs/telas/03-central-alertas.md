# Tela 03 — Central de Alertas

**Status: PROPOSTO**

## Objetivo da tela

Status no README: "Protótipo" → "Implementar: conectar ao backend: surto / ruptura /
ocupação". Enquanto a Visão Geral mostra os 2-3 alertas mais críticos (Camada 3 de
[01-visao-geral.md](./01-visao-geral.md)), a Central de Alertas é o destino de "ver
todos" — precisa resolver **triagem** (o que já foi tratado, o que é novo) e
**heterogeneidade de ação** (cada tipo de alerta dispara uma ação diferente: `Gerar ETP`,
`Ver Casos`, `Transferir Estoque`, `Acionar Plano`...).

## Tipos de alerta no MVP

Dos 5 tipos listados em [../02-produto.md](../02-produto.md), dois ajustes em relação à
proposta original:

| Tipo | Tratamento nesta tela |
|---|---|
| Possível surto (SINAN) | Alerta ativo, entra no fluxo de estados |
| Ruptura iminente de insumo | Alerta ativo, entra no fluxo de estados |
| Ocupação de UTI acima de threshold | Alerta ativo, entra no fluxo de estados |
| Campanha vacinal (PNI) | **Fora** — módulo PNI já deferido no MVP ([00-navegacao.md](./00-navegacao.md)) |
| ETP finalizado e disponível | **Não é um alerta** — vira notificação transiente (toast/snackbar), ver seção própria abaixo |

Ficam **3 tipos reais** no fluxo de alertas desta tela: surto, ruptura, ocupação.

**Regra de dependência (ruptura):** um alerta de ruptura só existe para itens com estoque
cadastrado no módulo Insumos — sem estoque, não há "dias restantes" para calcular. Ver
detalhe em [02-ruptura-insumos.md](./02-ruptura-insumos.md).

## Estrutura em camadas

### Camada 1 — Resumo + filtro rápido

Contadores por status — **X novos · Y em andamento · Z resolvidos** — mais filtro por tipo
(surto / ruptura / ocupação). Funciona como navegação de triagem, não como gráfico.

### Camada 2 — Lista ativa (novos + em andamento)

Ordenada por severidade e depois por data. Cada linha traz **origem e evidência visíveis
inline** (não escondidas atrás de um clique) — por exemplo: "Ruptura — Dipirona 500mg, 22
dias restantes, consumo acelerado 12%". Isso importa porque é setor público: a gestora
precisa justificar a decisão depois, então a evidência do porquê do alerta fica exposta,
não escondida. Botão de ação embutido, específico do tipo de alerta.

**Alvo de clique — mesmo padrão de [02-ruptura-insumos.md](./02-ruptura-insumos.md):** o
botão de ação (`Gerar ETP`, `Acionar Plano`, etc.) é o único elemento que dispara a ação;
clicar em qualquer outro ponto da linha abre o drawer de detalhe (Camada 5). Os dois alvos
não se sobrepõem.

### Camada 3 — Fluxo de estados (o núcleo desta tela)

```
Novo → Em andamento → Resolvido
```

| Estado | Como entra | Como sai |
|---|---|---|
| **Novo** | Sistema detecta a condição (surto previsto, dias restantes abaixo do limiar, ocupação acima do threshold) | Gestora clica a ação do alerta (`Gerar ETP`, `Acionar Plano`, etc.) |
| **Em andamento** | Ação foi disparada, mas a condição de origem ainda não mudou no dado | Sistema reconfirma que a condição não existe mais (ex: novo upload de estoque mostra nível seguro, tendência epidemiológica reverteu, ocupação caiu abaixo do threshold) |
| **Resolvido** | Confirmação automática do sistema | — (fica em histórico) |

**Gerar ETP sempre move o alerta relacionado para "Em andamento".** Isso vale nos dois
sentidos de origem (ver [04-gerador-etp.md](./04-gerador-etp.md)):
- ETP gerado a partir de um alerta já existente aqui → o próprio alerta muda de estado
- ETP gerado a partir de Insumos, sem alerta ativo prévio (ex: ação preventiva da gestora)
  → cria-se um registro **diretamente em "Em andamento"** (pula "Novo", já que a gestora
  agiu antes do sistema alertar), vinculado ao item, para preservar a rastreabilidade da
  decisão

**Por que existe o estado intermediário:** entre a ação da gestora e a confirmação pelo
dado pode passar semanas (ex: compra leva 3 semanas para chegar). Sem esse estado
intermediário, o alerta ou desaparece cedo demais (perde rastreabilidade de que o problema
ainda existe na prática) ou continua aparecendo como "novo" todo dia mesmo já tendo sido
tratado (vira ruído que a gestora aprende a ignorar).

**Resolução é sempre automática, nunca manual.** Não existe botão "marcar como
resolvido" — a transição só acontece quando o próprio sistema reconfirma a condição pelos
dados. Isso preserva o valor de rastreabilidade: se a gestora pudesse autodeclarar
resolução, um alerta poderia ser fechado sem o problema ter sido de fato resolvido,
enfraquecendo o histórico como evidência de decisão.

### Camada 4 — Histórico (resolvidos)

Colapsado por padrão, expansível — não compete visualmente com os alertas ativos (Camada
2), mas fica acessível para auditoria e prestação de contas (quando surgiu, quando foi
agido, quando foi confirmado resolvido).

### Camada 5 — Detalhe sob demanda

Mesmo padrão de progressive disclosure usado em [02-ruptura-insumos.md](./02-ruptura-insumos.md):
clicar no alerta abre um drawer lateral com a evidência completa (ex: gráfico da previsão
de surto com probabilidade/confiança do modelo Holt/OLS), em vez de inchar a lista
principal com esse detalhe.

## ETP finalizado — notificação, não alerta

Tratado como notificação transiente (toast/snackbar), não como item persistente na lista de
alertas — equivalente ao padrão "arquivo pronto para download" de qualquer produto:

- Aparece como toast no momento em que o PDF termina de ser gerado
- Clicar no toast já dispara o download — sem estado, sem entrar no fluxo Novo/Em
  andamento/Resolvido
- Não ocupa espaço permanente na Central de Alertas; se a gestora perder o toast, o arquivo
  fica acessível pelo histórico de documentos do módulo de ETP (mencionado como possível
  aba leve em [00-navegacao.md](./00-navegacao.md))

## Wireframe textual

```
┌──────────────────────────────────────────────────────────────┐
│  Alertas                    3 novos · 2 em andamento · 14 resolvidos │
├──────────────────────────────────────────────────────────────┤
│  [ Todos ]  Surto  Ruptura  Ocupação                            │
│                                                                │
│  🔴 NOVO   Ruptura — Dipirona 500mg                             │
│            22 dias restantes, consumo acelerado 12%  [Gerar ETP]│
│                                                                │
│  🟡 NOVO   Surto previsto — dengue, 60 dias                     │
│            probabilidade 78%, confiança do modelo Holt [Ver detalhes]│
│                                                                │
│  🟠 EM ANDAMENTO   Ocupação UTI Central acima de 85%            │
│            plano acionado em 04/07                    [Ver plano]│
│                                                                │
│  ▸ Histórico (14 resolvidos)                                    │
└──────────────────────────────────────────────────────────────┘

     (toast, ao concluir geração de PDF em qualquer tela)
     ┌───────────────────────────────────┐
     │ ✓ ETP gerado — Dipirona 500mg      │
     │   [Baixar PDF]                 [x] │
     └───────────────────────────────────┘
```

## De onde vêm os dados de cada bloco

| Bloco | Fonte |
|---|---|
| Alerta de surto | Previsão epidemiológica (SINAN, Holt/OLS) + detecção de anomalia (MAD), conforme [../03-arquitetura.md](../03-arquitetura.md) |
| Alerta de ruptura | Módulo de Insumos ([02-ruptura-insumos.md](./02-ruptura-insumos.md)) — dias restantes abaixo do limiar |
| Alerta de ocupação | Projeção de internações SIH + capacidade CNES (módulo Superlotação, docs/02) — depende de cruzamento ainda não implementado |
| Estado "em andamento" | Novo campo de controle — registrado quando a gestora aciona a ação do alerta |
| Confirmação de "resolvido" | Reavaliação automática na próxima atualização de dado relevante (estoque, previsão, ocupação) |
| Toast de ETP finalizado | Evento de conclusão do job de geração de PDF (módulo ETP) |

## O que NÃO entra nesta tela

| Removido | Motivo |
|---|---|
| Alerta de campanha vacinal | Módulo PNI fora do MVP |
| ETP finalizado como item de lista | Vira notificação transiente, não item persistente |
| Botão de "marcar como resolvido" manual | Enfraquece rastreabilidade — resolução é sempre automática |

## Perguntas em aberto para aprovação

1. O drawer de detalhe (Camada 5) deveria expor também o histórico de estados daquele
   alerta específico (quando virou "em andamento", quando foi confirmado "resolvido"), ou
   isso fica só na visão agregada do histórico (Camada 4)?
2. Alertas em "Em andamento" há muito tempo sem confirmação (ex: 45 dias) merecem algum
   destaque especial (ex: "aguardando confirmação há muito tempo"), ou ficam tratados
   igual aos demais até o dado confirmar?
