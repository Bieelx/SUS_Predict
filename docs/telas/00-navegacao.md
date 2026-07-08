# Menu Principal — Estrutura de Navegação

**Status: PROPOSTO**

## Princípio

O menu não deve espelhar a estrutura de dados do DATASUS (SIM / SIH / SINASC / SINAN como
abas). Isso é como o DATASUS pensa, não como a Dra. Márcia pensa — ela não sabe o que é
SINAN, ela quer saber "vou ter dengue disparando e falta de soro em março".

A navegação é organizada por **frequência de uso e natureza da tarefa** (agir vs.
consultar), não por sistema de origem do dado. Isso segue diretamente a pesquisa de campo
citada em [../01-visao-geral.md](../01-visao-geral.md): 50% dos gestores citam previsão de
insumo como prioridade máxima, contra 20% para alerta de surto (hipótese H6 invalidada) —
a IA do produto precisa refletir essa prioridade, não a estrutura técnica dos dados.

## Estrutura proposta — dois níveis

```
┌─────────────────────────────┐
│  NÍVEL 1 — Operacional       │  ← usado todo dia, ação
├─────────────────────────────┤
│  Visão Geral                  │
│  Alertas            (3)       │
│  Insumos                       │
├─────────────────────────────┤
│  NÍVEL 2 — Análises           │  ← consulta aprofundada, sob demanda
├─────────────────────────────┤
│  Epidemiologia                 │
│  Internações                   │
│  Superlotação                  │
├─────────────────────────────┤
│  Documentos           (menor)  │  ← histórico de ETPs gerados
└─────────────────────────────┘

  [chat SusBot — flutuante, sempre visível, não é item de menu]
```

### Nível 1 — Operacional

| Item | Módulo correspondente (docs/02) | Por que está aqui |
|---|---|---|
| **Visão Geral** | Visão Geral | Tela de entrada — briefing de risco (ver [01-visao-geral.md](./01-visao-geral.md)) |
| **Alertas** | Central de Alertas | Bandeja de entrada da plataforma — badge com contagem de alertas ativos |
| **Insumos** | Ruptura de Insumos | Sobe para o nível 1 apesar de "ser só um módulo" — é a dor #1 validada pela pesquisa de campo, não pode ficar no mesmo nível que epidemiologia descritiva |

### Nível 2 — Análises (agrupadas, menor destaque visual)

| Item | Módulo correspondente | Por que fica em nível 2 |
|---|---|---|
| **Epidemiologia** | Epidemiologia SINAN | Modo consulta, não modo ação. Figma-only no MVP atual (docs/README) |
| **Internações** | Internações SIH | Idem |
| **Superlotação** | Superlotação | Idem — além disso depende de cruzamento SINAN+SIH+CNES ainda não implementado |

Visualmente: grupo colapsável ou com hierarquia tipográfica menor (ex: título de seção
"Análises" com os três abaixo em fonte menor / sem ícone de destaque), para não competir
com o nível operacional.

### Documentos — item de navegação de baixa prioridade

Histórico de ETPs gerados (rascunho/finalizado, re-download), detalhado em
[04-gerador-etp.md](./04-gerador-etp.md). Fica abaixo do grupo "Análises" no menu, com
destaque visual ainda menor — é consulta ocasional ("achar o PDF de semana passada"), não
parte do fluxo diário nem do modo de análise aprofundada.

## O que não é item de menu

| Elemento | Por que não é uma aba |
|---|---|
| **SusBot** | Um assistente que só existe se o usuário navegar até ele falha o próprio objetivo do módulo (interagir sem precisar de analista). Deve ser ícone de chat flutuante, disponível em qualquer tela — extensão natural do texto que a Fase 1 (Gemini) já injeta na Visão Geral |
| **Gerador de ETP** | É uma ação, não um destino — nasce de um alerta ou do módulo de Insumos ("Gerar ETP"). O histórico fica visível em "Documentos" (ver acima), mas o gerador em si nunca é um destino de navegação |

## O que fica fora do menu no MVP (nem grayed-out)

| Módulo | Motivo |
|---|---|
| Cobertura Vacinal (PNI) | Fonte de dado separada, não citada como prioridade na pesquisa de campo. Aparecer desabilitado no menu é ruído visual para uma persona com pouco tempo — fica só na visão de produto (Figma/pitch) |
| Visão Estadual | Feature de escala (plano Estadual), não de MVP — mesma lógica |

## Resultado

7 itens reais de navegação (contra ~9 módulos listados em docs/02-produto.md) — o restante
vira ação contextual (ETP em si), widget persistente (SusBot) ou fica fora do app
funcional por enquanto (PNI, Estadual).

## Perguntas em aberto para aprovação

1. Menu lateral (sidebar) fixo ou top bar horizontal? Sidebar permite badge de contagem em
   "Alertas" e agrupamento visual dos dois níveis com mais naturalidade.
2. O grupo "Análises" começa colapsado ou expandido por padrão?
3. "Insumos" deve ficar visualmente idêntico a "Visão Geral"/"Alertas", ou com leve destaque
   por ser o carro-chefe da proposta de valor?
