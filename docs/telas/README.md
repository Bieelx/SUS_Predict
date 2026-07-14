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
| [01-visao-geral.md](./01-visao-geral.md) | Tela inicial — briefing de risco do município | PROPOSTO |
| [02-ruptura-insumos.md](./02-ruptura-insumos.md) | Estoque, previsão de consumo e CRUD de dados de origem | PROPOSTO |
| [03-central-alertas.md](./03-central-alertas.md) | Triagem de alertas, fluxo de estados, ETP como notificação | PROPOSTO |
| [04-gerador-etp.md](./04-gerador-etp.md) | Fluxo contextual de geração de ETP, revisão obrigatória, histórico | PROPOSTO |
| [05-casos-de-uso-e-testes.md](./05-casos-de-uso-e-testes.md) | Auditoria de consistência entre telas — casos de uso, cenários, testes | PROPOSTO |
| [06-analises-nivel2.md](./06-analises-nivel2.md) | Epidemiologia, Internações, Superlotação — template comum + especialização | PROPOSTO |
| [07-pontos-em-aberto.md](./07-pontos-em-aberto.md) | Telas ainda não desenhadas (SusBot painel, Cadastro de Unidades, utilitárias) | PARA VALIDAR |
| [08-painel-susbot.md](./08-painel-susbot.md) | Painel de conversa do SusBot — layout, histórico, formato de resposta | PROPOSTO |

## Referência cruzada

- Análise de dados — o que já existe, o que falta por tela, achado crítico do PySUS: [../05-analise-dados.md](../05-analise-dados.md)
- Fluxo core do MVP e prioridades: [../README.md](../README.md)
- Módulos, persona e roadmap: [../02-produto.md](../02-produto.md)
- Endpoints e modelos preditivos disponíveis hoje: [../03-arquitetura.md](../03-arquitetura.md)
- Limitações e tratamento dos dados do DATASUS: [../04-qualidade-dados.md](../04-qualidade-dados.md)
- Arquitetura do agente SusBot (backend do painel de chat): [../06-agente-susbot.md](../06-agente-susbot.md)
