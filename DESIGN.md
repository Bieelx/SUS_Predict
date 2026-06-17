# Design — SusPredict

## Visão geral

Plataforma analítica de saúde pública para gestores municipais. Mood: painel de inteligência operacional — denso em informação, mas sem ruído visual. Não é um relatório PDF interativo; é uma ferramenta de trabalho que o gestor olha várias vezes por dia.

---

## Layout Shell

```
┌─────────────────────────────────────────────┐
│  Sidebar 220px fixo  │  Topbar 60px          │
│                      ├───────────────────────┤
│  nav + branding      │  Page content         │
│                      │  padding 28px 36px    │
│  footer: user info   │                       │
└─────────────────────────────────────────────┘
```

- Sidebar: `220px` fixa, dark teal escuro, não colapsa no MVP
- Topbar: `60px`, fundo `--canvas`, sticky
- Content: `max-width: 1280px`, `padding: 28px 36px`
- Gap entre seções: `28px`
- Grid KPI: `repeat(4, 1fr)` na Visão Geral; `repeat(4, 1fr)` nas páginas de análise

---

## Color Strategy

Superfícies claras quentes + sidebar escura teal. Acentos semânticos por tipo de dado.

### Tokens

**Surfaces (warm off-whites)**
```css
--canvas:  #F6F5F2   /* background principal */
--content: #F1F4F3   /* painel de conteúdo (cool-neutral, harmoniza c/ sidebar teal sem verde forte) */
--elev:    #FFFFFF   /* cards, modais */
--subtle:  #F0EDE6   /* callouts, zebra rows */
--tint:    #E9E5DC   /* hover chips, tag bg */
```

**Ink (warm near-blacks)**
```css
--ink-900: #1A1814   /* texto principal */
--ink-700: #3D3A33   /* texto secundário importante */
--ink-500: #6B665D   /* labels, auxiliar */
--ink-400: #8A8579   /* placeholders, meta */
--ink-300: #A8A39A   /* bordas sutis */
--ink-200: #C9C4BA   /* divisores */
--ink-100: #E5E1D6   /* bordas de card */
--ink-50:  #EFEBE0   /* bg muito sutil */
```

**Sidebar (dark teal)**
```css
--sidebar-bg:          #1E3C3C   /* fundo da sidebar */
--sidebar-text:        #C8D8D5   /* texto nav inativo */
--sidebar-text-active: #FFFFFF   /* texto nav ativo */
--sidebar-active-bg:   #2A5050   /* bg item ativo */
--sidebar-active-bar:  #4DB8A0   /* barra 3px esquerda item ativo */
--sidebar-section:     #6A9090   /* eyebrow de seção */
--sidebar-icon:        #7EB8B0   /* ícones inativos */
```

**Primary (ações, links, focus)**
```css
--primary:     #1B5E6E   /* CTAs, nav active */
--primary-700: #134756   /* hover */
--primary-100: #D6E9EE   /* badge bg */
--primary-50:  #EBF4F7   /* tint */
```

**Semantic — métricas e alertas**
```css
--good:  #2A6B40   /* positivo, crescimento saudável */
--bad:   #8A2A38   /* crítico, surto, risco alto */
--warn:  #A6580F   /* alerta, atenção */
--info:  #1B5E6E   /* informativo neutro */
```

**Risk levels (gauge + badges)**
```css
--risk-alto:   #D94F4F
--risk-medio:  #E8903A
--risk-baixo:  #4A9B6F
```

**Sistema accents (ícones de KPI card)**
```css
--sim:    #B85C6E   /* SIM · mortalidade */
--sih:    #4A7FBF   /* SIH · internações */
--sinasc: #4A9B72   /* SINASC · nascimentos */
--sia:    #7B6BBF   /* SIA · ambulatorial */
--sinan:  #D4883A   /* SINAN · vigilância epidemiológica */
--cnes:   #5B8A9E   /* CNES · estabelecimentos */
--vacina: #4A9B72   /* Cobertura Vacinal */
--lotacao:#D4883A   /* Superlotação */
--insumo: #B85C6E   /* Ruptura de Insumos */
```

---

## Typography

```
Display KPI:   Inter Tight 700–900, tracking -2% a -3.5%
UI Body:       Inter 400–600
Acento títulos: Instrument Serif italic (só em page titles)
Mono:          JetBrains Mono (CID codes, timestamps, %)
```

