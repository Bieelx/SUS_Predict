# Telas 06-08 — Epidemiologia, Internações e Superlotação (Nível 2 — Análises)

**Status: PROPOSTO**

## Nota sobre o código já existente

O `frontend/src/App.jsx` atual já tem versões visuais de Visão Geral, Epidemiologia e
Internações — mas são protótipos de mock data, não conectados a nenhum backend real, e a
Visão Geral em especial reproduz o padrão de BI descritivo (4 KPIs soltos + gráfico +
gauge + mapa hexagonal + donut) que este redesenho inteiro existe para evitar. Decisão do
grupo: **nenhuma dessas telas será reaproveitada** — o design segue do zero a partir daqui,
usando só os documentos `00`-`05` como base. Este documento (`06`) cobre as 3 telas de
Nível 2 do menu ([00-navegacao.md](./00-navegacao.md)): Epidemiologia, Internações,
Superlotação.

## Por que as três num documento só

Diferente das 4 telas core (`01`-`04`), estas três compartilham a mesma natureza —
"consulta aprofundada, sob demanda" — e a mesma estrutura de interação. Em vez de 3
wireframes completos repetindo a mesma armação, documento um **template comum** e depois só
a especialização de cada uma (dados, gráfico central, filtros). Reflete também a
priorização já registrada em docs/README: são Figma-only no ciclo atual do MVP, não código
— então o nível de detalhe aqui é proporcional a isso.

## O que muda em relação às telas core (`01`-`04`)

Na Visão Geral, o filtro não existe — a tela é fixa, mostra o que importa agora. Aqui é o
oposto: a razão de existir da tela é o usuário escolher o recorte (qual doença, qual
período, qual cidade). Por isso o filtro é a **Camada 1**, não uma exceção. Da mesma forma,
grid de gráficos de distribuição (Camada 4) é aceitável aqui — é literalmente o propósito
da tela, diferente da Visão Geral onde tiramos esse tipo de conteúdo por ser "olhar dado
sem decisão".

## Template comum

### Camada 1 — Filtro persistente

Barra de filtro sempre visível no topo, específica por módulo (ver especialização abaixo).
Ação de "Recalcular" e "Exportar" — consistente com o padrão de tela de consulta.

### Camada 2 — KPIs resumo

3-4 números no topo, antes de qualquer gráfico — mesma lógica das telas anteriores: texto
resume antes de gráfico exigir interpretação.

### Camada 3 — Gráfico de tendência (central da tela)

Um gráfico principal, comparando o recorte atual com uma referência histórica (ano
anterior, média histórica) — o que sustenta a leitura de "isso é normal ou é anômalo".

### Camada 4 — Distribuições (breakdown)

Grid de gráficos secundários — quebra por cidade, faixa etária, gênero, diagnóstico,
conforme o módulo.

### Camada 5 — Tabela detalhada + exportação

Para quem for levar o dado para um relatório ou Excel — não é o objetivo do produto (que é
gerar decisão, não relatório), mas é uma necessidade real de quem vai apresentar isso em
reunião ou prestação de contas.

---

## Especialização — Epidemiologia (SINAN)

| Camada | Conteúdo |
|---|---|
| Filtro (1) | Agravo/CID (dengue, tuberculose, meningite, 24+ agravos), período, cidade/região |
| KPIs (2) | Total de casos notificados, taxa de hospitalização, taxa de óbito, incidência por 100 mil hab. |
| Gráfico central (3) | Sazonalidade mensal — ano atual × ano anterior × média 5 anos |
| Breakdown (4) | Distribuição por cidade, faixa etária, gênero; desfecho clínico por ano (leves / hospitalizações / óbitos) |
| Tabela (5) | Casos detalhados por competência, exportável |

## Especialização — Internações (SIH)

| Camada | Conteúdo |
|---|---|
| Filtro (1) | Agravo/CID ou grupo diagnóstico, período, hospital |
| KPIs (2) | Volume de internações, permanência média, taxa de reinternação em 30 dias, custo total SIH |
| Gráfico central (3) | Internações × custo mensal (duplo eixo) |
| Breakdown (4) | Principais grupos de causa (volume + custo médio), permanência média por grupo diagnóstico, origem da AIH (Pronto-Socorro / Eletiva / Encaminhamento UBS / Transferência) |
| Tabela (5) | Internações detalhadas por AIH, exportável |

**Caso de uso principal (docs/02):** identificar quais diagnósticos geram mais internação e
custo, para projetar demanda futura de leitos — conecta com Superlotação abaixo.

## Especialização — Superlotação

| Camada | Conteúdo |
|---|---|
| Filtro (1) | Região, UBS, setor (UTI / Enfermaria / Pronto-Socorro) |
| KPIs (2) | Nº de unidades em risco de superlotação, taxa de ocupação projetada média |
| Gráfico central (3) | Projeção de ocupação por unidade no horizonte de 60-90 dias (tendência SIH + surto previsto SINAN + capacidade CNES) |
| Breakdown (4) | Ranking de unidades por risco de saturação; distribuição por setor |
| Tabela (5) | Lista de unidades com risco, exportável |

