# Como a Inteligência Artificial é utilizada na Clara

**Projeto:** SusPredict  
**Componente:** Clara  
**Finalidade:** projeto acadêmico para demonstrações e testes  
**Estado analisado:** código atual do repositório em 30/08/2026

## 1. Visão geral

A Clara é um assistente conversacional voltado ao apoio da gestão municipal de saúde. Ele combina três mecanismos:

1. **Regras determinísticas locais**, para reconhecer perguntas operacionais conhecidas;
2. **Ferramentas controladas**, para consultar dados do SusPredict e executar ações permitidas;
3. **Modelo de linguagem (LLM)**, para compreender perguntas livres, planejar qual ferramenta usar e redigir respostas quando uma saída fixa não é suficiente.

Portanto, a Clara não envia todas as mensagens para uma IA generativa. Sempre que a pergunta pode ser resolvida com segurança por regras e dados estruturados, a resposta é produzida sem LLM. Essa arquitetura reduz custo e latência e diminui o risco de alucinação.

O SusPredict é **somente um projeto de faculdade**. O sistema foi desenvolvido para aprendizagem, apresentação, demonstração de conceito e testes controlados. Ele não é um produto oficial do SUS, não está homologado para uso em serviços de saúde e não deve orientar sozinho decisões clínicas, epidemiológicas, administrativas ou de compras públicas.

## 2. Quando a IA é utilizada

A IA generativa é usada em dois momentos possíveis.

### 2.1 Planejamento de perguntas livres ou ambíguas

Quando o roteador local não identifica uma intenção operacional com alta confiança, o LLM recebe:

- a pergunta do usuário;
- o município da conversa (`ibge6`);
- a tela de origem;
- até oito interações recentes;
- a memória pessoal permitida para aquele usuário;
- a lista e os parâmetros das ferramentas disponíveis.

O modelo devolve um plano em JSON com uma de três ações:

- `chamar_ferramenta`: a pergunta exige dados do município ou informação sobre o próprio sistema (`sobre_o_projeto`);
- `responder`: apenas para reformular ou esclarecer algo já dito nesta conversa, nunca para trazer conhecimento novo;
- `fora_do_escopo`: todo o resto (medicina, farmacologia, química, política, programação, conversa social...).

O plano de qualquer provedor (Ollama local, Gemini ou Groq) passa por `ClaraAgent.validar_plano`, que rebaixa para `fora_do_escopo` ação ou ferramenta fora do enum, ignora `ferramenta` quando a ação não é `chamar_ferramenta` e rebaixa `responder` quando não há histórico na conversa. Todo rebaixamento é logado com o provedor de origem. Quando o plano final é `fora_do_escopo`, o backend devolve `MENSAGEM_FORA_DO_ESCOPO` (`api/core/prompts.py`) sem nenhuma chamada de geração ao LLM.

Exemplos:

- "O que é dengue?" é `fora_do_escopo`: a Clara não responde perguntas conceituais com conhecimento próprio do modelo;
- "Pode repetir o último número de forma mais simples?" é `responder`, porque reformula algo já dito;
- uma formulação incomum sobre dados municipais pode precisar do LLM para selecionar a ferramenta correta.

### 2.2 Redação da resposta final

O LLM só redige a resposta final quando não existe uma resposta determinística adequada. Quando uma ferramenta retorna estoque, alertas, epidemiologia ou ETP em um formato conhecido, o backend monta o texto e o artefato diretamente a partir do resultado da ferramenta.

Essa separação é importante: **o modelo não é a fonte dos números**. Os dados vêm das ferramentas e das bases conectadas ao SusPredict; a IA atua principalmente na interpretação da pergunta e na comunicação da resposta.

## 3. Quando a IA não é utilizada

O roteador local reconhece consultas operacionais de alta confiança e as encaminha diretamente para ferramentas. Atualmente isso cobre:

- estoque, insumos, medicamentos e risco de desabastecimento;
- alertas e ocorrências;
- epidemiologia e notificações;
- internações, hospitalizações e menções a UTI;
- mortalidade, nascimentos e produção ambulatorial.

Também existem respostas locais para saudações de abertura, continuidade de conversa e memória do próprio usuário. Nesses caminhos, o LLM nem sequer é inicializado.

