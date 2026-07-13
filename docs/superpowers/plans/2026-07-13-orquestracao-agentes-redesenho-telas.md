# Orquestração de Agentes para Redesenho de Telas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar os 2 arquivos de subagent (`.claude/agents/frontend-tela-implementer.md` e `.claude/agents/frontend-tela-reviewer.md`) e a configuração de servidor dev (`.claude/launch.json`) que permitem à Fable orquestrar a implementação das telas do redesenho, com verificação visual real via navegador.

**Architecture:** 2 subagents reutilizáveis (não um por tela) — um implementa componentes React isolados e mockados a partir de um brief visual + doc da tela; outro abre a tela no navegador, tira screenshot, e audita contra o brief, o doc, `DESIGN.md` e `docs/telas/05-casos-de-uso-e-testes.md`. Um `.claude/launch.json` permite subir o servidor dev uma única vez via `preview_start` para o reviewer reutilizar.

**Tech Stack:** Markdown com frontmatter YAML (definição de subagent do Claude Code), Vite/React (frontend já existente), MCP Browser tools (`mcp__Claude_Browser__*`).

## Global Constraints

- Telas implementadas nesta rodada ficam 100% mockadas — nenhuma chamada `fetch`/`axios` (ver spec, seção "Fora de escopo")
- Componentes em PascalCase, CSS-in-JS inline com variáveis de tema seguindo o padrão `THEMES`/`var(--token)` já usado em `frontend/src/App.jsx` (ver `DESIGN.md`, seção "Color Strategy" e "Tokens", linhas 38-113)
- Cada tela vira um arquivo próprio em `frontend/src/pages/` — nunca editar o componente de outra tela
- Apenas 2 arquivos de subagent no total (`frontend-tela-implementer`, `frontend-tela-reviewer`), reutilizados por chamada — não criar um agente por tela
- `docs/telas/07-pontos-em-aberto.md` não tem spec pronta — os agentes desta rodada não são usados para essas telas
- Reviewer é somente-leitura em relação ao código: reporta achados, não edita arquivos

---

## Mapa de arquivos

```
.claude/
  launch.json                              (criar — config do servidor dev p/ preview_start)
  agents/
    frontend-tela-implementer.md           (criar)
    frontend-tela-reviewer.md              (criar)
```

Nenhum arquivo de tela real (`frontend/src/pages/*.jsx`) é criado neste plano — isso é trabalho dos próprios subagents quando invocados depois, tela por tela. Este plano só constrói a infraestrutura de agentes e valida que ela funciona de ponta a ponta com uma tela descartável de "smoke test".

---

### Task 1: `.claude/launch.json` — configuração do servidor dev

**Files:**
- Create: `.claude/launch.json`

**Interfaces:**
- Produces: entrada `"frontend-dev"` que `preview_start({name: "frontend-dev"})` (ferramenta `mcp__Claude_Browser__preview_start`) consome nas tasks seguintes e nas fases futuras de implementação de telas.

- [ ] **Step 1: Criar o arquivo de configuração**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "frontend-dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--prefix", "frontend"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 2: Subir o servidor e verificar que responde**

Chamar a ferramenta `preview_start` com `{"name": "frontend-dev"}`.

Expected: retorna um `serverId`. Em seguida chamar `preview_logs` com esse `serverId` e `level: "error"` — esperado: nenhuma linha de erro (build do Vite limpo).

- [ ] **Step 3: Verificar no navegador que a página carrega**

Chamar `navigate` para `http://localhost:3000` na aba principal, depois `get_page_text`.

Expected: texto não vazio (a aplicação React montou — o `App.jsx` atual renderiza a tela de login/wizard). Se vier em branco, checar `preview_logs` antes de prosseguir — não seguir para a Task 2 com o servidor quebrado.

- [ ] **Step 4: Commit**

```bash
git add .claude/launch.json
git commit -m "chore: adiciona config de servidor dev para preview_start"
```

