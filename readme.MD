# SUS Predict — FIAP TCC 2026

Plataforma web de apoio à gestão municipal de saúde. Junta dados públicos curados
(SINAN, SIH, compras públicas, vacinação) com o que as próprias unidades informam, e
oferece a **Clara**, uma assistente de escopo fechado disponível na web, no Telegram e no
WhatsApp.

Em produção: `https://suspredict.northcentralus.cloudapp.azure.com` (VM Azure).

> Documentação detalhada (fonte de verdade, fora do Git — pasta `docs/` é ignorada):
> `docs/01-produto.md` (produto e telas), `docs/02-arquitetura.md` (infra, dados, auth,
> Clara, endpoints) e `docs/03-status.md` (feito, pendente, decisões).

---

## O que o sistema faz

- **Telas operacionais:** Visão Geral, Alertas (risco de aquisição por compras públicas),
  Insumos e Registros da unidade.
- **Análises:** Epidemiologia (SINAN), Internações (SIH) e Vacinação (dengue).
- **Documentos:** gerador de ETP em 4 etapas com trava de revisão e exportação em PDF.
- **Clara:** responde só com dado de ferramenta do sistema ou texto curado sobre o projeto;
  registra entradas operacionais (doses, medicamentos, leitos, internações por dengue) como
  rascunho que só grava após confirmação humana.
- **Acesso:** login com senha + código por e-mail, perfis (`admin`, `gestor`, `vigilancia`,
  `farmacia`, `visitante`) e municípios atribuídos pelo admin.
- **Demo histórica:** replay de dengue em Campinas 2024, roda no navegador sem backend
  (Configurações → demo).

## Arquitetura em uma tela

```
Navegador ──HTTPS──▶ Caddy (VM Azure)
                       ├── /           → build do React
                       └── /backend/*  → FastAPI (uvicorn 127.0.0.1:8000)
FastAPI ──▶ SQLite (api/sus_predict.db)   Clara, perfis, conversas
        ──▶ Supabase Postgres + Auth       tabelas curadas, registros locais, inputs operacionais
        ──▶ LLM: Ollama local (susbot-3b) → Gemini → Groq
Telegram / WhatsApp (OpenWA) ──webhook──▶ /backend/api/susbot/{telegram,whatsapp}/webhook
```

| Camada | Tecnologia |
|---|---|
| Frontend | React 18, Vite 5, Recharts, CSS com tokens + 4 temas, fontes locais |
| Backend | Python 3.12, FastAPI, Pydantic, pandas, psycopg 3 |
| Predição | Holt → OLS com detecção de surto por MAD (`api/core/prediction.py`) |
| IA | Roteador determinístico + LLM; faster-whisper para áudio |
| Dados | Supabase (Postgres + GoTrue), SQLite |
| Pipeline | Notebooks Databricks em `pipeline/` (bronze → silver → agregados) |
| Infra | Azure for Students, Ubuntu 24.04, systemd, Caddy, Tailscale |

## Estrutura do repositório

```
api/
  main.py                 app FastAPI: auth, rotas legadas de job, include dos routers
  core/                   domínio (um módulo por assunto)
    operational_router.py   /api/dados/*  — dados curados que as telas leem
    susbot_*.py, prompts.py, local_llm.py, clara_*.py, conversation_*.py   Clara
    channel_router.py, channel_media.py, audio_transcription.py            Telegram/WhatsApp
    local_records_*.py      /api/clara/registros-locais e /api/local
    operational_inputs_*.py /api/clara/inputs-operacionais
    auth.py, permissoes.py, identidade.py, admin_router.py, rate_limit.py
    db.py, prediction.py, download.py, aggregation.py, export.py
    dengue.py               /api/dengue/* (legado, não usado pelo frontend)
  tests/                  pytest (~390 testes)
frontend/
  src/App.jsx             shell: auth, tema, roteamento, sidebar, Clara
  src/pages/              uma tela por arquivo
  src/shared/             clientes HTTP, formatadores, componentes comuns
  src/features/registros-locais/, src/demo/, src/beta/
  tests/                  specs Playwright
pipeline/                 notebooks Databricks + SQL das tabelas curadas
supabase/                 migrations/, schemas e seeds SQL, SETUP.md, REGISTROS_UNIDADE.md
deploy/                   update automático da VM, OpenWA, exemplos de service/túnel
scripts/                  utilitários (migração da Clara, acessos Supabase, demo, briefing)
datasus.py, schema.py     extrator CLI original via PySUS (legado)
```

## Rodar localmente

Requisitos: Node.js ≥ 18. Para o backend, Python **3.12** (o `venv/` do projeto já é 3.12).

### Só o frontend (dia a dia)

```bash
cp frontend/.env.example frontend/.env.local   # primeira vez
bash start_dev.sh                              # Vite em http://localhost:3000
```

