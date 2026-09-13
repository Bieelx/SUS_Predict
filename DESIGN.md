# Design — SusPredict

Descreve a interface **como está implementada** em `frontend/src` (atualizado em
13/09/2026). Princípios e tom: [PRODUCT.md](./PRODUCT.md). Regras de produto por tela:
`docs/01-produto.md`.

Mood: ferramenta de trabalho do gestor municipal — densa em informação, sem ruído, cada
número com fonte e competência visíveis.

---

## Onde vive o sistema visual

| O quê | Arquivo |
|---|---|
| Tokens base, escala tipográfica, dimensões do shell, foco, animações | `frontend/src/index.css` |
| Ajustes do shell mobile | `frontend/src/mobile.css` |
| Tokens semânticos aplicados no root do app | `SEMANTIC_TOKENS` em `frontend/src/App.jsx` |
| Temas (sidebar + primária) | `THEMES` em `frontend/src/shared/ui.jsx` |
| Componentes base (`Card`, `SectionTitle`, `Badge`, `MIcon`, `LogoIcon`) | `frontend/src/shared/ui.jsx` |
| Componentes de dados (`Kpi`, `FonteReal`, `EstadoConsulta`, `SeletorPeriodo`, skeletons, `botao`) | `frontend/src/shared/dataUi.jsx` |
| Fontes locais (`@font-face`) + licenças | `frontend/public/fonts/` |
| Interface beta (3 variantes, escopo `.beta-app`) | `frontend/src/beta/` |

Estilo é CSS com variáveis + estilos inline que leem `var(--token)`. Tailwind está
instalado mas é residual (utilitários soltos em `Card` e afins); não usar para telas novas.

---

## Layout shell

```text
┌──────────────┬───────────────────────────────────┬────────────┐
│ Sidebar      │ Topbar 60px (--topbar-h)          │ Clara      │
│ 220px        ├───────────────────────────────────┤ 420px      │
│ (--sb-w)     │ Card de conteúdo (margem --gap)   │ (--chat-w) │
│              │                                   │ opcional   │
└──────────────┴───────────────────────────────────┴────────────┘
```

- Sidebar recolhível (preferência em `localStorage` `sus_predict_sidebar`).
- Navegação:
  - **Operacional:** Visão Geral, Alertas, Insumos, Registros da unidade
  - **Análises:** Epidemiologia, Internações, Vacinação
  - Documentos; Configurações e Perfil no rodapé da sidebar
- Clara não é item de menu: abre como painel lateral; com o painel aberto o `main` recua
  `--chat-inset`.
- Seletor de município na topbar (lista de `/api/dados/municipios`; inicial São Paulo
  `355030`, último escolhido salvo em `sus_predict_municipio`).
- Rotas por caminho: `/visao-geral`, `/alertas[/<id>]`, `/insumos`, `/registros-unidade`,
  `/documentos`, `/epidemiologia`, `/internacoes`, `/vacinacao`, `/configuracoes`,
  `/perfil`; prefixo `/beta` para a interface beta. `/privacidade`, `/termos`, `/cookies`
  são páginas legais.

### Mobile (≤ 768px)

- Cabeçalho fixo com marca, página e município.
- Navegação inferior: Visão, Alertas, Insumos, Clara e **Mais** (folha com Registros,
  Análises, Documentos, Configurações, Perfil). Nenhuma função some no celular.
- Clara em tela cheia.
- Canvas na cor do shell; conteúdo num card claro com cantos generosos.
- Uma coluna, `env(safe-area-inset-bottom)`, alvos ≥ 44px, nada essencial em hover.
- 769–1024px: comportamento híbrido (menu lateral temporário).

---

## Cor

### Superfícies e tinta (fixas, independentes de tema)

