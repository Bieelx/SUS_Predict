# SusPredict - briefing completo para apresentacao da banca

> Material-base para um agente de IA montar slides. Versao consolidada em 01/09/2026.

## 1. Resumo executivo

O SusPredict e uma plataforma academica de apoio a decisao para gestores de saude publica. Sua proposta e transformar dados epidemiologicos, hospitalares e sinais de aquisicao em uma leitura clara de risco, prioridade e proxima acao. Em vez de apenas exibir graficos, o produto procura responder: **o que esta acontecendo, por que importa, onde agir e qual evidencia sustenta essa decisao?**

O recorte mais forte para a banca e dengue e planejamento de insumos. A plataforma organiza dados do SINAN, SIH e tabelas curadas de compras publicas; apresenta visoes executivas e analiticas; centraliza alertas; oferece uma demo historica; permite conversar com a Clara; e conduz um alerta de insumo ate um rascunho de ETP com revisao humana.

**Frase de posicionamento:** SusPredict transforma sinais dispersos do SUS em antecedencia para decisoes de saude e compras publicas.

**Mensagem de honestidade:** a solucao apoia a decisao; nao substitui o gestor, o profissional de saude, a validacao juridica ou os sistemas oficiais.

## 2. Problema e oportunidade

Secretarias municipais precisam combinar informacoes que normalmente vivem separadas: notificacoes epidemiologicas, internacoes, aquisicoes, estoque local e prazos administrativos. Sem essa conexao, a leitura tende a ser reativa: percebe-se a pressao quando a demanda ja cresceu ou quando o insumo ja entrou em situacao critica.

O SusPredict procura reduzir esse intervalo entre o sinal e a acao. Seu diferencial nao e “ter IA” nem “ter um dashboard”; e organizar evidencias para que uma gestora nao especialista consiga compreender rapidamente a situacao, investigar a origem e iniciar uma resposta documentada.

### Publico principal

- Gestores e tecnicos de secretarias municipais e estaduais de saude.
- Epidemiologistas e equipes de vigilancia.
- Coordenadores de farmacia e profissionais envolvidos em aquisicoes.
- Pesquisadores e estudantes que precisam analisar e comunicar dados publicos de saude.

## 3. Proposta de valor

O produto une quatro capacidades em uma mesma jornada:

1. **Observar:** reunir indicadores epidemiologicos e hospitalares com fonte e competencia visiveis.
2. **Interpretar:** destacar tendencia, risco e limitacoes, evitando que o usuario precise interpretar sozinho varias tabelas.
3. **Priorizar:** transformar sinais em uma fila de alertas e itens que exigem atencao.
4. **Agir com revisao:** levar um alerta de insumo a um rascunho de ETP, sempre com confirmacao humana.

## 4. Jornada principal demonstravel

1. O usuario entra no ambiente autenticado e escolhe o municipio.
2. A Visao Geral apresenta a sintese do territorio, com fonte, competencia e comparativos.
3. O usuario aprofunda a analise em Epidemiologia, Internacoes, Vacinacao, Insumos ou Alertas.
4. A Central de Alertas prioriza sinais de risco de aquisicao por insumo.
5. A Clara explica o contexto usando ferramentas de consulta e aponta a tela relacionada.
6. Quando existe uma acao de escrita, o sistema exige confirmacao explicita.
7. O Gerador de ETP traz dados de origem, pede informacoes da secretaria e exige revisao do texto.
8. O documento pode ser baixado como PDF e aparece no historico da sessao.

## 5. O que esta implementado hoje

### Experiencia web

- Aplicacao responsiva com login, navegacao por tarefas, estados de carregamento e mensagens honestas quando a fonte esta indisponivel.
- Seletor de municipio compartilhado entre as telas municipais.
- Separacao visual entre ambiente real e demonstracao historica.
- Visao Geral, Alertas, Insumos, Documentos, Epidemiologia, Internacoes, Vacinacao, Configuracoes e Perfil.

### Dados e analises

