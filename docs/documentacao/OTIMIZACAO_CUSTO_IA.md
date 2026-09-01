# Otimização de custo da Clara

## Fluxo atual

A Clara usa uma cascata de decisão compartilhada pela web e pelos canais externos:

1. O roteador local identifica intenções operacionais de alta confiança.
2. A ferramenta consulta os dados do município.
3. Um template determinístico monta a resposta e o artefato.
4. O LLM é inicializado somente quando nenhuma rota local ou contextual resolve a pergunta.

As rotas locais iniciais são:

- `consultar_estoque`
- `consultar_alertas`
- `consultar_epidemiologia`
- respostas seguras sobre o próprio perfil e o histórico recente

O roteador também extrai localmente:

- item de estoque, quando estiver expresso de forma inequívoca;
- intervalo de anos;
- sistema epidemiológico adequado (`SIH`, `SIM`, `SINASC`, `SIA` ou `SINAN`);
- solicitação específica sobre UTI, preservando a limitação dos dados do SIH.

## Metadados de execução

O evento SSE `fim` inclui o campo `execucao`:

```json
{
  "modo": "deterministico",
  "intencao": "consultar_estoque",
  "confianca": 0.98,
  "llm_planejamento": false,
  "llm_resposta": false,
  "sem_llm": true
}
```

Esses metadados permitem medir economia por resposta sem armazenar a pergunta,
a resposta ou a identidade do usuário.

## Endpoint de métricas

`GET /api/susbot/metricas-uso`

Requer usuário autenticado e retorna contagens anônimas do processo atual:

```json
{
  "respostas_total": 20,
  "respostas_sem_llm": 14,
  "chamadas_planejamento_llm": 6,
  "chamadas_resposta_llm": 6,
  "taxa_respostas_sem_llm": 0.7,
  "por_modo": {
    "deterministico": 12,
    "contextual_local": 2,
    "generativo": 6
  },
  "persistencia": "processo_atual",
  "dados_pessoais_coletados": false
}
```

As métricas reiniciam junto com a API e não exigem alteração de banco de dados.

## Evolução para machine learning

O roteador atual é intencionalmente explicável. Antes de treinar um classificador,
devemos revisar exemplos reais anonimizados, criar um conjunto versionado de testes
e definir um limiar de confiança. Uma previsão abaixo do limiar deve continuar indo
para o planejador generativo.

O primeiro modelo recomendado é um classificador local leve, como TF-IDF com
regressão logística. Ele deve apenas selecionar intenções; cálculos e decisões
continuam nas ferramentas determinísticas e auditáveis.