```css
--canvas:  #F6F5F2   /* fundo da página */
--content: #F1F4F3   /* painel de conteúdo */
--elev:    #FFFFFF   /* cards, modais */
--subtle:  #F0EDE6   /* callouts, zebra */
--tint:    #E9E5DC   /* hover de chip, fundo de tag */

--ink-900: #1A1814   --ink-700: #3D3A33   --ink-500: #6B665D
--ink-400: #6F6B63   --ink-300: #6F6B63   /* ambos AA sobre superfícies claras */
--ink-200: #C9C4BA   /* divisores */
--ink-100: #E5E1D6   /* borda de card */
--ink-50:  #EFEBE0
```

### Semânticas

```css
--good: #2A6B40   --bad: #8A2A38   --warn: #A6580F   --info: #1B5E6E
--risk-alto: #D94F4F   --risk-medio: #E8903A   --risk-baixo: #4A9B6F
```

Faixas de risco de aquisição mapeiam `ALTO → --risk-alto`, `MODERADO → --risk-medio`,
`BAIXO`/`SEM_ALERTA → --risk-baixo`, desconhecido → `--ink-500`.

### Acentos por sistema de dados (`index.css`)

```css
--sim: #B85C6E  --sih: #4A7FBF  --sinasc: #4A9B72  --sia: #7B6BBF
--sinan: #D4883A  --cnes: #5B8A9E  --vacina: #4A9B72  --insumo: #B85C6E
```

### Temas (Configurações)

Cada tema define juntos a sidebar (`--sb`, `--sb-text`, `--sb-section`, `--sb-strong`,
`--sb-icon-*`, `--sb-accent-bar`, `--sb-hover`, `--sb-active-text`, `--sb-border`) e a
primária (`--primary`, `--primary-dark`, `--accent`, `--primary-soft`,
`--primary-soft-border`, `--primary-field`, `--primary-label`, `--primary-on-dark`).

| id | Nome | `--primary` | Sidebar |
|---|---|---|---|
| `teal` (padrão) | Azul SusPredict | `#336FA1` | azul profundo `#1E4A6B`, texto claro |
| `verde` | Verde-saúde | `#2A6B40` | verde claro `#A6C2A0`, texto escuro |
| `ambar` | Âmbar | `#A6580F` | areia `#D8C4A0` |
| `grafite` | Grafite | `#3D3A33` | cinza `#B6BABF` |

O tema escolhido vale para a sessão (não persiste ao recarregar). Toda cor nova deve sair
de um token; contraste foi conferido nos 4 temas.

---

## Tipografia

Fontes servidas localmente (sem Google Fonts em runtime):

| Família | Uso |
|---|---|
| Inter (`--ff-body`) | UI e corpo |
| Inter Tight (`--ff-tight`) | títulos, números de KPI |
| JetBrains Mono (`--ff-mono`) | códigos, timestamps, percentuais técnicos |
| Instrument Serif | acento pontual em títulos; nunca em corpo |
| Material Symbols Rounded | ícones via `<MIcon m="nome" />` (sempre `aria-hidden`) |

Escala única, razão ~1,25 — tamanho novo deve cair num destes:

```css
--fs-xs: 11px   /* eyebrow, meta, legenda */
--fs-sm: 13px   /* rótulo, item de lista */
--fs-md: 15px   /* corpo */
--fs-lg: 20px   /* título de bloco */
--fs-xl: 26px   /* título de página */
```

Eyebrow: uppercase, peso 700, tracking largo. Números sempre em pt-BR
(`shared/formatters.js`: `inteiro`, `decimal`, `moeda`, `percentual`, `dias`).

---

## Elevação e raio

```css
/* card padrão */   box-shadow: 0 0 0 1px var(--ink-100);
/* card elevado */  box-shadow: 0 1px 3px rgba(0,0,0,.07), 0 4px 16px rgba(0,0,0,.05);
/* overlay */       box-shadow: 0 12px 28px rgba(20,16,8,.10), 0 0 0 1px var(--ink-100);
```

Raio: 4px badges/inputs · 6px chips · 8–10px botões · 12–14px cards · 99px pills/avatares.

---

## Padrões de tela

Toda tela de dados segue o mesmo esqueleto:

