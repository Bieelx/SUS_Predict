# Orquestração de agentes para implementação do redesenho de telas

**Status: PROPOSTO**

## Contexto

O frontend (`frontend/src/App.jsx`) está passando por um redesenho completo de produto,
documentado tela por tela em `docs/telas/` (ver [docs/telas/README.md](../../telas/README.md)).
O protótipo visual atual (~1860 linhas, dados 100% mockados) será descartado — ver seção
"Redesenho de telas em andamento" no [CLAUDE.md](../../../CLAUDE.md) raiz.

Todas as telas em `docs/telas/` estão marcadas `PROPOSTO` (nenhuma `APROVADO`), mas o grupo
decidiu implementar mesmo assim, tratando o conteúdo desses docs como especificação válida.
Exceção: [docs/telas/07-pontos-em-aberto.md](../../telas/07-pontos-em-aberto.md) está
marcado `PARA VALIDAR` e descreve telas que **ainda não foram desenhadas** (painel do
SusBot, Cadastro de Unidades) — essas ficam fora desta rodada por falta de spec, não por
decisão de escopo.

O usuário vai operar a sessão principal com o modelo Fable como orquestrador, delegando a
implementação para subagents rodando Sonnet 5. Esta spec define a arquitetura de agentes,
não o conteúdo de cada tela (isso já está em `docs/telas/`).

## Objetivo

Definir uma arquitetura de subagents (`.claude/agents/*.md`) e uma sequência de invocações
que permita à Fable implementar as 7 telas do redesenho (navegação + 4 telas nível 1 +
3 análises nível 2) com qualidade visual consistente, mockadas, sem conflito de arquivo
entre execuções paralelas — e com verificação visual real via navegador, não só leitura de
código.

## Arquitetura: 2 tipos de subagent

### `frontend-tela-implementer`

- **Model:** sonnet
- **Tools:** Read, Write, Edit, Bash
- **Entrada esperada no prompt (montada pela Fable, não pelo implementer):**
  1. Caminho do doc da tela em `docs/telas/<n>.md`
  2. Um **brief visual objetivo** escrito pela Fable a partir do wireframe textual do doc +
     tokens visuais de `DESIGN.md` — layout, hierarquia visual, componentes-chave, o que
     evitar. Não é aceitável mandar apenas "leia o doc e implemente".
  3. Caminho do componente de destino (ex: `frontend/src/pages/VisaoGeral.jsx`)
  4. Convenções do projeto: componentes em PascalCase, CSS-in-JS inline com variáveis de
     tema (ver `App.jsx` atual como referência de padrão visual, mesmo que a lógica mockada
     seja descartada), sem chamada a API nesta rodada (tudo mockado)
- **Responsabilidade:** implementar uma tela por vez como componente isolado, seguindo o
  brief visual e o doc da tela. Não decide sozinho a estrutura de UX — segue o que a Fable
  definiu no brief.

### `frontend-tela-reviewer`

- **Model:** sonnet
- **Tools:** Read, Bash, `mcp__Claude_Browser__navigate`, `mcp__Claude_Browser__computer`,
  `mcp__Claude_Browser__read_page`, `mcp__Claude_Browser__tabs_create`,
  `mcp__Claude_Browser__tabs_close`, `mcp__Claude_Browser__get_page_text`
- **Pré-requisito:** servidor dev já no ar (ver Fase 0)
- **Fluxo:**
  1. Abre aba própria (`tabs_create`) e navega para a rota da tela implementada
  2. Tira screenshot (`computer` → `screenshot`/`zoom`) e lê a árvore de acessibilidade
     (`read_page`) para pegar detalhes que não aparecem só visualmente
  3. Avalia contra: o brief visual da Fable, o doc da tela, os tokens do `DESIGN.md`, e a
     auditoria de consistência entre telas em
     [docs/telas/05-casos-de-uso-e-testes.md](../../telas/05-casos-de-uso-e-testes.md)
  4. Reporta veredito (aprovado/reprovado) com achados concretos — inclui craft visual
     (alinhamento, contraste, hierarquia, espaçamento), não só corretude funcional/dados
  5. Fecha a aba (`tabs_close`)
