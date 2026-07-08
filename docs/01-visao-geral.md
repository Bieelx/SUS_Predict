# SusPredict — Visão Geral e Mercado

## O problema

O Sistema Único de Saúde atende mais de 160 milhões de brasileiros que dependem exclusivamente da rede pública. A infraestrutura de gestão de insumos, porém, opera em modo essencialmente **reativo**: compra-se quando o estoque acaba, licita-se quando a crise já chegou.

As consequências são mensuráveis:

- Compras emergenciais por dispensa de licitação custam **30% a 40% mais** do que aquisições planejadas
- Em 2024 o Brasil registrou **6,9 milhões de casos de dengue** — recorde histórico — sobrecarregando secretarias que não haviam previsto demanda suficiente de soros, kits de hidratação e repelentes
- O SUS descartou **R$ 2,2 bilhões em medicamentos** desde 2019 (CGU/TCU)
- O rito padrão da Lei 14.133/2021 exige **30 a 90 dias** para conclusão de um processo licitatório, tornando a antecipação de 60-90 dias operacionalmente necessária

### O que a pesquisa de campo confirmou

Pesquisa conduzida com 10 profissionais de secretarias municipais de saúde paulistas (gestores e farmacêuticos hospitalares):

| Indicador | Resultado |
|---|---|
| Enfrentaram falta de medicamentos nos últimos 2 anos | **100%** |
| Com frequência superior a 3 vezes | **90%** |
| Não usam software específico para planejamento | **90%** |
| Têm acesso precário ou nulo ao DATASUS | **100%** |
| Respondem ao desabastecimento com compra emergencial | **70%** |
| Avaliariam a plataforma como "muito útil" (previsão 60-90 dias) | **90%** (média 4,9/5,0) |
| Propensão alta à adoção digital | **80%** |

**Hipótese invalidada pela pesquisa (H6):** alertas epidemiológicos *não* são a funcionalidade mais valorizada. A dor central é a **previsão de consumo de insumos** para planejamento de compras — citada por 50% como prioridade máxima, contra 20% para alertas de surto.

O gestor não teme não saber que a dengue chegou. Teme chegar à crise sem estoque e ter que pagar 40% a mais.

---

## A proposta de valor

> **SusPredict dá às secretarias municipais 60-90 dias de antecedência para planejar compras e evitar o sobrepreço das emergências — usando os dados do SUS que já existem mas que nenhuma equipe municipal consegue processar sozinha.**

A dengue é o **sinal**. A licitação planejada é o **resultado**.

### Os três pilares

1. **Previsão de demanda acoplada a dados epidemiológicos** — não apenas consumo histórico, mas projeção que incorpora sazonalidade e tendências de notificação (SINAN) para antecipar surtos e seu impacto nos insumos com 60-90 dias de antecedência.

2. **Inteligência como serviço para quem não tem analista** — 85% dos municípios brasileiros (pequeno e médio porte) não possuem equipe técnica de dados. O secretário, frequentemente médico ou enfermeiro por formação, não consegue cruzar SINAN, SIH e CNES. O SusPredict substitui esse analista.

3. **Geração automatizada do ETP** — o Estudo Técnico Preliminar exigido pela Lei 14.133/2021 para abertura de licitação é gerado automaticamente a partir das previsões, reduzindo de dias para minutos um trabalho hoje feito manualmente.

---

## Mercado

### TAM / SAM / SOM

| Segmento | Escopo | Estimativa |
|---|---|---|
| TAM | Healthtech Brasil — saúde digital total | USD 6,35 bi (~R$ 32 bi) |
| SAM | 559 municípios SP+MG, 50k–500k hab. | R$ 67 mi/ano |
| SAM Regional | SP + MG — fase 1 de expansão | R$ 22 mi/ano |
| SOM Ano 1 | 5–8 municípios SP (MVP dengue) | R$ 480k–R$ 768k ARR |
| SOM Ano 3 | 35–50 municípios SP + MG | R$ 5,0mi–R$ 7,2mi ARR |

Vetores macroeconômicos favoráveis: epidemia recorde de dengue (2024-2025); programa SUS Digital (R$ 454 milhões); RNDS institucionalizada por Decreto 12.560/2025 com 2,8 bilhões de registros; fundo BNDES+Finep+Butantan de R$ 200 milhões para startups de saúde; recomendação explícita da CGU de substituir o Sismat por ferramentas com IA.

### Análise competitiva

Nenhum concorrente relevante ocupa o nicho exato do SusPredict:

| Concorrente | Foco | Lacuna frente ao SusPredict |
|---|---|---|
| Bionexo | Marketplace hospitalar privado, R$ 12 bi/ano | Não integra SINAN, sem foco em secretarias municipais, sem ETP |
| Dhauz | Analytics para hospitais privados | Sem dados SUS, sem modelo B2G |
| Laura | IA clínica para sepse, 150+ municípios | Risco clínico individual, não previsão de demanda de insumos |
| MV Sistemas | ERP hospitalar, 5.000+ instituições | BI descritivo, sem previsão epidemiológica ou documentos licitatórios |
| Salux | ERP hospitalar SUS/filantrópicos | BI descritivo, sem previsão ou ETP |
| Tasy (Bionexo) | ERP hospitalar, 2.000+ instituições | Mesmas limitações de ERP |
| Substitutos informais | Excel, e-SUS APS, orientações do MS | Sem predição, sem integração, sem ETP |

**Posicionamento — Oceano Azul:** SusPredict opera na interseção de três domínios hoje desconectados — vigilância epidemiológica, logística de insumos e gestão pública municipal (licitações). Nenhum competidor relevante ocupa esse espaço.

### Modelo de negócio

| Plano | Público-alvo | Preço mensal | Funcionalidades |
|---|---|---|---|
| Básico | Municípios 50k–100k hab. | R$ 2.000–3.000 | Dashboard + alertas automáticos |
| Avançado | Municípios 100k–500k hab. | R$ 5.000–12.000 | Simulador + relatórios para licitação + suporte |
| Estadual | Secretarias estaduais | R$ 25.000 | Visão consolidada de todos os municípios do estado |

**Principal barreira de adoção identificada:** aprovação política/jurídica (30%), não orçamento. A estratégia de entrada via pilotos gratuitos e contratos via Lei 14.133/2021 (CPSI — dispensa para startups inovadoras) reduz essa fricção.

---

## Marco regulatório relevante

- **LGPD (Lei 13.709/2018):** SusPredict opera exclusivamente com dados epidemiológicos públicos e agregados — nenhum dado de paciente identificado é processado
- **Lei 14.133/2021:** regulamenta o ETP e permite contratos de TI por até 15 anos; o CPSI viabiliza contratação de startups sem licitação formal
- **RNDS (Decreto 12.560/2025):** plataforma oficial de interoperabilidade do Ministério da Saúde, com 2,8 bilhões de registros — abre caminho para integração futura além do DATASUS
- **Programa Previne Brasil:** vincula repasses federais a indicadores de desempenho, criando incentivo direto para municípios adotarem ferramentas de gestão baseadas em dados