**Scale**
```
display/48–64 800   KPI hero (número principal)
display/32    700   Page title
heading/22    700   Section title (Inter Tight)
body/14       400   Corpo (lh 1.6, max 65ch)
label/13      600   Item labels, table headers
eyebrow/10.5  700   Uppercase tracking 0.13em (seções)
mono/10–11          Timestamps, CID, percentuais
```

*Instrument Serif* apenas em títulos de página como acento — nunca em corpo ou UI funcional.

---

## Elevation

Sem sombras pesadas. Elevação via borda + sombra mínima:

```css
/* card padrão */
box-shadow: 0 0 0 1px var(--ink-100);

/* card elevado */
box-shadow: 0 1px 3px rgba(0,0,0,.07), 0 4px 16px rgba(0,0,0,.05);

/* overlay / modal */
box-shadow: 0 12px 28px rgba(20,16,8,.10), 0 0 0 1px var(--ink-100);
```

---

## Border Radius

```
4px   inputs, badges pequenos
6px   botões compactos, chips
8–10px botões padrão, dropdowns
12–14px cards principais
99px   pills, dots, avatares
```

---

## Components

### Sidebar

```
width: 220px
background: var(--sidebar-bg)
padding: 0

Logo: 56px de altura, padding 16px 20px
  - ícone quadrado arredondado 28px + wordmark Inter Tight 700

Nav section label (ANÁLISES / SISTEMA):
  font: eyebrow/10.5 700
  color: var(--sidebar-section)
  padding: 20px 20px 6px

Nav item:
  height: 40px, padding: 0 16px
  display: flex, align-items: center, gap: 10px
  color: var(--sidebar-text)
  border-radius: 0 (full width)
  icon: 18px, color: var(--sidebar-icon)

  &.active:
    background: var(--sidebar-active-bg)
    color: var(--sidebar-text-active)
    icon color: white
    border-left: 3px solid var(--sidebar-active-bar)

  &:hover (não ativo):
    background: rgba(255,255,255,.06)

Badge de alerta (número vermelho):
  position: absolute right, 16px
  background: var(--bad), color: white
  border-radius: 99px, font: mono/11 700
  padding: 2px 6px

Footer:
  margin-top: auto, padding: 16px 20px
  sync indicator: dot verde pulsando + texto "Dados em sincronia · há Xmin"
  user row: avatar 30px + nome + cargo, padding-top: 12px
```

### Topbar

```
height: 60px
background: var(--canvas)
border-bottom: 1px solid var(--ink-100)
padding: 0 36px
display: flex, align-items: center, justify-content: space-between

Left: breadcrumb (eyebrow/10.5 > label/14 700)
Right: SearchBar + IconButton calendar + IconButton bell
```

**SearchBar**:
```
width: 260px, height: 34px
background: var(--elev)
border: 1px solid var(--ink-200)
border-radius: 8px
placeholder: "Buscar UBS, CID, medicamento, alerta..."
right slot: kbd shortcut badge (⌘K)
```

### KPI Card

```
background: var(--elev)
border: 1px solid var(--ink-100)
border-radius: 12px
padding: 18px 20px
min-height: 110px

Layout:
  header: eyebrow label + icon 32px (cor do sistema)
  value:  display/48 Inter Tight 800, color ink-900
  delta:  badge delta (↑/↓ X% vs. mês ant.)
  sparkline: 48px altura, linha fina, sem eixos, bottom da card

Delta badge colors:
  positivo bom: background #E8F5EE, color #2A6B40
  negativo ruim: background #FBE8EA, color #8A2A38
  neutro: background var(--subtle), color ink-500
```

### Greeting Banner

```
background: linear-gradient(135deg, #1E3C3C 0%, #2A5050 100%)
border-radius: 14px
padding: 20px 24px
color: white

Left: avatar 44px (iniciais) + saudação h2 + frase contextual
  highlight inline: badge translúcido com dado crítico (ex: "72%", "4 alertas críticos")
Right: botões "Ver alertas" (outline branco) + "Gerar ETP" (filled teal claro)

Frase gerada dinamicamente com dado do dia mais crítico.
```

### Filter Bar (páginas de análise)

