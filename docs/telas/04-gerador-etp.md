# Tela 04 — Gerador de ETP

**Status: PROPOSTO**

## O que é o ETP e por que existe

**Estudo Técnico Preliminar**, exigido pela Lei 14.133/2021 (lei de licitações). Nenhuma
secretaria pode abrir um processo de compra pública sem esse documento antes — ele contém
a justificativa técnica de por que precisa comprar, quanto precisa comprar, e a base legal
que ampara a compra.

Hoje esse documento é escrito manualmente, cruzando dados de consumo e previsão de demanda
— leva dias. O SusPredict automatiza a geração porque já tem os dados que normalmente
alguém levaria dias para levantar (previsão de demanda vem do modelo Holt/SINAN, dias
restantes e quantidade vêm do módulo de Insumos). É o terceiro pilar da proposta de valor
([../01-visao-geral.md](../01-visao-geral.md)): reduzir de dias para minutos um trabalho
manual, e é o documento que **desbloqueia juridicamente** a compra planejada, evitando a
compra emergencial (30-40% mais cara).

Status no README: "Conceito" → "Implementar". Estrutura do documento validada
conceitualmente com a Lei 14.133/2021; validação jurídica formal é etapa necessária antes
de produção (docs/02).

## Não é uma tela de navegação — é uma ação contextual

Decisão já registrada em [00-navegacao.md](./00-navegacao.md): `Gerar ETP` não é uma aba do
menu. É um **modal/painel que abre por cima da tela atual**, disparado de múltiplos
pontos:

- Linha de um medicamento em **Insumos** ([02-ruptura-insumos.md](./02-ruptura-insumos.md))
- Item de alerta em **Alertas** ([03-central-alertas.md](./03-central-alertas.md))

O fluxo é sempre o mesmo (as 4 etapas abaixo), mas **pré-preenchido conforme a origem do
clique** — nunca existe um ETP "genérico" sem contexto; ele sempre nasce de um alerta ou
item específico que já tem os dados prontos. Ao terminar, o modal fecha e volta para a tela
de origem, sem navegação de página cheia.

## Fluxo em 4 etapas

### Etapa 1 — Confirmação do que o sistema já sabe

Read-only, sem pedir para a gestora redigitar o que já foi calculado: medicamento (ou
condição de origem), previsão de demanda, quantidade estimada, referência legal aplicável.

**Aviso não bloqueante de dado desatualizado:** se o estoque de origem está com
"confiança reduzida" (>15 dias sem atualização, conforme
[02-ruptura-insumos.md](./02-ruptura-insumos.md)), esta etapa mostra um aviso simples —
"Estoque atualizado há X dias" — sem impedir o avanço. Não bloqueia porque estoque
desatualizado nem sempre indica dado ruim: pode ser um insumo de baixa rotatividade,
parado há semanas por não estar sendo consumido, o que é uma razão legítima para não ter
sido atualizado. Cabe à gestora julgar, com a informação visível.

**Vínculo com a Central de Alertas:** gerar um ETP sempre move o alerta relacionado para
"Em andamento" (ou cria um registro já em "Em andamento", se não havia alerta ativo —
ação preventiva). Regra completa em
[03-central-alertas.md](./03-central-alertas.md).

### Etapa 2 — Dados que só a secretaria sabe

Formulário curto apenas com o que o sistema genuinamente não tem: dotação orçamentária,
unidade requisitante, responsável técnico.

### Etapa 3 — Revisão da justificativa (obrigatória, com trava)

O texto técnico gerado automaticamente (apoio de IA, mesma lógica do SusBot/Gemini)
aparece **editável**. Diferente de um preview passivo, o avanço para a Etapa 4 fica
**travado até a gestora confirmar explicitamente** — um botão do tipo "Revisei e aprovo o
texto", não apenas "Próximo".

**Por que a trava é obrigatória, não opcional:** este é um documento jurídico que sustenta
uma licitação pública e será assinado pela secretaria. Texto gerado por IA sem revisão
humana comprovada (não só "editável, mas ninguém obrigado a olhar") é risco real — se sair
impreciso, quem responde é a gestora, não o sistema. A trava formaliza que houve revisão
antes da geração do documento final.

### Etapa 4 — Geração

