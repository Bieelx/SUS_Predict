# Pontos em Aberto — Telas Faltantes

**Status: PARA VALIDAR**

## Objetivo

As telas `00`-`06` cobrem o fluxo core do MVP (Visão Geral, Insumos, Alertas, ETP) e as
telas de consulta de nível 2 (Epidemiologia, Internações, Superlotação), todas validadas
entre si em [05-casos-de-uso-e-testes.md](./05-casos-de-uso-e-testes.md). Este documento
lista o que **ainda não foi desenhado**, para eu (Claude) retomar quando o usuário validar
prioridade — não é trabalho perdido, é escopo conscientemente adiado.

---

## 1. Painel do SusBot (a conversa em si)

**O que já está decidido:** o SusBot é um ícone de chat flutuante, sempre visível, não um
item de menu ([00-navegacao.md](./00-navegacao.md)). O texto que ele injeta
automaticamente na Visão Geral (3-4 linhas de insight, Fase 1/Gemini) está especificado na
Camada 2 de [01-visao-geral.md](./01-visao-geral.md).

**O que falta desenhar:** a experiência de *abrir* o chat e conversar — layout do painel,
sugestões de pergunta iniciais, histórico de mensagens, como uma resposta referencia dado
de outra tela (ex: "seu estoque de soro aguenta X dias" puxando de Insumos).

**Por que ficou de fora até agora:** docs/02-produto.md já registra que a Fase 1 do MVP é
só o texto automático — o painel de conversa completo é mais natural na Fase 2
(LangGraph). Decisão a validar: um painel simples (perguntas pré-definidas + resposta
fixa/mockada) entra nesta rodada de design, ou fica só para quando a Fase 2 for planejada?

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