Saudações ("oi", "olá", "bom dia", "tudo bem?", "e aí, Clara") são reconhecidas em `susbot_intents.eh_saudacao` após normalização de acentos e caixa, e só quando a mensagem inteira é a saudação. Elas resolvem para a ferramenta `sobre_o_projeto`, que devolve o texto curado sobre o SusPredict. "Bom dia, quanto de dipirona tem em estoque?" não casa como saudação e segue para `consultar_estoque`; conversa social que não é saudação ("qual seu time?") vai ao planejador e é recusada como `fora_do_escopo`.

Exemplos:

| Pergunta | Caminho esperado | Usa LLM? |
|---|---|---:|
| "Qual o estoque de dipirona?" | regra local → `consultar_estoque` → resposta fixa | Não |
| "Quais alertas estão ativos?" | regra local → `consultar_alertas` → resposta fixa | Não |
| "Mostre internações de 2024 a 2026" | regra local → `consultar_epidemiologia` (SIH) | Não |
| "Quem sou eu?" | contexto seguro do usuário | Não |
| "Oi, bom dia!" | regra local → `sobre_o_projeto` → texto curado | Não |
| "Qual seu time?" | planejamento → `fora_do_escopo` → recusa fixa | Só no planejamento |
| "Explique o que é uma doença de notificação compulsória" | planejamento → `fora_do_escopo` → recusa fixa | Só no planejamento |
| "O que é o SUS Predict?" | planejamento → `sobre_o_projeto` → texto curado | Só no planejamento |
| Pergunta ambígua que exige escolher uma ferramenta | planejamento pelo modelo → ferramenta | Sim, no planejamento |

## 4. Principais funções da Clara

### 4.1 Consultar estoque

A ferramenta `consultar_estoque` busca itens do município, pode filtrar um insumo específico ou somente itens em risco e calcula cobertura estimada com base em quantidade atual e consumo médio.

A resposta apresenta fonte, competência, confiança, eventual defasagem e a limitação do cálculo. A cobertura não deve ser interpretada como previsão completa de abastecimento, pois não incorpora automaticamente protocolos clínicos, lead time ou margem de segurança.

### 4.2 Consultar alertas

A ferramenta `consultar_alertas` recupera alertas do município e apresenta tipo, severidade, status e descrição.

### 4.3 Consultar dados epidemiológicos

A ferramenta `consultar_epidemiologia` acessa resultados dos sistemas:

- `SIM`: mortalidade;
- `SIH`: internações hospitalares;
- `SINASC`: nascimentos;
- `SIA`: produção ambulatorial;
- `SINAN`: agravos de notificação.

A Clara diferencia dados hospitalares de informações em tempo real. Por exemplo, dados do SIH não comprovam ocupação ou disponibilidade atual de leitos de UTI.

### 4.4 Gerar ETP

A ferramenta `gerar_etp` é uma operação de escrita. Ela prepara um Estudo Técnico Preliminar com base nos dados disponíveis, mas **nunca é executada apenas porque o modelo sugeriu a ação**.

O fluxo é:

1. a Clara propõe a geração;
2. a interface exibe uma confirmação pendente;
3. o usuário confirma explicitamente;
4. somente então o backend executa a ferramenta.

### 4.5 Manter contexto e memória segura

O agente utiliza o histórico recente e a memória vinculada ao usuário autenticado para manter continuidade. O código impede que o bot afirme acessar a memória ou o perfil de outra pessoa e oculta identificadores internos em mensagens antigas.

### 4.6 Entregar resposta progressiva

O backend utiliza Server-Sent Events (SSE) para emitir status, referências, artefatos, tokens, confirmações e o evento final. O adaptador Ollama repassa progressivamente os chunks recebidos em `/v1/chat/completions`, sem montar a resposta inteira antes de enviá-la ao cliente.

## 5. Fluxo de decisão

```text
Pergunta do usuário
        |
        v
Roteador local reconhece a intenção?
   |                         |
  sim                       não
   |                         |
   v                         v
Ferramenta direta       LLM cria plano JSON
   |                         |
   +------------+------------+
                |
                v
       A ferramenta altera dados?
          |               |
         sim             não
          |               |
 Confirmação humana     Executa consulta
          |               |
          +-------+-------+
                  |
                  v
      Existe resposta determinística?
          |               |
         sim             não
          |               |
  Backend monta texto   LLM redige resposta
          |               |
          +-------+-------+
                  |
                  v
        SSE + referência + artefato
```

## 6. Uso da IA local

### Arquitetura da demonstração

