# Tela 01 — Visão Geral

**Status: APROVADO** (07/08/2026 — fila de decisões pura, sem gráfico/ranking na entrada)

## Objetivo da tela

Critério de aceite já definido em [../02-produto.md](../02-produto.md): *"o gestor abre a
plataforma e em 30 segundos sabe se está em risco ou não"*. Esse é o teste de design desta
tela — não "mostrar os dados disponíveis".

A pergunta que a tela responde não é "como estão os indicadores", e sim **"eu preciso agir
hoje, e em quê"**.

## Por que a implementação atual não serve

O `frontend/src/App.jsx` de hoje é o fluxo de teste do extrator (wizard → loading →
dashboard com 4 gráficos Recharts: série temporal, ranking de UF, pizza de sexo, barras de
faixa etária). É BI descritivo clássico — mostra dado bruto, não indica decisão. Isso é
material de validação técnica do pipeline, não a experiência de produto para a persona
Dra. Márcia (ver [../02-produto.md](../02-produto.md)).

## Princípio: a tela é um briefing, não um dashboard

Estrutura em camadas, da mais crítica para a mais acessória. Cada camada abaixo só existe
se a anterior não bastar para a decisão.

### Camada 1 — Status único, sem ambiguidade

Um indicador de risco (verde / amarelo / vermelho) — o Índice de Risco Regional composto
já descrito em docs/02 (epidemiológico + capacidade de leitos + estoque crítico). Uma
frase curta, não um gráfico:

> "Município em alerta — dengue em alta e 2 insumos críticos"

Substitui os 4 gráficos como primeira coisa vista ao abrir a plataforma.

### Camada 2 — Texto da Clara (Gemini)

O exemplo que já está em docs/02 é literalmente a especificação de conteúdo desta camada:

> "O município está em tendência de alta de dengue (+18% vs. mês anterior). Com o surto
> previsto para março, o estoque atual de Dipirona 500mg se esgota em 22 dias.
> Recomendamos iniciar processo licitatório esta semana."

3-4 linhas geradas automaticamente, como texto corrido — não um card decorativo. Se este
texto estiver bem escrito, o usuário não precisa olhar gráfico nenhum para entender a
situação. É a materialização do pilar "Clara" (obrigatório) diretamente na tela de
entrada, não escondido em uma aba separada.

### Camada 3 — Alertas acionáveis (não um link "ver mais")

Todos os alertas críticos ativos, mais até 2 alertas de atenção — o corte é por
gravidade, não por posição fixa (ver seção "quantos alertas mostrar" abaixo). Puxados da
Central de Alertas, cada um já com o botão de ação correspondente (`Gerar ETP`,
`Ver detalhes`, `Abrir Simulação` — ações definidas em docs/02). Não é uma versão resumida
sem ação; é a mesma ação, só que sem precisar navegar.

## Decisão (07/08/2026) — a tela inicial é só a fila, sem gráfico nem ranking

Nenhum gráfico (Recharts ou outro) e nenhum ranking regional ficam na tela inicial —
mesmo um só, mesmo em card discreto. Todo dado de série temporal, ranking ou distribuição
é **nível 2**, acessado clicando num alerta ou pela navegação, nunca por padrão na
entrada. A tela inicial responde só "o que decidir hoje", não "como está a curva".

Isso substitui as antigas Camadas 4 (previsão de dengue) e 5 (ranking regional) da versão
anterior deste documento — hoje redundantes com a tela **Epidemiologia**
(`frontend/src/pages/Epidemiologia.jsx`), que já tem série de dengue completa e comparação
regional. Motivo da mudança: a implementação em `VisaoGeral.jsx` já tinha chegado a esse
ponto de tensão — chart + card de janela de decisão lado a lado no rodapé da tela — e o
grupo decidiu não convivência, mas corte total: a Visão Geral fica só com Status,
texto da Clara e Alertas. Qualquer leitura de curva ou comparação entre municípios é
tarefa de segundo nível.

O que sobra como conteúdo de decisão (sem ser gráfico) é a **Janela de decisão** — um
card textual/numérico (etapa atual, antecedência em dias, ação sugerida, economia
estimada) que traduz a mesma informação da previsão sem desenhar curva. Fica como último
bloco da tela, abaixo dos alertas, ocupando a largura toda.