Confirma → gera o PDF → dispara o toast de conclusão (já desenhado em
[03-central-alertas.md](./03-central-alertas.md)) → download. O modal fecha e retorna à
tela de origem (Insumos ou Alertas).

## Histórico de Documentos

Elemento adicional necessário: sem histórico, um ETP gerado há duas semanas simplesmente
some. Vira uma lista leve — "Documentos" / "ETPs Gerados" — com:

- Item relacionado (qual medicamento/alerta originou)
- Data de geração
- Status: rascunho (iniciado, não finalizado) / finalizado
- Ação: re-download do PDF (finalizado) ou continuar preenchimento (rascunho)

**Clicar `Gerar ETP` num item que já tem rascunho em aberto retoma esse rascunho** (abre
direto na etapa onde parou), em vez de criar um novo documento — evita dois ETPs
concorrentes para a mesma compra.

**Nível de navegação:** entra como item de baixa prioridade, não compete com o nível
operacional do menu (Visão Geral / Alertas / Insumos). Consistente com o que já estava
cogitado em [00-navegacao.md](./00-navegacao.md) — aba leve, acessível mas não em
destaque.

## Wireframe textual

```
  (disparado a partir de Insumos ou Alertas — abre como modal/painel)

┌──────────────────────────────────────────────────────────────┐
│  Gerar ETP — Dipirona 500mg                            [x]    │
├──────────────────────────────────────────────────────────────┤
│  ① Dados do sistema        ② Dados da secretaria               │
│     ③ Revisão do texto        ④ Geração                        │
│                                                                │
│  ── Etapa 3 — Revisão da justificativa ──                      │
│                                                                │
│  [ texto editável, gerado automaticamente ]                    │
│  "O consumo de Dipirona 500mg apresenta tendência de alta      │
│   acelerada (+12%), com previsão de esgotamento em 22 dias..." │
│                                                                │
│  ☐ Revisei e aprovo o texto acima                               │
│                                                                │
│                                    [Voltar]   [Gerar documento] │
│                                    (desabilitado até marcar ☑)  │
└──────────────────────────────────────────────────────────────┘

  (ao concluir, modal fecha, toast aparece)
  ✓ ETP gerado — Dipirona 500mg   [Baixar PDF]

┌──────────────────────────────────────────────────────────────┐
│  Documentos                                                    │
├──────────────────────────────────────────────────────────────┤
│  Dipirona 500mg          Finalizado    07/07/2026   [Baixar]   │
│  Soro Fisiológico 1L     Rascunho       28/06/2026   [Continuar]│
│  ...                                                            │
└──────────────────────────────────────────────────────────────┘
```

## De onde vêm os dados de cada etapa

| Bloco | Fonte |
|---|---|
| Previsão de demanda, quantidade estimada (Etapa 1) | Módulo de Insumos / Alertas, conforme origem do clique |
| Referência legal aplicável (Etapa 1) | Regra estática por tipo de compra (a validar juridicamente, conforme docs/02) |
| Dotação orçamentária, unidade requisitante (Etapa 2) | Input manual da secretaria — não existe fonte automática |
| Justificativa técnica (Etapa 3) | Geração via IA (Gemini, mesma integração do SusBot), a partir dos dados da Etapa 1 |
| Toast + entrada no histórico (Etapa 4) | Evento de conclusão do job de geração de PDF |

## O que NÃO entra nesta tela

| Removido | Motivo |
|---|---|
| ETP como aba de navegação principal | É ação contextual, não destino — decisão de [00-navegacao.md](./00-navegacao.md) |
| Geração direta sem revisão do texto | Risco jurídico — texto de IA sem revisão confirmada não pode virar documento oficial |
| Botão "marcar resolvido" ligado ao ETP | O ETP finalizado dispara toast e histórico, não um estado de alerta (ver [03-central-alertas.md](./03-central-alertas.md)) |

## Perguntas em aberto para aprovação

1. Um ETP "rascunho" (iniciado, não finalizado) deveria expirar/ser descartado depois de
   um tempo, ou fica indefinidamente no histórico até a gestora voltar e concluir?
2. A referência legal aplicável (Etapa 1) precisa de validação jurídica antes do MVP
   funcional, ou pode entrar como texto genérico/placeholder na demonstração, com aviso
   explícito de que não substitui parecer jurídico?
