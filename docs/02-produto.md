# SusPredict — Produto

## Persona principal

**Dra. Márcia Oliveira — Secretária Municipal de Saúde**
- Município: 50k–500k habitantes, interior de SP
- Formação: médica ou enfermeira, perfil administrativo
- Não tem equipe de analistas de dados
- Usa Excel e orientações genéricas do estado/Ministério para planejar compras
- Já enfrentou ruptura de medicamentos e teve que fazer compra emergencial
- Quer saber *o que fazer*, não só *o que está acontecendo*

**Usuário secundário — Farmacêutico Hospitalar / Coordenador de Farmácia**
- Operacionaliza as compras no dia a dia
- Sente a ruptura antes do gestor
- Precisa de previsão de consumo por medicamento, não por doença

---

## Fluxo core do produto

O único fluxo que precisa funcionar end-to-end no MVP:

```
1. Sistema baixa dados SINAN (dengue notificada por município)
2. Modelo Holt gera previsão de casos para 60-90 dias
3. Previsão é cruzada com estoque atual do município (upload CSV)
4. Sistema calcula: "medicamento X acaba em Y dias dado o surto previsto"
5. Alerta é gerado na Central de Alertas
6. Gestor clica "Gerar ETP" → PDF com justificativa técnica para licitação
```

Qualquer módulo que não pertença a esse fluxo é **visão de produto** (Figma), não código para o MVP.

---

## Módulos da plataforma

> **Nota:** a lista abaixo descreve os módulos em termos de produto/negócio. Para a
> especificação de tela (layout, camadas, hierarquia de navegação, fluxos entre telas),
> a fonte de verdade é [docs/telas/](./telas/README.md) — em especial
> [00-navegacao.md](./telas/00-navegacao.md), que reorganiza estes módulos em dois níveis
> de menu (operacional vs. análises) e remove Cobertura Vacinal da navegação do MVP.

### Visão Geral
Dashboard executivo com os principais indicadores do município. O gestor abre a plataforma e em 30 segundos sabe se está em risco ou não.

**Indicadores em destaque:**
- Casos notificados (30 dias) com variação vs. mês anterior
- Índice de Risco Regional (composto: epidemiológico + capacidade de leitos + estoque crítico + vacinação)
- Número de UBSs em ruptura ou alerta
- Gráfico de previsão de casos (dengue) para os próximos 6 meses
- Mapa de risco regional por município/região

**Ações disponíveis:** Ver alertas · Gerar ETP

---

### Epidemiologia SINAN
Análise descritiva e preditiva de doenças notificáveis com base no SINAN.

**Dados disponíveis:**
- Total de casos notificados, taxa de hospitalização, taxa de óbito, incidência por 100 mil hab.
- Sazonalidade mensal (ano atual vs. ano anterior vs. média 5 anos)
- Distribuição por cidade, faixa etária, gênero
- Desfecho clínico por ano (casos leves / hospitalizações / óbitos)
- Filtros: agravo/CID, período, cidade/região

**Doenças suportadas:** dengue, tuberculose, meningite e 24+ agravos notificáveis do SINAN.

---

### Internações SIH
Painel de internações hospitalares financiadas pelo SUS com base no SIH/AIH.

**Dados disponíveis:**
- Volume de internações, permanência média, taxa de reinternação em 30 dias, custo total SIH
- Internações × custo mensal (gráfico duplo-eixo)
- Principais grupos de causa (volume + custo médio)
- Permanência média por grupo diagnóstico
- Origem das AIH (Pronto-Socorro, Eletiva, Encaminhamento UBS, Transferência)
- Filtros: agravo/CID, período, hospital

**Caso de uso principal:** identificar quais diagnósticos estão gerando mais internações e custo, projetar demanda futura de leitos.

---

### Cobertura Vacinal — PNI
Monitoramento da cobertura vacinal por imunobiológico, faixa etária e UBS, com base nos dados do Programa Nacional de Imunizações.

**Dados disponíveis:**
- Cobertura ponderada, doses aplicadas, UBS abaixo da meta, estoque de doses disponível
- Cobertura por imunobiológico vs. meta do Ministério da Saúde
- Evolução mensal de doses aplicadas vs. meta operacional