1. **Cabeçalho:** eyebrow + `h1` com território (`— Município, UF`) + frase de propósito.
2. **`FonteReal`:** fonte, competência/janela e detalhe da consulta. Nenhum número sem
   origem. Na demo o texto deixa explícito que é replay/fictício.
3. **`EstadoConsulta`:** carregando (skeleton), erro com "tentar de novo", ou vazio. Consulta
   vazia mostra estado vazio — nunca número inventado.
4. **`SeletorPeriodo`** quando a tela aceita janela (`Trimestre`, `Semestre`, `12 Meses`,
   `3 Anos`, `5 Anos`).
5. **Linha de `Kpi`** (rótulo, valor, detalhe, tom) seguida de gráficos Recharts.
6. **Tabela acessível** equivalente a cada gráfico (`ChartData`).

| Tela | Arquivo | Dados |
|---|---|---|
| Visão Geral | `shared/RupturaReal.jsx` (`VisaoGeralReal`) | `/api/dados/visao-geral` (município ou estadual) |
| Alertas | `pages/Alertas.jsx` | `/api/dados/ruptura` — filtros por faixa + busca, deep link `/alertas/<id>` |
| Insumos | `shared/RupturaReal.jsx` (`InsumosReais`) | `/api/dados/ruptura` + histórico de aquisições |
| Registros da unidade | `pages/RegistrosUnidade.jsx`, `features/registros-locais/` | `/api/local/*`, `/api/clara/inputs-operacionais/*` |
| Epidemiologia | `pages/Epidemiologia.jsx` | `/api/dados/epidemiologia` |
| Internações | `pages/Internacoes.jsx` | `/api/dados/internacoes` |
| Vacinação | `pages/Vacinacao.jsx` (usa `MapaSP`) | `/api/dados/vacinacao` |
| Documentos | `pages/Documentos.jsx`, `shared/etp.js` | ETPs (PDF) |
| Configurações | `pages/Configuracoes.jsx` (+ `AdminUsuarios` para admin) | tema, demo, links legais |
| Perfil | `pages/Perfil.jsx` | dados da conta (`/api/auth/me`) |
| Clara | `pages/ClaraPanel.jsx` | SSE `/api/susbot/perguntar`; conversas, cartões de artefato/confirmação/rascunho, pareamento de canais, "O que a Clara sabe" |
| Legais | `pages/Legal.jsx` | `/privacidade`, `/termos`, `/cookies` |

Dado local (registros da unidade) sempre rotulado como informado pela unidade e nunca
misturado a totais oficiais.

---

## Movimento

Mínimo e funcional:

- Entrada de página/bloco: `.rise` — `translateY(8px)→0` + opacity, 0,4s `cubic-bezier(.2,.7,.3,1)`.
- Skeleton shimmer em carregamento; pulso só em dot crítico.
- Transições de navegação: cor/fundo ~0,1s.
- `prefers-reduced-motion: reduce` desliga animações.

Sem bounce, elastic, parallax nem animação em dado que atualiza.

---

## Acessibilidade

- Contraste AA (4,5:1 corpo, 3:1 texto grande) nos 4 temas.
- Foco único via `:focus-visible` (anel na cor primária), link de salto para o conteúdo.
- Gráficos com tabela equivalente; ícones decorativos `aria-hidden`.
- Item ativo da navegação com `aria-current="page"`; filtros com `aria-pressed`.
- Não comunicar estado só por cor (faixa de risco sempre com texto).

Não é auditoria WCAG completa (falta VoiceOver/NVDA e zoom 200%).

---

## Não fazer

- Branco puro como fundo de página (usar `--canvas`/`--content`).
- Hex solto em componente novo — criar ou reutilizar token.
- Gradiente decorativo em card de dados; borda colorida em card (exceto callout com
  `border-left`).
- Mais de 3 cores num gráfico sem motivo semântico.
- Fonte fora de Inter / Inter Tight / JetBrains Mono / Instrument Serif; carregar fonte de CDN.
- Número sem `FonteReal`, ou valor fictício fora da demo rotulada.
- Estética de SaaS genérico, gov.br denso, BI de widgets ou dashboard clínico (ver PRODUCT.md).