- Endpoints autenticados para Visao Geral, Epidemiologia, Internacoes, Vacinacao e risco de aquisicao/ruptura.
- Visao Geral baseada em tabelas curadas, com KPIs, serie temporal, risco agregado, evolucao de casos, mapa/ranking regional, categorias de suprimento e alertas recentes.
- Epidemiologia municipal baseada em SINAN, com casos, incidencia, hospitalizacao, obito, perfil demografico, sazonalidade e previsao de tres meses quando a serie permite.
- Internacoes SIH apresentadas por estabelecimento/CNES e agregado estadual, coerentes com a granularidade real da fonte.
- Vacinacao contra dengue com ressalvas explicitas: serie curta, associacao nao causal e cruzamento hospitalar estadual.
- Insumos e Alertas apresentados como **risco de aquisicao**, nao como estoque fisico ou dias reais de cobertura quando esses dados locais nao existem.

### Clara

- Assistente conversacional integrado ao painel, com historico, contexto de tela e referencias de navegacao.
- Rotas deterministicas para perguntas operacionais de alta confianca e uso de modelo local/alternativo para linguagem natural.
- Ferramentas para consultar epidemiologia, estoque cadastrado, alertas e outros dados permitidos.
- Confirmacao obrigatoria antes de ferramentas que alteram estado.
- Pareamento com Telegram, continuidade de historico e suporte a audio com transcricao local quando o runtime e o modelo estao configurados.

### Demo historica e ETP

- Replay historico de dengue 2024, separado do modo real.
- Casos historicos reais; estoque, precos e economia sao um cenario demonstrativo ficticio e identificado como tal.
- Linha do tempo que evidencia a passagem de sinal epidemiologico para risco operacional.
- Fluxo de ETP em quatro etapas: dados do sistema, dados da secretaria, revisao do texto e geracao.
- Revisao humana obrigatoria antes de finalizar e baixar o PDF.

### Validacao automatizada atual

- 130 testes Python aprovados em 01/09/2026.
- Build de producao do frontend aprovado em 01/09/2026.
- Isso comprova contratos e integridade automatizada; nao equivale, por si so, a validacao clinica, juridica, de seguranca em producao ou teste visual em todos os dispositivos.

## 6. O que o SusPredict nao faz

- Nao monitora estoque fisico em tempo real sem uma fonte local de estoque e consumo.
- Nao transforma compras publicas em saldo disponivel, consumo real ou dias de cobertura.
- Nao mede ocupacao hospitalar em tempo real; o SIH registra internacoes financiadas pelo SUS e o CNES descreve capacidade/cadastro, nao ocupacao instantanea.
- Nao corrige subnotificacao nem garante que todo registro de origem esteja correto.
- Nao comprova causalidade entre vacinacao e reducao de casos ou internacoes.
- Nao diagnostica pacientes, nao prescreve condutas clinicas e nao substitui protocolos de saude.
- Nao executa automaticamente compras, licitacoes ou outras decisoes administrativas.
- Nao produz um ETP juridicamente aprovado; gera um rascunho de apoio que exige revisao tecnica e juridica.
- Nao deve apresentar dados de demo como se fossem dados operacionais presentes.
- Nao oferece, nesta fase, maturidade completa de produto multi-tenant para uso municipal em larga escala.

## 7. O que ainda esta WIP ou depende de validacao

### Produto e dados

- Integracao real com estoque e consumo local de uma secretaria, incluindo unidades, dispensacao, pedidos em transito e prazo de compra.
- Validacao clinica e operacional da relacao entre crescimento de casos e consumo de cada insumo.
- Rotina completa de importacao CSV/XLSX com mapeamento, validacao, deduplicacao, previa e desfazer.
- Validacao de campo com municipios e acompanhamento de resultados reais.
- Avaliacao mais ampla da qualidade e atualidade de cada tabela curada.

### Funcionalidades

- Persistencia completa dos ETPs e rascunhos no backend; parte do historico atual vive na sessao do frontend.
- Workflow real de aprovacao, assinatura, versionamento e auditoria documental.
- Superlotacao/ocupacao hospitalar somente quando houver fonte verificavel; a tela operacional sem fonte foi retirada.
- Notificacoes externas completas e confiaveis, com operacao permanente dos webhooks e canais.
- Integracoes futuras com sistemas municipais, RNDS e outros canais dependem de governanca, seguranca e contratos.

### Clara e infraestrutura