---

### Task 2: Agente `frontend-tela-implementer`

**Files:**
- Create: `.claude/agents/frontend-tela-implementer.md`

**Interfaces:**
- Consumes: nenhuma (primeiro agente da arquitetura)
- Produces: subagent invocável via `Agent({subagent_type: "frontend-tela-implementer", prompt: ...})`. O prompt de invocação (montado pela Fable em uso futuro) deve conter: (1) caminho do doc em `docs/telas/<n>.md`, (2) brief visual objetivo, (3) caminho do arquivo de destino em `frontend/src/pages/`, (4) se a tela precisa de uma entrada de rota no shell (`App.jsx`) e qual.

- [ ] **Step 1: Escrever o arquivo do agente**

```markdown
---
name: frontend-tela-implementer
description: Implementa uma tela do redesenho de produto do SusPredict como componente React isolado e mockado, seguindo um brief visual e o doc da tela fornecidos no prompt de invocação. Use uma vez por tela, nunca para mais de uma tela na mesma chamada.
tools: Read, Write, Edit, Bash
model: sonnet
color: blue
---

Você implementa UMA tela por vez do redesenho de produto do SusPredict, um dashboard de
dados públicos de saúde (DATASUS). Você não decide a estrutura de UX sozinho — ela já foi
decidida e chega até você de duas formas, ambas obrigatórias no prompt de invocação:

1. **O doc da tela** em `docs/telas/<n>.md` — a especificação funcional (casos de uso,
   dados exibidos, estados, regras).
2. **Um brief visual** escrito pelo orquestrador — layout, hierarquia visual, componentes-
   chave, o que evitar. Se o brief conflitar com o doc, o doc vence; registre o conflito no
   seu relatório final, não decida sozinho qual seguir.

## Restrições obrigatórias

- **Mock-only**: nenhuma chamada `fetch`, `axios` ou similar. Dados vêm de arrays/objetos
  estáticos no topo do arquivo do componente, com valores plausíveis para um município
  brasileiro médio.
- **Um componente por tela**, em `frontend/src/pages/<NomeTela>.jsx`, PascalCase. Nunca edite
  o componente de outra tela nem o arquivo de outra chamada sua.
- **Tokens visuais**: siga o sistema de CSS-in-JS inline com variáveis de tema já usado no
  projeto (ver `frontend/src/App.jsx`, objeto `THEMES`, e `DESIGN.md` seção "Color Strategy"
  / "Tokens"). Use `var(--token)` para cor, nunca hex hardcoded direto no componente novo.
- Se a tela precisar aparecer no menu/roteamento do shell, o prompt de invocação vai indicar
  isso explicitamente — só mexa no shell (`App.jsx` ou onde a navegação estiver implementada)
  se for instruído a fazer isso.
- Siga as convenções do projeto: componentes em PascalCase, números formatados com
  `.toLocaleString('pt-BR')`, datas em DD/MM/AAAA na exibição.

## Ao terminar

Devolva um relatório curto e objetivo com:
- Arquivo(s) criado(s)/modificado(s)
- Principais decisões de implementação que não estavam explícitas no brief (se houver)
- Qualquer conflito entre o brief e o doc da tela que você resolveu a favor do doc
- Perguntas em aberto do próprio doc da tela que ficaram sem resposta (docs de
  `docs/telas/` frequentemente têm seção "Perguntas em aberto para aprovação" — não invente
  a resposta, apenas sinalize)
```

- [ ] **Step 2: Verificar que o frontmatter é válido**

Rodar:

```bash
python3 -c "
import yaml, re
content = open('.claude/agents/frontend-tela-implementer.md').read()
match = re.match(r'^---\n(.*?)\n---\n', content, re.DOTALL)
assert match, 'frontmatter não encontrado'
data = yaml.safe_load(match.group(1))
assert data['name'] == 'frontend-tela-implementer'
assert data['model'] == 'sonnet'
assert 'Write' in data['tools'] and 'Edit' in data['tools']
print('OK:', data['name'], data['model'], data['tools'])
"
```