O Vite encaminha `/backend` para `SUSBOT_PROXY_TARGET` e injeta `SUSBOT_API_KEY` nas
chamadas da Clara (a chave não entra no bundle).

| Variável (`frontend/.env.local`) | Uso |
|---|---|
| `VITE_API_BASE` | `/backend` |
| `SUSBOT_PROXY_TARGET` | URL do backend (produção ou `http://127.0.0.1:8000`) |
| `SUSBOT_API_KEY` | uma das chaves de `SUSBOT_API_KEYS` do servidor |
| `VITE_REGISTROS_LOCAIS_DEMO=1` | fixtures de demonstração em Registros da unidade (só dev) |

### Backend local

```bash
source venv/bin/activate
pip install -r api/requirements_api.txt -r api/requirements_dev.txt
cp .env.example .env     # preencher o necessário
uvicorn api.main:app --reload --port 8000    # a partir da raiz do repo
```

Sem Supabase configurado, `SUS_PREDICT_DEV_AUTH=true` libera o botão "Entrar como dev"
(`POST /api/auth/dev-login`). Nunca em produção.

Variáveis principais do `.env` (lista completa em `.env.example`):

| Grupo | Variáveis |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| LLM | `SUSBOT_LLM_PROVIDER` (`local`/`gemini`/`groq`), `SUSBOT_LOCAL_BASE_URL`, `SUSBOT_LOCAL_MODEL`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `SUSBOT_COMPLEX_LLM_PROVIDER`, `SUSBOT_GEMINI_INPUT_ENABLED` |
| API da Clara | `SUSBOT_API_KEYS`, `SUSBOT_RATE_LIMIT_PER_MINUTE`, `SUSBOT_CORS_ORIGINS`, `SUSBOT_MEMORY_KEY` |
| Canais | `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CHANNEL_PAIRING_SECRET`, `OPENWA_*`, `WHATSAPP_BOT_NUMBER` |
| Registros | `CLARA_REGISTROS_LOCAIS_ENABLED`, `CLARA_REGISTROS_DATABASE_URL` |
| Áudio | `CLARA_STT_*` |

## Testes

```bash
venv/bin/python -m pytest api/tests -q
cd frontend && npm test                      # unitários (node --test)
cd frontend && npx playwright test tests/<spec>.js --workers=1
python3 deploy/test_azure_update.py -v
```

Specs Playwright usam respostas simuladas; alguns specs antigos falham independentemente
(ver `docs/03-status.md`).

## Deploy

Push na `main` basta. Na VM, `suspredict-update.timer` verifica a `main` a cada 2 min,
faz fast-forward, build do frontend, reinstala deps só se `requirements_api.txt` mudou,
reinicia `suspredict.service`, checa `/backend/health` e faz rollback se falhar. Migrations
do Supabase **não** rodam no deploy: são aplicadas à parte (`supabase/migrations/`).

## Clara — escopo

A Clara não é chatbot de uso geral. Só produz texto a partir de:

1. dados devolvidos por ferramenta (`consultar_estoque`, `consultar_aquisicoes`,
   `consultar_alertas`, `consultar_epidemiologia`, `gerar_etp`);
2. texto fixo sobre o projeto (`sobre_o_projeto`), também usado para saudações inteiras.

O resto recebe recusa padronizada gerada em código. O planejador LLM escolhe entre
`chamar_ferramenta`, `responder` e `fora_do_escopo`; o backend valida escopo e perfil antes
de executar, e ferramentas de escrita exigem confirmação. Perguntas clínicas,
farmacológicas, acadêmicas e sociais são recusadas. Textos e prompts em `api/core/prompts.py`.

Entradas operacionais ("aplicamos 30 doses de…", "UTI: 19 leitos ocupados e 1 disponível")
viram rascunhos; na web confirma-se pela tela, no Telegram/WhatsApp com `CONFIRMO`.

## Modelo de linguagem — Built with Qwen

O modelo local da Clara (`susbot-3b`, servido pelo Ollama) é derivado do **Qwen2.5 3B
Instruct**, quantizado em `q4_K_M`. Este projeto é **Built with Qwen**, conforme a cláusula
4(b) da [Qwen Research License](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE).
Gemini e Groq são fallback; tarefas de raciocínio longo (planejamento de ETP) podem usar
Gemini (`api/core/clara_model_policy.py`). A barreira de escopo vale para todos, porque
fica no agente.

## Segurança

- Nunca expor `SUPABASE_SECRET_KEY` no frontend nem commitar `.env`.
- Tabelas do Supabase com RLS ligada e sem policy: só o backend acessa.
- `/docs` e `/openapi.json` ficam fechados em produção (abrir com `SUS_PREDICT_DOCS=1`).
- Não commitar `exports/`, `temp_data/` nem bancos SQLite.