- Avaliacao sistematica das respostas da Clara contra um conjunto de perguntas reais.
- Validacao ao vivo e recorrente do modelo local Ollama/Qwen no ambiente Ubuntu.
- Monitoramento, observabilidade, politica de retencao e controles de custo em escala.
- Isolamento multi-tenant forte: o municipio autorizado deve vir da sessao e de politicas de acesso, nao apenas do parametro enviado pelo cliente.
- Operacao permanente do Telegram exige webhook HTTPS ativo, segredos corretos e modelo de transcricao instalado.

### Producao, seguranca e conformidade

- Piloto supervisionado, avaliacao de seguranca, LGPD, ameacas e continuidade operacional.
- Auditoria formal de acessibilidade com tecnologias assistivas reais.
- Validacao juridica do conteudo e do fluxo de ETP.
- Definicao de responsabilidade, governanca dos dados, SLAs e suporte.

## 8. Leitura correta dos dados

- **SINAN:** notificacoes e investigacoes de agravos; reflete o que foi registrado e pode sofrer atraso ou subnotificacao.
- **SIH/SUS:** autorizacoes de internacao hospitalar financiadas pelo SUS; nao e censo de ocupacao em tempo real.
- **Compras publicas curadas:** evidenciam aquisicao e fornecedores; nao equivalem a estoque atual na unidade.
- **Estoque local:** quando cadastrado, permite calculos de saldo e cobertura, mas sua confiabilidade depende de atualizacao, unidade e consumo validos.
- **Demo historica:** usa casos historicos reais e premissas ficticias claramente rotuladas para estoque, precos e economia.

## 9. Diferenciais para enfatizar na banca

- Orientacao a decisao, nao apenas visualizacao.
- Conexao entre saude publica, abastecimento e processo administrativo.
- Transparencia entre dado real, simulacao, indisponibilidade e limitacao.
- Clara como interface de explicacao e convergencia entre web e Telegram, nao como fonte magica dos numeros.
- Confirmacao humana antes de qualquer acao com impacto.
- ETP como desfecho pratico da jornada, mantendo revisao obrigatoria.

## 10. Estrutura sugerida para os slides

1. **Titulo e tese:** “Do dado disperso a decisao antecipada”.
2. **Problema:** gestores reagem tarde porque dados e processos estao separados.
3. **Publico:** a gestora municipal que precisa decidir sem uma equipe grande de dados.
4. **Solucao:** uma jornada visual simples - observar, interpretar, priorizar e agir.
5. **Como funciona:** fluxo em linguagem de negocio, sem arquitetura tecnica.
6. **Demonstracao:** replay historico de dengue, do primeiro sinal ao momento de abrir o ETP.
7. **Clara:** explicar dados e manter continuidade entre canais, sempre com guardrails.
8. **Confianca:** fontes, competencia, limites, revisao humana e separacao real/demo.
9. **O que ja existe:** produto navegavel, dados operacionais, alertas, Clara, Telegram e ETP.
10. **Limites e WIP:** estoque local, validacao clinica/juridica, piloto e escala.
11. **Roadmap:** piloto municipal, integracoes e amadurecimento de governanca.
12. **Fechamento:** “Antecipar para planejar, em vez de reagir quando a crise ja chegou”.

### Regras para o agente que criar os slides

- Priorizar historia, problema, impacto e jornada; tecnologia entra apenas como prova de viabilidade.
- Usar uma ideia principal por slide e pouco texto.
- Nao abrir a apresentacao com stack, arquitetura, endpoints, banco ou nomes de modelos.
- Nao apresentar numeros de demo como resultados reais do produto.
- Nao dizer “tempo real” para DATASUS, SIH, CNES ou compras publicas.
- Nao afirmar que a plataforma evita uma compra, reduz custo ou preve ruptura real sem piloto validado.
- Identificar sempre: implementado, demo, validado localmente, dependente de infraestrutura ou roadmap.
- Preferir capturas da jornada e diagramas simples a tabelas densas.

## 11. Roteiro recomendado da demonstracao

**Frase obrigatoria:** “Os casos de dengue sao historicos reais; estoque, precos e economia sao um cenario demonstrativo ficticio.”