Expected: `OK: frontend-tela-implementer sonnet Read, Write, Edit, Bash`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/frontend-tela-implementer.md
git commit -m "feat: adiciona subagent frontend-tela-implementer"
```

---

### Task 3: Smoke test do `frontend-tela-implementer`

**Files:**
- Create (pelo subagent, não por você diretamente): `frontend/src/pages/_SmokeTest.jsx`

**Interfaces:**
- Consumes: subagent `frontend-tela-implementer` da Task 2
- Produces: confirmação de que o agente lê corretamente um doc + brief e escreve um arquivo React válido — pré-requisito de confiança antes de usá-lo nas telas reais

- [ ] **Step 1: Criar um doc de tela descartável para o teste**

```bash
mkdir -p /tmp/smoke-test-docs
cat > /tmp/smoke-test-docs/smoke.md << 'EOF'
# Tela de Smoke Test

**Status: PROPOSTO**

Tela descartável só para validar o pipeline de agentes. Deve mostrar um card central com
o texto "Smoke test OK" e um número mockado de exemplo (42) formatado em pt-BR.
EOF
```

- [ ] **Step 2: Invocar o subagent**

Chamar `Agent({subagent_type: "frontend-tela-implementer", prompt: "Doc da tela: /tmp/smoke-test-docs/smoke.md. Brief visual: card centralizado na tela, fundo branco, borda arredondada (var(--radius) se existir em DESIGN.md, senão 8px), texto 'Smoke test OK' em destaque, abaixo o número 42 formatado com toLocaleString('pt-BR'). Arquivo de destino: frontend/src/pages/_SmokeTest.jsx. Não precisa registrar rota no shell — este é um teste descartável, será removido depois."})`

Expected: relatório de volta confirmando criação de `frontend/src/pages/_SmokeTest.jsx`.

- [ ] **Step 3: Verificar o arquivo gerado**

```bash
test -f frontend/src/pages/_SmokeTest.jsx && echo "ARQUIVO_EXISTE"
grep -q "fetch\|axios" frontend/src/pages/_SmokeTest.jsx && echo "FALHA: chamada de API encontrada" || echo "OK: sem chamada de API"
grep -q "toLocaleString" frontend/src/pages/_SmokeTest.jsx && echo "OK: formatação pt-BR presente" || echo "FALHA: sem toLocaleString"
```

Expected: `ARQUIVO_EXISTE`, `OK: sem chamada de API`, `OK: formatação pt-BR presente`. Se qualquer `FALHA` aparecer, corrigir o texto do agente (Task 2) antes de prosseguir — não seguir para a Task 4 com o implementer não confiável.

Não commitar este arquivo — ele é removido na Task 6.

---

### Task 4: Agente `frontend-tela-reviewer`

**Files:**
- Create: `.claude/agents/frontend-tela-reviewer.md`

**Interfaces:**
- Consumes: servidor dev no ar (Task 1), arquivo de tela já implementado (produzido pelo `frontend-tela-implementer`)
- Produces: subagent invocável via `Agent({subagent_type: "frontend-tela-reviewer", prompt: ...})`. O prompt de invocação deve conter: (1) URL/rota da tela a revisar no servidor já no ar, (2) caminho do doc em `docs/telas/<n>.md`, (3) o mesmo brief visual passado ao implementer, (4) caminho do componente implementado.

- [ ] **Step 1: Escrever o arquivo do agente**

```markdown
---
name: frontend-tela-reviewer
description: Revisa visualmente uma tela do redesenho do SusPredict já implementada — abre a rota no navegador, tira screenshot, inspeciona a árvore de acessibilidade, e compara contra o brief visual, o doc da tela, os tokens de DESIGN.md e a auditoria de consistência entre telas. Use depois que um frontend-tela-implementer terminar uma tela, com o servidor dev já rodando via preview_start.
tools: Read, Bash, mcp__Claude_Browser__navigate, mcp__Claude_Browser__computer, mcp__Claude_Browser__read_page, mcp__Claude_Browser__tabs_create, mcp__Claude_Browser__tabs_close, mcp__Claude_Browser__get_page_text
model: sonnet
color: orange
---

