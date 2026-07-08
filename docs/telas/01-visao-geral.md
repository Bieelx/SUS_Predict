# Tela 01 — Visão Geral

**Status: PROPOSTO**

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

### Camada 2 — Texto do SusBot (Gemini)

O exemplo que já está em docs/02 é literalmente a especificação de conteúdo desta camada:

> "O município está em tendência de alta de dengue (+18% vs. mês anterior). Com o surto
> previsto para março, o estoque atual de Dipirona 500mg se esgota em 22 dias.
> Recomendamos iniciar processo licitatório esta semana."

3-4 linhas geradas automaticamente, como texto corrido — não um card decorativo. Se este
texto estiver bem escrito, o usuário não precisa olhar gráfico nenhum para entender a
situação. É a materialização do pilar "SusBot" (obrigatório) diretamente na tela de
entrada, não escondido em uma aba separada.

### Camada 3 — Alertas acionáveis (não um link "ver mais")

Os 2-3 alertas mais críticos, puxados da Central de Alertas, cada um já com o botão de
ação correspondente (`Gerar ETP`, `Ver detalhes`, `Abrir Simulação` — ações definidas em
docs/02). Não é uma versão resumida sem ação; é a mesma ação, só que sem precisar navegar.

### Camada 4 — Um gráfico, não quatro

Previsão de casos (dengue) para 6 meses — porque é o gráfico que sustenta a previsão de
insumo citada na Camada 2. Os outros três gráficos atuais (ranking de UF, distribuição por
sexo, faixa etária) não pertencem a esta tela: são consulta aprofundada, pertencem à tela
de **Epidemiologia** (nível 2 do menu, ver [00-navegacao.md](./00-navegacao.md)).

### Camada 5 — Ranking regional em barra (substitui o mapa)

Lista de municípios/regiões por risco, em barra horizontal — não mapa hexagonal. Decisão
já registrada em docs/README e docs/02 ("mapa regional de risco" → Figma; MVP usa ranking
em barra).

## Wireframe textual

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  Visão Geral                              [🔔3] [👤]  │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   ●  MUNICÍPIO EM ALERTA                                      │
│      Dengue em alta e 2 insumos críticos          [Ver plano] │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ 💬 SusBot                                                │ │
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
│   ┌───────────────────────────┐  ┌─────────────────────────┐ │
│   │ Previsão de casos — dengue │  │ Ranking regional (risco) │ │
│   │ [gráfico linha 6 meses,    │  │ ▓▓▓▓▓▓▓▓▓ Cidade A  82%  │ │
│   │  real + previsto + IC 80%] │  │ ▓▓▓▓▓▓     Cidade B  61% │ │
│   │                            │  │ ▓▓▓        Cidade C  34% │ │
│   └───────────────────────────┘  └─────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## De onde vêm os dados de cada bloco

Referência aos endpoints já existentes ou planejados em [../03-arquitetura.md](../03-arquitetura.md):

| Bloco | Fonte |
|---|---|
| Status de risco (camada 1) | Índice de Risco composto — agregação a implementar sobre `/api/overview/{ibge}` |
| Texto SusBot (camada 2) | Novo — integração Gemini (Fase 1, ainda não implementada) consumindo o mesmo payload do Índice de Risco + previsão |
| Alertas (camada 3) | Central de Alertas — hoje protótipo, precisa conectar aos 3 tipos reais (surto / ruptura / ocupação) |
| Gráfico de previsão (camada 4) | `/api/resultado/{job_id}` — pipeline Holt/OLS já funcional, campo `serie_com_previsao` |
| Ranking regional (camada 5) | Hoje sintético (`ranking_ufs`); mantém-se sintético/regional no MVP conforme docs/03 ("baixar 27 estados seria inviável por requisição") |

## O que NÃO entra nesta tela

| Removido | Para onde vai |
|---|---|
| Distribuição por sexo | Tela Epidemiologia (nível 2) |
| Distribuição por faixa etária | Tela Epidemiologia (nível 2) |
| Ranking de UF (nacional, 27 estados) | Tela Epidemiologia ou Estadual (fora do MVP) |
| Top causas | Tela Epidemiologia |

## Perguntas em aberto para aprovação

1. O botão da camada 1 (`Ver plano`) deveria levar direto para Insumos, para Alertas, ou
   abrir um resumo expandido na própria Visão Geral?
2. O bloco SusBot deveria ter algum botão de "perguntar mais" já nesta tela (abrindo o chat
   flutuante com contexto pré-carregado), ou fica só leitura aqui e a interação fica
   restrita ao chat?
3. Quantos alertas mostrar na Camada 3 antes de precisar ir para a Central de Alertas — 2,
   3, ou depende da gravidade (mostrar todos os vermelhos, no máximo X amarelos)?
4. O ranking regional (camada 5) deveria ser município vs. municípios vizinhos da mesma
   regional de saúde, em vez de ranking estadual/nacional — mais relevante para a decisão
   da Dra. Márcia?