1. Abrir a demo historica em janeiro de 2024.
2. Avancar para fevereiro e mostrar a aceleracao epidemiologica.
3. Avancar para marco e mostrar que a janela operacional esta diminuindo.
4. Parar em abril, destacar o item critico, o mes estimado de ruptura e a acao sugerida.
5. Abrir o Gerador de ETP, mostrar os dados de origem e a revisao humana obrigatoria.
6. Gerar o documento e abrir o historico.

O objetivo nao e explicar cada grafico. E provar que o sistema liga sinal, prioridade, evidencia e acao.

## 12. Perguntas provaveis da banca

**De onde vem o dado?** SINAN para notificacoes; SIH para internacoes financiadas pelo SUS; tabelas curadas de compras para sinais de aquisicao; e dados locais quando cadastrados. Cada tela deve mostrar fonte e competencia.

**A previsao garante que vai faltar medicamento?** Nao. Sem estoque e consumo locais atualizados, o sistema apresenta risco de aquisicao, nao ruptura fisica. A previsao e apoio a decisao, com incerteza e revisao humana.

**Qual e o papel da IA?** A Clara explica, resume, navega e prepara textos. Os numeros operacionais devem vir das fontes e dos calculos; a IA nao deve inventar indicadores nem executar acoes sem confirmacao.

**O ETP ja pode ser usado oficialmente?** Ele e um rascunho contextual para acelerar o trabalho. Precisa de revisao tecnica, juridica e adequacao ao processo do orgao.

**O sistema esta pronto para producao?** Nao. E um MVP academico funcional e demonstravel. Producao exige piloto, dados locais, isolamento entre clientes, seguranca, governanca, observabilidade e validacoes clinica e juridica.

**Qual o principal proximo passo?** Pilotar com uma secretaria que forneca estoque e consumo reais, validar os coeficientes e medir se a antecedencia gerada melhora o planejamento.

## 13. Roadmap recomendado

- **Curto prazo:** consolidar a demo da banca, corrigir integracoes operacionais e documentar cada fonte.
- **Piloto:** integrar estoque/consumo real de um municipio e validar alertas com usuarios responsaveis.
- **Produto:** persistir documentos e workflows, fortalecer isolamento de dados e operacao dos canais.
- **Escala:** integrar sistemas municipais e expandir territorios somente depois da validacao do piloto.

## 14. Fontes

### Fontes oficiais externas

1. DATASUS - Informacoes de Saude (TABNET): https://datasus.saude.gov.br/informacoes-de-saude-tabnet/
2. Portal de Dados Abertos do SUS - SINAN/Dengue: https://dadosabertos.saude.gov.br/dataset/arboviroses-dengue
3. Portal SINAN - descricao do sistema: https://www.portalsinan.saude.gov.br/
4. DATASUS - Sistema de Informacoes Hospitalares (SIH/SUS): https://siab.datasus.gov.br/DATASUS/index.php?area=060502
5. Ministerio da Saude - Transparencia dos dados SIH/SIA: https://www.gov.br/saude/pt-br/acesso-a-informacao/sic/dados-em-transparencia-ativa/saes
6. Lei 14.133/2021, especialmente art. 18 sobre fase preparatoria e ETP: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm
7. Ministerio da Saude - Observatorio de Arboviroses: https://www.gov.br/saude/pt-br/composicao/svsa/cnie/observatorio-de-arboviroses

### Fontes internas do projeto

- `PRODUCT.md` - proposito, usuarios e principios do produto.
- `docs/01-visao-geral.md` e `docs/02-produto.md` - problema, persona, proposta e roadmap original.
- `docs/04-qualidade-dados.md` - limites e tratamentos das bases.
- `.md/AUDITORIA_PRODUTO_UX.md` - auditoria de escopo, confianca, acessibilidade e lacunas.
- `docs/06-agente-clara.md` e `docs/documentacao/API_TELEGRAM.md` - Clara, ferramentas, confirmacao e convergencia de canais.
- `docs/superpowers/demo-roteiro-2min-crise-historica-dengue.md` - roteiro da demo historica.
- Codigo atual em `api/` e `frontend/src/` - fonte de verdade do que esta implementado nesta versao.