Você audita visualmente UMA tela por vez do redesenho do SusPredict, já implementada e
servida por um servidor dev já no ar. Você não edita código — seu trabalho é reportar
achados com precisão, não corrigir.

## Fluxo obrigatório

1. Abra uma aba própria com `tabs_create` (nunca reuse a aba principal — evita conflito com
   outras revisões rodando em paralelo).
2. Navegue (`navigate`) até a rota da tela indicada no prompt de invocação.
3. Tire um screenshot (`computer` → action `screenshot`) da tela inteira, e use `computer`
   → action `zoom` em qualquer região que precise de inspeção mais próxima (texto pequeno,
   espaçamento, alinhamento).
4. Leia a árvore de acessibilidade com `read_page` — pega labels, hierarquia semântica e
   estrutura que não aparecem só na imagem.
5. Ao final, feche a aba com `tabs_close`. Feche a aba mesmo se a revisão for reprovada ou
   se você encontrar um erro no meio do caminho — nunca deixe aba aberta.

## Contra o que comparar

- **O brief visual** recebido no prompt de invocação (layout, hierarquia, componentes-chave)
- **O doc da tela** em `docs/telas/<n>.md` (dados exibidos, estados, regras funcionais)
- **Os tokens de `DESIGN.md`** (cores, tipografia, elevação, raio de borda — seções
  "Color Strategy", "Typography", "Elevation", "Border Radius")
- **A auditoria de consistência entre telas** em
  `docs/telas/05-casos-de-uso-e-testes.md` — mesma métrica não pode ter rótulo ou
  comportamento diferente em duas telas

## Formato do relatório final

```
VEREDITO: APROVADO | REPROVADO

Achados funcionais:
- [severidade: bloqueante/menor] descrição concreta

Achados visuais/craft:
- [severidade: bloqueante/menor] descrição concreta (ex: "espaçamento inconsistente entre
  KPI cards", "contraste do texto secundário abaixo do razoável sobre fundo --primary-soft")

Achados de consistência entre telas:
- [severidade: bloqueante/menor] descrição concreta

Perguntas em aberto do doc da tela ainda não resolvidas: [liste, não invente resposta]
```

Um achado "bloqueante" reprova a tela. Achados "menor" não impedem aprovação, mas devem
ser listados para o orquestrador decidir se pede ajuste.
```

- [ ] **Step 2: Verificar que o frontmatter é válido**

```bash
python3 -c "
import yaml, re
content = open('.claude/agents/frontend-tela-reviewer.md').read()
match = re.match(r'^---\n(.*?)\n---\n', content, re.DOTALL)
assert match, 'frontmatter não encontrado'
data = yaml.safe_load(match.group(1))
assert data['name'] == 'frontend-tela-reviewer'
assert data['model'] == 'sonnet'
tools = [t.strip() for t in data['tools'].split(',')]
assert 'mcp__Claude_Browser__navigate' in tools
assert 'mcp__Claude_Browser__tabs_close' in tools
print('OK:', data['name'], data['model'])
print('tools:', tools)
"
```

Expected: `OK: frontend-tela-reviewer sonnet` seguido da lista de tools incluindo as 6 ferramentas de navegador.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/frontend-tela-reviewer.md
git commit -m "feat: adiciona subagent frontend-tela-reviewer"
```

---

### Task 5: Smoke test do `frontend-tela-reviewer` (ponta a ponta)