- **Responsabilidade:** reportar gaps, não corrigir sozinho — quem decide se manda o
  implementer ajustar ou aceita ressalva é a Fable.

Só 2 arquivos de agente, reutilizados N vezes cada — não um agente por tela.

## Estrutura de arquivos (pré-requisito de implementação)

`App.jsx` passa a conter só o shell: sidebar/navegação (`00-navegacao.md`) + roteamento +
`<FloatingChat>`. Cada tela sai como componente próprio, ex:

```
frontend/src/pages/
  VisaoGeral.jsx
  Insumos.jsx
  CentralAlertas.jsx
  GeradorETP.jsx
  AnalisesTemplate.jsx      (template comum, ver Fase 2)
  Epidemiologia.jsx
  Internacoes.jsx
  Superlotacao.jsx
```

Sem essa separação, execuções paralelas colidem no mesmo arquivo.

## Sequenciamento

### Fase 0 — Setup + Shell

1. Fable roda o servidor dev uma única vez (`preview_start`, `npm run dev` via
   `.claude/launch.json`) — fica no ar durante todo o processo, todas as fases seguintes
   reaproveitam essa mesma instância.
2. Fable escreve o brief visual do shell (sidebar, dois níveis de navegação, badge de
   alertas) a partir de `00-navegacao.md` + `DESIGN.md`.
3. 1 chamada `frontend-tela-implementer` para o shell (rotas podem apontar para
   componentes placeholder nesta fase).
4. 1 chamada `frontend-tela-reviewer` — valida que o shell responde no navegador
   (navegação funciona, rotas placeholder carregam) antes de prosseguir.

### Fase 1 — Telas nível 1 e ações (paralelo)

Depois do shell aprovado, Fable escreve um brief visual por tela e dispara em paralelo:

- Visão Geral (`01-visao-geral.md`)
- Ruptura de Insumos (`02-ruptura-insumos.md`)
- Central de Alertas (`03-central-alertas.md`)
- Gerador de ETP (`04-gerador-etp.md`)

4 chamadas `implementer` em paralelo, cada uma seguida da sua `reviewer`.

### Fase 2 — Análises Nível 2 (semi-sequencial)

`06-analises-nivel2.md` define um template comum + 3 especializações
(Epidemiologia/Internações/Superlotação). Por isso:

1. Fable escreve o brief visual do template compartilhado → 1 chamada `implementer` →
   1 chamada `reviewer`
2. Com o template aprovado, Fable escreve o brief de cada especialização e dispara 3
   chamadas `implementer` em paralelo, cada uma reusando o template → 3 chamadas
   `reviewer` (podem rodar em paralelo, cada uma em sua própria aba do navegador)

### Fase 3 — Consistência final

1 chamada extra do `reviewer`, com escopo "audite as 7 telas juntas contra
`05-casos-de-uso-e-testes.md`" — pega inconsistência que só aparece olhando o conjunto
(ex: mesmo dado com rótulo diferente em duas telas, comportamento divergente de um
componente compartilhado).

## Fora de escopo

- Integração com API real — todas as telas seguem mockadas nesta rodada (decisão
  explícita: focar em layout/UX primeiro, integração fica para rodada seguinte)
- Telas de `docs/telas/07-pontos-em-aberto.md` (painel do SusBot, Cadastro de Unidades) —
  sem spec ainda, não implementar
- Conteúdo específico do design de cada tela — já está definido em `docs/telas/`, esta
  spec não redefine isso

## Total de chamadas

9 chamadas `implementer` + 9 chamadas `reviewer` ao longo do processo (1 shell + 4 telas
nível 1 + 1 template + 3 especializações = 9), usando apenas 2 arquivos de agente.

## Próximo passo

Plano de implementação detalhando o conteúdo exato dos 2 arquivos
`.claude/agents/frontend-tela-implementer.md` e `.claude/agents/frontend-tela-reviewer.md`
(system prompt, formato esperado do brief visual, formato esperado do relatório de
review).