**Status no MVP:** fora do escopo do ciclo atual. O PNI usa uma fonte de dados separada do DATASUS (API própria do Ministério da Saúde) e nenhum dos respondentes da pesquisa de campo citou cobertura vacinal como prioridade. Mantido nos protótipos Figma como módulo da visão completa do produto.

---

### Superlotação
Projeção de pressão hospitalar por unidade de saúde com base em tendência histórica de internações.

**Dados disponíveis:**
- Capacidade instalada por setor (CNES — baseline de leitos por UBS/hospital)
- Taxa de ocupação projetada com base na tendência de internações do SIH + surto previsto pelo SINAN
- Lista de unidades com risco de superlotação no horizonte de 60-90 dias
- Filtros: região, UBS, setor (UTI / Enfermaria / Pronto-Socorro)

**Decisão de design (importante):** este módulo **não é "tempo real"**. O CNES não publica ocupação em tempo real — é atualizado periodicamente. O valor do módulo está na **projeção**: dado o surto previsto de dengue, as internações históricas do SIH e a capacidade instalada do CNES, qual unidade vai saturar primeiro? Apresentar como "real-time" seria enganoso; "projeção baseada em dados históricos" é honesto e igualmente útil.

**Status no MVP:** demonstrado no Figma. Não priorizado para implementação no ciclo atual — requer cruzamento SINAN+SIH+CNES que pode ser adicionado na Fase 1 após o fluxo core estar funcionando.

---

### Ruptura de Insumos
Painel de abastecimento de medicamentos e insumos com previsão de esgotamento e indicações de compra.

**Dados disponíveis:**
- Lista de medicamentos com estoque atual, consumo médio, dias restantes e status (crítico/alerta/ok)
- Indicações de compra geradas pelo sistema (quantidade, custo estimado, prazo)
- Gráfico de projeção de estoque vs. consumo previsto para as próximas 20 semanas
- Top consumo por setor (UTI, Enfermaria, etc.)
- Botão **Gerar ETP Automático**

**Fontes de dado de estoque:** input manual pelo gestor, upload de planilha (Excel/CSV), ou integração via API com sistema local de gestão de estoque da UBS.

**Nota de implementação:** este é o módulo mais dependente de dados locais. O DATASUS não publica estoque de medicamentos — o dado de entrada precisa vir da secretaria. A previsão de *consumo* é gerada a partir dos dados epidemiológicos (quantos casos → quantos insumos necessários por protocolo clínico).

---

### Central de Alertas
Centralizador de todos os alertas gerados pela plataforma, com origem, evidência e ação direta.

**Tipos de alerta:**
- Possível surto de dengue nos próximos 60 dias (SINAN — probabilidade e confiança)
- Ruptura iminente de medicamento (dias de cobertura restante, consumo acelerado)
- Ocupação de UTI acima de threshold configurado
- Campanha vacinal próxima do vencimento de doses
- ETP finalizado e disponível para download

**Ações por alerta:** Ver detalhes · Abrir Simulação · Gerar ETP · Transferir Estoque · Acionar Plano · Ver Casos · Ver Cronograma · Baixar PDF

---

### SusBot — Módulo Conversacional
Pilar obrigatório da solução. Assistente de IA integrado ao dashboard que permite ao gestor interagir com os dados em linguagem natural — sem precisar de analista de dados.

**Exemplos de perguntas:**
- "Quanto tempo meu estoque de soro aguenta com o surto previsto para fevereiro?"
- "Quais municípios da minha regional estão em alerta vermelho para dengue?"
- "O que significa índice de risco 72%?"
- "Como a previsão é calculada?"
- "Gera um resumo da situação para eu apresentar na reunião de segunda."

**Plano de implementação em duas fases:**

**Fase 1 — MVP (Gemini insights textuais):**
Integração direta com a API do Gemini para gerar automaticamente 3-4 linhas de análise contextualizada no dashboard — sem LangGraph, sem arquitetura agente. Exemplo de output: *"O município está em tendência de alta de dengue (+18% vs. mês anterior). Com o surto previsto para março, o estoque atual de Dipirona 500mg se esgota em 22 dias. Recomendamos iniciar processo licitatório esta semana."* Essa fase é implementável rapidamente e já constitui o SusBot para fins de demonstração.