## Wireframe textual

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  Visão Geral                              [🔔3] [👤]  │
├──────────────────────────────────────────────────────────────┤
│  3 alertas novos desde seu último acesso                      │
│                                                                │
│   ●  MUNICÍPIO EM ALERTA                                      │
│      Dengue em alta e 2 insumos críticos          [Ver plano] │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ 💬 Clara                                                │ │
│   │ "O município está em tendência de alta de dengue (+18%  │ │
│   │  vs. mês anterior). Com o surto previsto para março, o  │ │
│   │  estoque de Dipirona 500mg se esgota em 22 dias.         │ │
│   │  Recomendamos iniciar processo licitatório esta semana."│ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
│   Alertas prioritários                                        │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ 🔴 Ruptura em 22 dias — Dipirona 500mg     [Gerar ETP]   │ │
│   │ 🟡 Surto previsto — dengue, 60 dias        [Ver detalhes]│ │
│   │ 🟡 UTI Central acima de 85% (projeção)      [Ver detalhes]│ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ Janela de decisão                                        │ │
│   │ ABRIR ETP AGORA                                          │ │
│   │ Antecedência 22 dias · Ruptura estimada mar/27 ·          │ │
│   │ Ação sugerida fev/27 · Economia estimada R$ 12.400        │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## De onde vêm os dados de cada bloco

Referência aos endpoints já existentes ou planejados em [../03-arquitetura.md](../03-arquitetura.md):

| Bloco | Fonte |
|---|---|
| Status de risco (camada 1) | Índice de Risco composto — agregação a implementar sobre `/api/overview/{ibge}` |
| Contador "novos desde último acesso" | Reaproveita o fluxo de estados Novo/Em andamento/Resolvido já definido em [03-central-alertas.md](./03-central-alertas.md) — conta quantos alertas entraram em "Novo" desde o timestamp do último login da sessão anterior |
| Texto Clara (camada 2) | Novo — integração Gemini (Fase 1, ainda não implementada) consumindo o mesmo payload do Índice de Risco + previsão |
| Alertas (camada 3) | Central de Alertas — hoje protótipo, precisa conectar aos 3 tipos reais (surto / ruptura / ocupação) |
| Janela de decisão (bloco final) | Mesmo payload do Índice de Risco + `prova_valor`/previsão — já implementado em `VisaoGeral.jsx` como `CardJanelaDecisao`, sem depender de gráfico |

## O que NÃO entra nesta tela

| Removido | Para onde vai |
|---|---|
| Distribuição por sexo | Tela Epidemiologia (nível 2) |
| Distribuição por faixa etária | Tela Epidemiologia (nível 2) |
| Ranking de UF (nacional, 27 estados) | Tela Epidemiologia ou Estadual (fora do MVP) |
| Top causas | Tela Epidemiologia |
| Gráfico de previsão de casos (dengue) | Tela Epidemiologia (nível 2) — já implementado lá, era redundante na Visão Geral |
| Ranking regional em barra | Removido da Visão Geral — sem substituto ainda; se necessário, vira nível 2 dentro de Epidemiologia |

## Perguntas em aberto para aprovação

1. ~~O botão da camada 1 (`Ver plano`) deveria levar direto para Insumos, para Alertas, ou
   abrir um resumo expandido na própria Visão Geral?~~ **Resolvido:** leva para a Central
   de Alertas (`onNavigate('alertas')`) — já implementado assim em `VisaoGeral.jsx`.
2. O bloco Clara deveria ter algum botão de "perguntar mais" já nesta tela (abrindo o chat
   flutuante com contexto pré-carregado), ou fica só leitura aqui e a interação fica
   restrita ao chat? — em aberto, depende do desenho do agente (fora do escopo desta
   decisão, ver [06-agente-clara.md](../06-agente-clara.md)).
3. ~~Quantos alertas mostrar na Camada 3?~~ **Resolvido:** todos os críticos + até 2 de
   atenção; acima disso, "Ver todos na Central de Alertas".
4. ~~Ranking regional...~~ **Resolvido:** removido da Visão Geral (ver decisão acima).
