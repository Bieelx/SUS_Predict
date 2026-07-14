# Pontos em Aberto — Telas Faltantes

**Status: PARA VALIDAR**

## Objetivo

As telas `00`-`06` cobrem o fluxo core do MVP (Visão Geral, Insumos, Alertas, ETP) e as
telas de consulta de nível 2 (Epidemiologia, Internações, Superlotação), todas validadas
entre si em [05-casos-de-uso-e-testes.md](./05-casos-de-uso-e-testes.md). Este documento
lista o que **ainda não foi desenhado**, para eu (Claude) retomar quando o usuário validar
prioridade — não é trabalho perdido, é escopo conscientemente adiado.

---

## 1. Painel do SusBot (a conversa em si) — RESOLVIDO (desenho da tela)

**Status: design da tela fechado em [08-painel-susbot.md](./08-painel-susbot.md).**

Decisão do grupo: o painel de conversa entra nesta rodada (não fica só para Fase 2), mas
com respostas de agente real (não mockadas) — o que empurrou a arquitetura do agente
(acesso a banco, multi-agente) para um **spec de backend separado**, ainda não escrito.
O documento 08 cobre apenas a experiência de tela: layout (painel lateral à direita),
estado inicial (campo livre, sem sugestões), histórico persistido em banco, formato de
resposta (texto + link para tela de origem) e loading/erro.

**Arquitetura do agente:** fechada em [../06-agente-susbot.md](../06-agente-susbot.md) —
um agente (não roteador multi-agente), ferramentas híbridas (parametrizadas + SQL
controlado com allowlist), LangGraph + Gemini, streaming via SSE. Inclui a criação de
tabelas novas de estoque e alertas (não existiam dado real algum). Isolamento por
município fica como risco aceito nesta fase — depende de JWT completo (Fase 1
pós-TCC).

## 2. Cadastro de Unidades

**Origem:** surgiu na conversa sobre a lacuna de custo por procedimento em Internações SIH
([06-analises-nivel2.md](./06-analises-nivel2.md)). **A análise de dados
([05-analise-dados.md](../05-analise-dados.md)) mostrou que essa motivação não existe
mais** — o custo já vem do DATASUS (`VAL_TOT` na AIH), não precisa de cadastro manual.

**Motivação que sobrevive:** capacidade instalada (leitos por setor) para a Superlotação.
Hoje pensada como vinda do CNES, mas a análise de dados ainda não confirmou se a versão
corrigida do PySUS expõe leitos por especialidade (só confirma estabelecimentos). Se não
expuser, ou se o dado for pouco confiável, Cadastro de Unidades volta a fazer sentido —
mas para capacidade, não para custo.

**O que falta desenhar:** a tela em si (se for adiante) — nome, endereço, tipo
UBS/Hospital, capacidade por setor.

**Por que ficou de fora até agora:** depende do resultado da investigação de CNES/leitos,
que só pode ser feita depois de corrigir a versão do PySUS (achado crítico da análise de
dados).

## 3. Telas utilitárias — Login, Configurações, Perfil

**O que existe hoje:** o protótipo mock atual (`App.jsx`) já tem versões dessas três
(`LoginScreen`, `PageConfiguracoes`, `PagePerfil`) — não fazem parte da decisão de "não
reaproveitar" no mesmo sentido que Visão Geral/Epidemiologia/Internações, porque não são
telas de valor diferencial do produto (não carregam a proposta de "briefing de decisão").

**O que falta desenhar:** nada foi repensado aqui ainda. Prováveis necessidades reais:
- **Login:** autenticação simples (docs/02-produto.md já registra "autenticação básica
  para demo" como suficiente no MVP — JWT completo é Fase 1 pós-TCC)
- **Configurações:** thresholds de alerta (ex: dias restantes que disparam "crítico"),
  preferências de notificação — conecta diretamente com os limiares mencionados em
  [02-ruptura-insumos.md](./02-ruptura-insumos.md) e [03-central-alertas.md](./03-central-alertas.md)
  (ex: pergunta em aberto sobre limiar de estoque desatualizado configurável)
  — vale desenhar junto quando essas pendências forem fechadas
- **Perfil:** provavelmente padrão (dados do usuário, troca de senha) — baixa prioridade
  de redesenho

**Por que ficou de fora até agora:** não bloqueiam a validação do fluxo core nem das telas
de análise — são suporte, não a proposta de valor.

---

## Como usar este documento

Quando o usuário quiser retomar qualquer um dos três pontos, referenciar a seção
correspondente aqui como ponto de partida — cada uma já tem o contexto de origem e o que
falta decidir, sem precisar re-explorar a conversa anterior.