### Elemento obrigatório — aviso de "não é tempo real"

Decisão já registrada em [../02-produto.md](../02-produto.md): o CNES não publica ocupação
ao vivo, então apresentar isso como "tempo real" seria enganoso. Este aviso não é uma nota
de rodapé — é um **selo fixo no topo da tela**, sempre visível, tipo:

> 📊 Projeção baseada em dados históricos (SIH + CNES) — não é monitoramento em tempo real

Isso é mais importante aqui do que nas outras duas telas porque "Superlotação" é o tipo de
nome que convida a expectativa errada (usuário espera ver ocupação ao vivo). **Confirmado:
o aviso vive só nesta tela** — uma eventual menção a ocupação em Alertas não repete o
selo completo (ver decisão na pergunta 3 abaixo).

---

## Wireframe textual (exemplo: Epidemiologia — mesmo esqueleto para as outras duas)

```
┌──────────────────────────────────────────────────────────────┐
│  Epidemiologia — SINAN                                         │
├──────────────────────────────────────────────────────────────┤
│  Agravo: [Dengue ▾]   Período: [2022–2026]   Região: [Cotia ▾] │
│                                        [Recalcular] [Exportar] │
├──────────────────────────────────────────────────────────────┤
│  4.812 casos · 8,4% hospitalização · 0,3% óbito · 62/100k       │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Sazonalidade — atual × ano anterior × média 5 anos       │  │
│  │ [gráfico de linha, 3 séries]                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌───────────────┐ ┌───────────────┐ ┌────────────────────┐  │
│  │ Por cidade     │ │ Faixa etária   │ │ Gênero              │  │
│  │ [barra horiz.] │ │ [barra vert.]  │ │ [donut]              │  │
│  └───────────────┘ └───────────────┘ └────────────────────┘  │
│                                                                │
│  Tabela detalhada                                    [.xlsx]  │
│  ...                                                           │
└──────────────────────────────────────────────────────────────┘
```

## De onde viriam os dados (nenhum ainda existe — a construir)

Diferente das telas `01`-`04`, que já têm pipeline funcional para reaproveitar
(`/api/resultado/{job_id}`, modelo Holt/OLS), estas três dependem de endpoints que ainda
não existem sobre os dados já baixados por PySUS:

| Bloco | Fonte a construir |
|---|---|
| Epidemiologia | Agregação sobre dados SINAN já baixados (mesmo pipeline de `datasus.py`), por agravo/período/cidade |
| Internações | Agregação sobre dados SIH. **Correção (ver [05-analise-dados.md](../05-analise-dados.md)):** o custo por internação **já vem do DATASUS** (`VAL_TOT` e campos relacionados na AIH) — não precisa de cadastro manual. O pipeline atual só não lê essas colunas ainda (`COLS_MINIMAS`); é extensão de leitura, não coleta nova |
| Superlotação | Cruzamento SINAN (surto previsto) + SIH (tendência de internação) + CNES (capacidade instalada) — o mais complexo dos três, nenhuma parte está pronta |

## O que NÃO entra nestas telas

| Removido | Motivo |
|---|---|
| Mapa hexagonal de risco regional | Decisão já registrada (README/docs/02) — ranking em barra no lugar, e mesmo assim só na Visão Geral (Camada 5 de [01-visao-geral.md](./01-visao-geral.md)), não aqui |
| Cobertura Vacinal (PNI) | Fora do menu no MVP ([00-navegacao.md](./00-navegacao.md)) — não é uma quarta tela deste grupo |
| Ações de ETP/Alertas embutidas em profundidade | **Confirmado: nenhum link de saída para Insumos/Alertas.** Estas telas ficam 100% consulta, sem mistura com ação — evita poluir a tela com objetivo diferente do dela |

## Decisões fechadas nesta rodada

1. **Sem link cruzado para Alertas/Insumos.** Nível 2 é consulta pura — qualquer ação
   (`Gerar ETP`, `Acionar Plano`) continua vivendo exclusivamente em Insumos/Alertas.
2. **Custo por procedimento (Internações) — resolvido pela análise de dados.** O dado já
   vem do DATASUS (`VAL_TOT` na AIH) — não é cadastro manual, é extensão de leitura do
   pipeline existente. Ver [05-analise-dados.md](../05-analise-dados.md).
3. **Selo de "não é tempo real" só na tela de Superlotação.** Não se repete em outras
   telas (ex: um alerta de ocupação em Alertas não carrega o mesmo aviso completo).

## Nota — análise de dados já realizada

A rodada de análise de dados (o que já temos, o que falta, o que cada tela precisa) foi
feita — ver [05-analise-dados.md](../05-analise-dados.md). Achado mais importante: o
PySUS instalado no `venv/` está numa versão (2.3.0) incompatível com os imports que
`datasus.py`/`api/main.py` esperam — o modo de dados reais está quebrado hoje, o que
bloqueia a validação de qualquer uma destas três telas com dado de verdade até ser
corrigido. Capacidade de leitos no CNES (relevante para Superlotação) ainda precisa de
investigação depois dessa correção.
