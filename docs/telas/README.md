# SusPredict — Redesign de Telas

Esta pasta documenta a proposta de redesenho da interface do SusPredict, partindo do
princípio discutido com o grupo: o produto não deve se comportar como uma ferramenta de
BI que "mostra gráfico" — deve se comportar como um **briefing de decisão** para uma
gestora que não é analista de dados (ver persona Dra. Márcia em
[../02-produto.md](../02-produto.md)).

Cada arquivo aqui representa **uma tela** (ou um elemento estrutural, como o menu), com a
visão proposta, o raciocínio por trás e o que fica de fora. Nada neste diretório está
implementado — é material de alinhamento antes de mexer em código ou Figma.

## Como usar

Revisar um arquivo por vez, na ordem numérica. Cada um termina com um status:

- `PROPOSTO` — aguardando aprovação/ajuste
- `APROVADO` — validado, pode virar Figma/código
- `REVISAR` — aprovado com ressalvas, precisa de nova rodada

## Índice

| Arquivo | Conteúdo | Status |
|---|---|---|
| [00-navegacao.md](./00-navegacao.md) | Estrutura do menu principal, hierarquia de telas | PROPOSTO |
| [01-visao-geral.md](./01-visao-geral.md) | Tela inicial — briefing de risco do município, fila de decisões pura (sem gráfico/ranking) | APROVADO |
| [02-ruptura-insumos.md](./02-ruptura-insumos.md) | Insumos — **mudou**: compras per capita em vez de estoque em tempo real | REVISAR |
| [03-central-alertas.md](./03-central-alertas.md) | Triagem de alertas, fluxo de estados, ETP como notificação | PROPOSTO |
| [04-gerador-etp.md](./04-gerador-etp.md) | Fluxo contextual de geração de ETP, revisão obrigatória, histórico | PROPOSTO |
| [05-casos-de-uso-e-testes.md](./05-casos-de-uso-e-testes.md) | Auditoria de consistência entre telas — casos de uso, cenários, testes | PROPOSTO |
| [06-analises-nivel2.md](./06-analises-nivel2.md) | Epidemiologia, Internações, Superlotação — template comum + especialização | PROPOSTO |
| [07-pontos-em-aberto.md](./07-pontos-em-aberto.md) | Telas ainda não desenhadas (Clara painel, Cadastro de Unidades, utilitárias) | PARA VALIDAR |
| [08-painel-clara.md](./08-painel-clara.md) | Painel de conversa da Clara — layout, histórico, formato de resposta | PROPOSTO |
| [09-modo-simulacao.md](./09-modo-simulacao.md) | Modo Simulação — replay COVID-19 (2020) com dado real; **bloqueado** por granularidade anual da série | PROPOSTO |

## Reunião de 29/07/2026 — mudanças de rumo

| Decisão | Onde ficou |
|---|---|
| Insumos não rastreia estoque em tempo real — vira compras/dispensação × população (resp. Yasmin); dado do DATASUS tem defasagem de meses | [02-ruptura-insumos.md](./02-ruptura-insumos.md) |
| Vacinação volta ao produto, mas só cruzada com incidência de doença — recorte dentro de Epidemiologia, não item de menu | [00-navegacao.md](./00-navegacao.md), [06-analises-nivel2.md](./06-analises-nivel2.md) |
| Botão de simulação de "pandemia" de dengue, para mostrar a plataforma num problema real | [09-modo-simulacao.md](./09-modo-simulacao.md) |

## Referência cruzada

- Análise de dados — o que já existe, o que falta por tela, achado crítico do PySUS: [../05-analise-dados.md](../05-analise-dados.md)
- Fluxo core do MVP e prioridades: [../README.md](../README.md)
- Módulos, persona e roadmap: [../02-produto.md](../02-produto.md)
- Endpoints e modelos preditivos disponíveis hoje: [../03-arquitetura.md](../03-arquitetura.md)
- Limitações e tratamento dos dados do DATASUS: [../04-qualidade-dados.md](../04-qualidade-dados.md)
- Arquitetura do agente Clara (backend do painel de chat): [../06-agente-clara.md](../06-agente-clara.md)
