# SusPredict — Documentação

Documentação técnica e de produto do SusPredict, plataforma SaaS de inteligência preditiva para secretarias municipais de saúde.

## Índice

| Documento | Conteúdo |
|---|---|
| [01 — Visão Geral e Mercado](./01-visao-geral.md) | Problema validado, proposta de valor, pesquisa de campo, mercado |
| [02 — Produto](./02-produto.md) | Módulos, persona, casos de uso, MVP vs. visão |
| [03 — Arquitetura Técnica](./03-arquitetura.md) | Stack, pipeline de dados, backend, frontend, AWS |
| [04 — Qualidade de Dados](./04-qualidade-dados.md) | Problemas conhecidos do DATASUS, camadas de tratamento, limitações |
| [telas/ — Redesenho de telas](./telas/README.md) | **Fonte de verdade atual para o frontend** — telas desenhadas, validadas e testadas uma a uma (Visão Geral, Insumos, Alertas, ETP, Análises nível 2), substituindo o protótipo mock existente em `App.jsx` |
| [05 — Análise de Dados](./05-analise-dados.md) | O que já existe por tela, o que falta, achado crítico (PySUS quebrado no ambiente atual) |
| [06 — Arquitetura do Agente SusBot](./06-agente-susbot.md) | Ferramentas híbridas (parametrizadas + SQL controlado), LangGraph + Gemini, tabelas novas de estoque/alertas, risco de isolamento multi-tenant aceito nesta fase |
| [07 — Briefing de Implementação do Chatbot](./07-briefing-implementacao-chatbot.md) | Insumo para a próxima sessão de brainstorming — gaps de schema, dependências, contrato de endpoint e testes antes de codar o SusBot |

## Foco do MVP — fluxo prioritário

O único fluxo que precisa funcionar de ponta a ponta na apresentação final:

```
Dado real SINAN/SIH → previsão (Holt) → alerta de ruptura de insumos → Gerador de ETP (PDF)
```

Tudo o mais é visão de produto demonstrada no Figma, não código.

## Status do projeto (julho 2026)

### Prioridade alta — construir agora

| Camada | Status | Próxima ação |
|---|---|---|
| Backend FastAPI + predição | Funcional | Conectar ao novo frontend |
| Módulo Ruptura de Insumos | Desenhado ([docs/telas/02](./telas/02-ruptura-insumos.md)) | Implementar: upload CSV/CRUD de estoque → cálculo dias restantes → alerta |
| Gerador de ETP | Desenhado ([docs/telas/04](./telas/04-gerador-etp.md)) | Implementar: fluxo contextual em 4 etapas com revisão obrigatória |
| Central de Alertas (3 tipos) | Desenhado ([docs/telas/03](./telas/03-central-alertas.md)) | Implementar fluxo de estados (Novo → Em andamento → Resolvido) no frontend + backend |
| SusBot (pilar obrigatório) | Desenhado (texto automático: [docs/telas/01](./telas/01-visao-geral.md), Camada 2; painel de chat: [docs/telas/08](./telas/08-painel-susbot.md); agente/backend: [docs/06](./06-agente-susbot.md)) | Implementar: texto automático (Gemini) + painel de conversa com agente LangGraph, ferramentas de estoque/epidemiologia/alertas |
| Visão Geral dashboard | Redesenhado ([docs/telas/01](./telas/01-visao-geral.md)) | Implementar do zero — o protótipo mock atual (`App.jsx`) não será reaproveitado (era BI descritivo: 4 KPIs + mapa hexagonal, sem hierarquia de decisão) |

### Prioridade média — mostrar no Figma, não codificar agora

| Módulo | Decisão | Motivo |
|---|---|---|
| Epidemiologia SINAN (tela dedicada) | Desenhada ([docs/telas/06](./telas/06-analises-nivel2.md)) | Backend já tem dados; conectar após MVP core |
| Internações SIH (tela dedicada) | Desenhada ([docs/telas/06](./telas/06-analises-nivel2.md)) | Idem — falta tabela de custo por procedimento (a debater) |
| Superlotação | Desenhada ([docs/telas/06](./telas/06-analises-nivel2.md)) | Reframed: projeção histórica SIH, não "tempo real"; cruzamento SINAN+SIH+CNES ainda não implementado |

### Fora do MVP — deferir

| Feature | Motivo |
|---|---|
| Cobertura Vacinal (PNI) | Fonte separada, fora do core de supply chain |
| WhatsApp Business API | Risco jurídico municipal, complexidade alta |
| Mapa hexagonal regional | Substituir por ranking em barra |
| Visão Estadual (multi-município) | Plano Estadual — fase de escala, não MVP |

## Como rodar

```bash
# Tudo junto
bash start_dev.sh

# Backend separado (requer Python 3.12 + venv)
source venv/bin/activate
uvicorn api.main:app --reload --port 8000

# Frontend separado
cd frontend && npm install && npm run dev
```

URLs locais: frontend `http://localhost:3000` · API `http://localhost:8000` · Swagger `http://localhost:8000/docs`