Para o contexto acadêmico do SusPredict, a opção implementada é executar a IA **localmente no computador responsável pela demonstração**, usando Ollama.

```text
Clara/FastAPI → endpoint local → modelo local → resposta à Clara
                       |
                       +-- sem envio intencional da conversa a um provedor de LLM externo
```

O servidor local recebe somente o contexto necessário, executa o modelo na máquina da demonstração e devolve o plano em JSON ou o texto da resposta. As regras determinísticas e as ferramentas continuam sendo executadas pelo backend do SusPredict.

### Estado real da integração

O backend possui o adaptador `api/core/local_llm.py`, selecionado com `SUSBOT_LLM_PROVIDER=local`. Ele implementa os dois contratos usados pelo agente:

- `planejar()`: chama a API nativa `/api/chat` com JSON Schema obrigatório (`acao` ∈ responder | chamar_ferramenta | fora_do_escopo) e produz ação, ferramenta e argumentos; a validação de escopo fica no `ClaraAgent`, comum a todos os provedores;
- `stream_resposta()`: chama `/v1/chat/completions` e entrega a resposta em streaming.

Os testes automatizados validam o contrato, o fallback para JSON inválido, o streaming e a mensagem de indisponibilidade. A execução real com o modelo `susbot-3b` ainda deve ser confirmada no servidor Ubuntu que hospeda o Ollama; os testes locais não simulam desempenho de GPU.

### Por que usar uma IA local neste projeto

- permite demonstrar o chatbot sem depender de cotas de uma API comercial;
- reduz a dependência de conexão com a internet durante a apresentação;
- facilita testes repetidos sem cobrança por token;
- mantém o processamento do modelo dentro do ambiente controlado da demonstração;
- permite comparar modelos e quantizações usando o mesmo conjunto de perguntas.

Execução local não significa segurança automática. Históricos, logs, arquivos do modelo, banco local e acesso à máquina ainda precisam ser protegidos.

## 7. Qual modelo local usar?

Não existe um único modelo ideal para qualquer computador. A escolha depende principalmente da memória RAM ou VRAM disponível e da velocidade exigida para a apresentação.

Para a Clara, o modelo deve:

- compreender bem português;
- seguir instruções de sistema;
- produzir JSON válido com consistência;
- selecionar ferramentas e extrair argumentos;
- responder de forma curta e objetiva;
- funcionar com temperatura baixa;
- caber no equipamento usado na demonstração.

### Recomendação por capacidade do computador

| Ambiente de demonstração | Perfil sugerido |
|---|---|
| 8 GB de memória disponível | modelo instruct de 3B a 4B quantizado; mais rápido, mas exige testes rigorosos de JSON e ferramentas |
| 16 GB de memória disponível | modelo instruct de 7B a 9B quantizado; melhor ponto de partida para a demo |
| 24 a 32 GB de memória disponível | modelo instruct de 12B a 14B quantizado; tende a melhorar interpretação e planejamento |
| GPU ou computador com mais de 32 GB disponíveis | modelos maiores podem ser avaliados, desde que a latência continue aceitável |

No servidor disponível, o modelo escolhido é o **Qwen2.5 3B Instruct q4_K_M**, registrado no Ollama como `susbot-3b`. A escolha respeita o limite de 3 GB de VRAM e deve ser reavaliada com o conjunto completo de perguntas da Clara. Para esta demonstração, previsibilidade, JSON correto e tempo de resposta são mais importantes do que liderar benchmarks genéricos.

Modelos muito pequenos podem conversar bem, mas errar a ferramenta ou os argumentos. Modelos muito grandes podem ser mais capazes, porém lentos demais para uma demonstração fluida.

## 8. Como escolher com evidência, e não apenas por benchmark

A recomendação acima deve ser validada com uma avaliação do próprio Clara. O melhor modelo é o que obtiver o melhor resultado nas perguntas reais do produto, dentro do limite de custo e latência.

Crie um conjunto anonimizado com pelo menos 100 perguntas, distribuídas entre:

- estoque e risco de ruptura;
- alertas;
- epidemiologia por sistema e período;
- perguntas livres de saúde pública;
- continuações dependentes do histórico;
- pedidos de geração de ETP;
- tentativas de acessar dados de outro usuário;
- perguntas ambíguas e fora do escopo.

Avalie cada modelo com os mesmos prompts e parâmetros. As métricas recomendadas são:

| Critério | Meta inicial |
|---|---:|
| Seleção correta da ferramenta | ≥ 98% |
| Argumentos corretos e JSON válido | ≥ 99% |
| Ação de escrita sem confirmação | 0% |
| Número inventado ou divergente da ferramenta | 0% |
| Vazamento de memória/identificador | 0% |
| Resposta adequada em português | ≥ 95% |
| Latência p95 do planejamento | definir após medir a infraestrutura |
| Custo por 1.000 conversas | registrar e comparar |

O teste deve separar quatro resultados:

1. qualidade do planejamento;
2. fidelidade ao resultado da ferramenta;
3. qualidade da redação;
4. custo e latência.

## 9. Segurança, privacidade e limites acadêmicos

- O LLM não deve receber segredos, tokens ou credenciais.
- O endpoint da IA local deve aceitar conexões somente da própria máquina ou da rede controlada da demonstração.
- O servidor local não deve ser exposto diretamente à internet.
- Os dados enviados ao modelo devem ser limitados ao necessário para a pergunta.
- A memória pessoal deve permanecer isolada por usuário autenticado.
- Toda ação de escrita exige confirmação humana.
- Respostas clínicas não devem ser apresentadas como diagnóstico ou prescrição.
- Números operacionais devem vir das ferramentas, nunca da memória interna do modelo.
- A taxa, custo, erro e latência de cada provedor devem ser monitorados.
- As métricas locais atuais contam execuções por modo e intenção, mas ficam apenas no processo atual e não armazenam pergunta, resposta ou identidade.
- Falhas no meio do streaming são um limite conhecido: depois que parte da resposta foi enviada, não é possível substituí-la integralmente sem adotar bufferização.

A Clara é um protótipo acadêmico de apoio à demonstração. Não deve ser tratado como sistema de produção, dispositivo médico, fonte oficial do SUS ou substituto de profissionais qualificados. Os dados exibidos na demo devem ser identificados claramente como reais, de demonstração ou indisponíveis, conforme sua origem.

## 10. Configuração local esperada

O backend recebe a configuração do servidor local pelas seguintes variáveis de ambiente:

```dotenv
SUSBOT_LLM_PROVIDER=local
SUSBOT_LOCAL_BASE_URL=http://127.0.0.1:11434/v1
SUSBOT_LOCAL_MODEL=modelo-instruct-instalado
SUSBOT_LOCAL_API_KEY=
```

O endereço `127.0.0.1` evita expor o servidor na rede. A porta, o caminho `/v1` e a necessidade de uma chave fictícia dependem do executor local escolhido. O nome do modelo não deve ficar fixo no código, pois a equipe pode testar alternativas sem alterar a implementação.

Antes da apresentação, a equipe deve:

1. iniciar o servidor de IA local;
2. confirmar que o modelo configurado está instalado;
3. executar perguntas de estoque, alertas, epidemiologia, contexto e ETP;
4. testar o funcionamento sem internet;
5. preparar respostas determinísticas para os principais fluxos da demo;
6. informar claramente quais dados são reais e quais foram preparados para demonstração.

## 11. Conclusão

A IA é usada na Clara como uma camada de interpretação e comunicação, não como banco de dados nem como autoridade final. Como o SusPredict é um projeto de faculdade destinado a demonstrações e testes, a arquitetura desejada usa um **modelo instruct local**, enquanto regras e ferramentas determinísticas permanecem como caminho principal.

O melhor ponto de partida é um modelo quantizado de 7B a 14B compatível com a capacidade da máquina. A escolha final deve ser baseada em testes do próprio Clara, especialmente seleção de ferramentas, JSON válido, fidelidade aos dados, privacidade e latência durante a demonstração.

## Fontes

### Implementação do projeto

- `api/core/susbot_agent.py` — orquestração, seleção do provedor, Gemini, Groq, confirmação e SSE.
- `api/core/local_llm.py` — planejamento estruturado e streaming pelo Ollama local.
- `api/core/susbot_access.py` — chave opcional por pessoa e limite por chave para exposição controlada.
- `api/core/susbot_intents.py` — roteamento determinístico de intenções.
- `api/core/susbot_tools.py` — consultas e operações permitidas.
- `api/core/susbot_metrics.py` — métricas anônimas de uso de LLM.

### Referências para execução local

- Ollama. [Documentação da API](https://docs.ollama.com/api/introduction).
- LM Studio. [Servidor local e endpoints compatíveis com OpenAI](https://lmstudio.ai/docs/developer/openai-compat).