**Files:**
- Nenhum arquivo novo — usa `frontend/src/pages/_SmokeTest.jsx` da Task 3

**Interfaces:**
- Consumes: subagent `frontend-tela-reviewer` (Task 4), servidor dev da Task 1, componente `_SmokeTest.jsx` da Task 3
- Produces: confirmação de que o reviewer consegue navegar, tirar screenshot, e produzir um relatório no formato esperado — valida o pipeline completo antes de usá-lo nas telas reais

- [ ] **Step 1: Registrar uma rota temporária para o smoke test**

Como `_SmokeTest.jsx` não tem rota no shell atual (App.jsx ainda é o protótipo antigo, o
shell novo só existe depois da Fase 0 da spec), sirva o componente isolado via uma entrada
temporária no `main.jsx` só para este teste:

```bash
cp frontend/src/main.jsx /tmp/main.jsx.bak
cat > frontend/src/main.jsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import SmokeTest from './pages/_SmokeTest.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SmokeTest />
  </React.StrictMode>,
)
EOF
```

- [ ] **Step 2: Invocar o reviewer**

Chamar `Agent({subagent_type: "frontend-tela-reviewer", prompt: "Revise a tela em http://localhost:3000 (servidor já no ar via preview_start). Doc da tela: /tmp/smoke-test-docs/smoke.md. Brief visual: card centralizado, fundo branco, borda arredondada, texto 'Smoke test OK' em destaque, número 42 formatado em pt-BR abaixo. Componente: frontend/src/pages/_SmokeTest.jsx. Não há docs/telas/05-casos-de-uso-e-testes.md relevante para este teste descartável — ignore essa comparação."})`

Expected: relatório no formato `VEREDITO: ...` com as 4 seções (funcionais, visuais/craft,
consistência, perguntas em aberto), mencionando o texto "Smoke test OK" e o número
"42" (ou "42" formatado) capturado do screenshot/árvore de acessibilidade — isso confirma
que o reviewer de fato acessou a página renderizada, não alucinou o conteúdo.

- [ ] **Step 3: Restaurar o `main.jsx` original**

```bash
mv /tmp/main.jsx.bak frontend/src/main.jsx
```

---

### Task 6: Limpeza e commit final

**Files:**
- Delete: `frontend/src/pages/_SmokeTest.jsx`

**Interfaces:**
- Consumes: nada
- Produces: estado limpo do repositório, só com os 3 arquivos de infraestrutura de agentes commitados

- [ ] **Step 1: Remover artefatos de teste**

```bash
rm -f frontend/src/pages/_SmokeTest.jsx
rmdir frontend/src/pages 2>/dev/null || true
rm -rf /tmp/smoke-test-docs
git status
```

Expected: `git status` limpo (nenhum arquivo modificado além do que já foi commitado nas
tasks anteriores) — `_SmokeTest.jsx` nunca foi commitado, então não aparece no diff.

- [ ] **Step 2: Parar o servidor dev**

Chamar `preview_stop` com o `serverId` retornado na Task 1.

- [ ] **Step 3: Confirmar os 3 arquivos finais**

```bash
git log --oneline -3
ls .claude/agents/
cat .claude/launch.json
```

Expected: os 3 commits das Tasks 1, 2 e 4 aparecem no log; `.claude/agents/` contém
exatamente `frontend-tela-implementer.md` e `frontend-tela-reviewer.md`.

---

## Próximo passo (fora deste plano)

Com os 2 agentes validados, a Fable pode seguir a sequência definida na spec
(`docs/superpowers/specs/2026-07-13-orquestracao-agentes-redesenho-telas-design.md`):
Fase 0 (shell) → Fase 1 (4 telas nível 1 em paralelo) → Fase 2 (template + 3 análises) →
Fase 3 (consistência final) — escrevendo um brief visual por tela antes de cada chamada do
`frontend-tela-implementer`.