```
background: #1E3C3C (mesmo tom sidebar)
border-radius: 12px
padding: 14px 20px
display: flex, gap: 16px, align-items: center

Campos: Agravo/CID · Período · Cidade/Região (ou Hospital)
Estilo dos inputs: fundo rgba(255,255,255,.12), borda rgba(255,255,255,.2)
  texto: white, placeholder: rgba(255,255,255,.5)
  border-radius: 8px, padding: 10px 14px

Botões right: "Recalcular" (teal claro filled) + "Exportar" (outline branco)
```

### Forecast LineChart

```
Biblioteca: Recharts (LineChart + ComposedChart)
Altura: 220px

Linha real:     stroke #1B5E6E, strokeWidth 2, tipo "monotone"
Linha previsão: stroke #4DB8A0, strokeWidth 2, strokeDasharray "5 4"
Banda de IC:    Area com opacity 0.08, fill #4DB8A0
Annotation "Previsão →": texto + seta no início do forecast

Legenda: row no bottom, ícones customizados (linha sólida / tracejada / área)
Sem gridlines verticais. Grid horizontal opacity 0.3, color ink-200.
Tooltip: fundo var(--elev), borda ink-100, sombra elevação card, formato pt-BR.
```

### RiskGauge (Risco Agregado)

```
SVG semicírculo (180°)
Track: arco cinza ink-100, strokeWidth 18
Fill: arco colorido baseado em --risk-*, strokeWidth 18
  0–40%: --risk-baixo
  40–70%: --risk-medio
  70–100%: --risk-alto

Centro: valor % em display/36 Inter Tight 800 + label "PROBABILIDADE DE SURTO · PRÓXIMOS 60D"

Abaixo: tabela de sub-scores com label + valor + badge nível
  Epidemiológico / Capacidade leitos / Estoque crítico / Vacinação
```

### HexMap (Mapa SP por região de saúde)

```
SVG com hexágonos regulares dispostos geograficamente (17 regiões de SP)
Cada hex: fill baseado em nível de risco (--risk-baixo/medio/alto)
  + label nome região (font 10px) + valor casos (font 11px 700)

Hover: hex ilumina + tooltip com dados da região
Click: drill-down para região específica (fase futura)

Legenda horizontal: RISCO · baixo ← gradiente → alto

Sem uso de biblioteca de mapa. SVG puro posicionado manualmente.
```

### BarRow (rankings e causas)

```
display: flex, align-items: center, gap: 8px, padding: 6px 0
border-bottom: 1px solid var(--ink-50)

Left: código CID em JetBrains Mono 10px ink-400 (40px fixo) + nome causa
Middle: barra de progresso, height 4px, border-radius 99px
  fill: var(--sistema-accent) com opacity .7
Right: valor numérico label/13 600 + (R$ se custo)
```

### Stacked BarChart (Desfecho clínico)

```
Recharts BarChart com stacking
Cores: verde (#4A9B72) casos leves · âmbar (#E8903A) hospitalizações · vermelho (#D94F4F) óbitos
borderRadius: [4,4,0,0] no topo da barra composta
Legenda: row abaixo do gráfico, dots coloridos
```

### DonutChart (distribuição)

```
Recharts PieChart, innerRadius 60%, outerRadius 85%
Centro: valor total + label "pessoas" ou "categorias"
Tooltip padrão customizado
Legenda: lista à direita com dot + label + percentual right-aligned
```

### AlertItem

```
display: flex, align-items: center, gap: 12px, padding: 14px 0
border-bottom: 1px solid var(--ink-50)

Left: dot colorido 10px (cor = tipo de alerta)
Center: título 14 600 + fonte + tempo em mono
Right: badge tipo (Surto / Insumo / Lotação)

Badge tipos:
  Surto:   background rgba(217,79,79,.1), color --risk-alto, border 1px
  Insumo:  background rgba(184,92,110,.1), color --sim
  Lotação: background rgba(232,144,58,.1), color --warn
```

### FloatingChatBot

```
position: fixed, bottom: 24px, right: 24px
button: 48px × 48px, border-radius: 99px
background: #1E3C3C, color: white
icon: robô/bot 22px
box-shadow: 0 4px 16px rgba(0,0,0,.2)

Hover: scale(1.05), shadow aumenta
```

---

## Pages

### Visão Geral

