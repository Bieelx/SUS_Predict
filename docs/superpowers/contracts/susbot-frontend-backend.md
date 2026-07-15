# SusBot - Contrato Frontend/Backend

> Fonte de verdade do painel do SusBot até a Fase 2.

## Objetivo

Fechar o payload de envio, os eventos SSE e o formato do historico para que o frontend
e o backend trabalhem com o mesmo contrato.

## Requisicao

Endpoint: `POST /api/susbot/perguntar`

Campos aceitos pelo backend:

```json
{
  "pergunta": "string",
  "conversa_id": "string | null",
  "ibge6": "string | null",
  "ibge": "string | null",
  "tela_origem": "string | null"
}
```

Regras:

- `pergunta` e obrigatoria.
- `ibge6` e obrigatorio; `ibge` fica como fallback de compatibilidade.
- A `tela_atual` do produto vem da rota ativa do frontend; no wire ela segue em
  `tela_origem`.
- `conversa_id` e opcional; quando ausente, o backend cria uma nova conversa.

## SSE

Eventos emitidos pelo backend:

```json
status: { "mensagem": "...", "conversa_id": "...", "conversa_criada": true }
token: { "texto": "..." }
referencia: { "rota": "/insumos", "label": "ver em Insumos →" }
fim: {
  "resposta": "...",
  "referencia_rota": "/insumos | null",
  "plano": {},
  "resultado_ferramenta": {}
}
```

Regras:

- O frontend atualiza o texto acumulado a cada `token`.
- `referencia` pode chegar antes do `fim` e deve ser exibido como atalho clicavel.
- `status` serve para indicar etapas como planejamento, consulta e geracao final.

## Historico

Listagem de conversas: `GET /api/susbot/conversas?page=&page_size=`

Listagem de mensagens: `GET /api/susbot/conversas/{conversa_id}/mensagens?page=&page_size=`

Formato paginado comum:

```json
{
  "page": 1,
  "page_size": 20,
  "total": 1,
  "total_paginas": 1,
  "usuario": "user-id",
  "itens": []
}
```

## Erro e timeout

- Erros de rede ou backend viram mensagem amigavel dentro da conversa.
- O input deve voltar a ficar disponivel quando a chamada falhar.
- Timeout de transporte do cliente: `45s`.