**Fase 2 — Produção (LangGraph completo):**
Agente conversacional com memória de contexto, roteamento de intenções e integração com todas as fontes de dados da plataforma (SINAN, SIH, CNES, estoque local). Acessível via dashboard e, futuramente, via WhatsApp Business API.

**Status:** Fase 1 (Gemini) — a implementar. Fase 2 (LangGraph) — planejado pós-MVP.

---

### Gerador de ETP
Gera automaticamente o Estudo Técnico Preliminar exigido pela Lei 14.133/2021 para abertura de processo licitatório.

**Fluxo:**
1. Sistema detecta necessidade de compra (insumo entrando em zona de alerta)
2. Gestor aciona "Gerar ETP" (no dashboard principal ou na Central de Alertas)
3. Modal solicita informações complementares (dotação orçamentária, unidade requisitante, etc.)
4. Sistema gera PDF com: previsão de demanda, estimativa de quantidade, referência legal, justificativa técnica

**Status:** demonstração de conceito — geração do PDF não implementada. A estrutura do documento foi validada conceitualmente com a Lei 14.133/2021. Validação jurídica formal é etapa necessária antes da produção.

---

## Priorização — o que construir, o que mostrar no Figma, o que defer

### Construir agora (fluxo core)

| Funcionalidade | Estado atual | Ação |
|---|---|---|
| Download e processamento DATASUS (PySUS) | **Funcional** | Manter |
| Modelos preditivos Holt/OLS + detecção de surtos | **Funcional** | Manter |
| API REST FastAPI | **Funcional** | Conectar ao novo frontend |
| Pipeline ETL Databricks/PySpark (Gabriel) | Em desenvolvimento | Continuar |
| Ruptura de Insumos — upload CSV + cálculo de dias | Vazio | **Implementar — prioridade máxima** |
| Central de Alertas — 3 tipos reais (surto / ruptura / ocupação) | Protótipo | **Implementar** |
| Gerador de ETP — PDF com dado real | Conceito | **Implementar** |
| SusBot Fase 1 — Gemini insights textuais no dashboard | Não iniciado | **Implementar** |
| Visão Geral — KPIs SINAN + SIH conectados | Não integrado | **Implementar** |

### Mostrar no Figma (visão do produto — não codificar agora)

| Módulo | Por quê Figma é suficiente |
|---|---|
| Epidemiologia SINAN (tela dedicada) | Backend tem os dados; integração vem depois do core |
| Internações SIH (tela dedicada) | Idem |
| Superlotação (projeção, não real-time) | Requer cruzamento SINAN+SIH+CNES — Fase 1 pós-MVP |
| SusBot Fase 2 — LangGraph completo | Demonstrado como visão; Fase 1 (Gemini) já cobre o MVP |
| Mapa regional de risco | Substituir por ranking em barra no MVP; mapa no Figma |

### Deferir (fora do MVP)

| Feature | Motivo |
|---|---|
| Cobertura Vacinal (PNI) | Fonte separada, não core de supply chain, não citada na pesquisa |
| WhatsApp Business API | Risco jurídico municipal, verificação de empresa complexa |
| Visão Estadual (multi-município) | Plano Estadual — feature de escala, não de MVP |
| Autenticação JWT + RBAC completa | Necessária para produção; para demo basta auth básica |

---

## Roadmap

**MVP (ciclo atual):** fluxo core funcionando end-to-end — SINAN → previsão → ruptura → alerta → ETP. SusBot Fase 1 (Gemini). Visão Geral com dados reais. Demo: Figma para visão completa + backend ao vivo para o fluxo core.

**Fase 1 pós-TCC:** conectar telas de SINAN e SIH dedicadas ao backend; Superlotação com projeção histórica; piloto com 1-2 municípios SP; autenticação JWT completa.

**Fase 2:** SusBot completo via LangGraph; gerador de ETP com validação jurídica; WhatsApp Business API; módulo Estadual.

**Fase 3:** expansão MG; certificação SBIS; integração RNDS.