```
Header: GreetingBanner (full width)

KPI row: 4 cards iguais
  · Casos Notificados 30D (--sinan laranja)
  · Índice de Risco Regional (--bad vermelho)
  · UBS em Ruptura ou Alerta (--warn âmbar)
  · Cobertura Vacinal Média (--good verde)

Grid 2col (1.4fr 1fr):
  Left: ForecastLineChart (Dengue por default, filtrável)
  Right: RiskGauge + tabela sub-scores

Grid 2col (1.2fr 1fr):
  Left: HexMap SP regiões de saúde
  Right: DonutChart ruptura por categoria + lista top itens

AlertsRecent: lista 3 itens recentes + link "Ver todos (N)"
```

### Epidemiologia SINAN

```
FilterBar: Agravo/CID · Período · Cidade/Região

KPI row: 4 cards
  · Total Casos Notificados
  · Taxa Hospitalização (%)
  · Taxa Óbito (%)
  · Incidência /100mil hab.

Grid 2col:
  Left: LineChart sazonalidade (3 linhas: ano atual, anterior, média 5 anos)
  Right: DonutChart distribuição por cidade (top 6)

Grid 2col:
  Left: BarChart horizontal faixa etária (distribuição absoluta)
  Right: DonutChart distribuição por gênero

Stacked BarChart: Desfecho clínico por ano (cura/hosp/óbito)
```

### Internações SIH

```
FilterBar: Agravo/CID · Período · Hospital

KPI row: 4 cards
  · Internações no Período
  · Permanência Média (dias)
  · Reinternações em 30D (%)
  · Custo Total SIH (R$ mil)

Grid 2col:
  Left: ComposedChart barras internações + linha custo mensal (eixo Y duplo)
  Right: tabela Principais Grupos de Causa (CID + QTD + custo médio)

Grid 2col:
  Left: BarChart horizontal Permanência média por grupo diagnóstico
  Right: DonutChart Origem das AIH (PS / Eletivo / UBS / Transferência)
```

### Cobertura Vacinal (placeholder)

```
FilterBar: Vacina · Período · Cidade/Região
KPI: Cobertura % · Meta atingida · Faltosos · Doses aplicadas
Gráficos: evolução cobertura + heatmap por UBS
```

### Superlotação (placeholder)

```
FilterBar: Hospital · Período
KPI: Ocupação UTI % · Ocupação leitos · Tempo espera médio · Altas pendentes
Gráficos: linha ocupação ao longo do tempo + ranking hospitais
```

### Ruptura de Insumos (placeholder)

```
FilterBar: Categoria · UBS · Período
KPI: Itens em ruptura · UBS afetadas · Pedidos pendentes · Cobertura dias
Gráficos: lista itens + mapa UBS afetadas
```

---

## Motion

Mínimo e funcional:

```
KPI value rise:   translateY(8px)→0 + opacity 0→1, 0.5s cubic-bezier(.2,.7,.3,1)
Card hover:       box-shadow + translateY(-1px), 0.15s ease
Gauge fill:       stroke-dashoffset animado, 0.8s ease-out, delay 0.2s
HexMap hover:     fill brightness + scale 1.05, 0.12s ease
Alert dot pulse:  scale 1→1.3→1, 1.8s ease-in-out infinite (apenas dots críticos)
Skeleton shimmer: translateX(-100%→100%), 1.8s ease-in-out infinite
Nav transitions:  background + color, 0.1s ease

Sem: bounce, elastic, layout animation, parallax
```

---

## Accessibility

- Contraste mínimo 4.5:1 para texto corpo, 3:1 para texto grande
- Focus ring: `outline: 2px solid var(--primary), outline-offset: 2px`
- Todos os gráficos com `aria-label` descritivo
- Ícones sem texto: `aria-hidden`, ação descrita no botão pai
- Sidebar active item: `aria-current="page"`

---

## Não fazer

- Não usar branco puro `#FFFFFF` como background de página
- Não usar o verde `#BACDC7` do protótipo no painel de conteúdo (saturado demais, briga c/ charts) — usar `--content`
- Não usar gradientes decorativos em cards de dados
- Não adicionar animações de entrada em dados que atualizam em tempo real (distrai)
- Não usar mais de 3 cores num mesmo gráfico sem necessidade semântica clara
- Não colocar bordas coloridas em cards (exceto callouts de alerta com border-left)
- Não usar fonte diferente de Inter/Inter Tight/Instrument Serif/JetBrains Mono
