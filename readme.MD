# 🏥 SUS Predict — FIAP TCC 2025/2026

Aplicação web para **extrair dados públicos do DATASUS (via PySUS)**, **tratar/agregar**, **publicar no Supabase** quando configurado e oferecer um **dashboard React** com análises, previsão e o **Clara** (chat contextual).

O foco atual do projeto é **São Paulo/SP** (município: **São Paulo**, IBGE **3550308**), mas a arquitetura já suporta evoluir para mais cidades.

## Visão geral (fluxo)

- Você escolhe **categoria (SIM/SIH/SINASC/SIA/SINAN)**, localização e período.
- O backend baixa os dados reais via **FTP do DATASUS** usando **PySUS** (Python 3.12).
- O backend calcula agregações e previsão e retorna um `resultado.json`.
- O backend também expõe a Clara, que consulta conversas, estoque e alertas no banco local/Supabase quando disponíveis.
- Se configurado, o backend sincroniza no **Supabase**:
- Tabelas tratadas (pequenas): séries, distribuições, top causas.
- Bruto compacto (opcional): CSV `.csv.gz` com colunas mínimas no **Storage**, respeitando um budget para caber no plano Free.
- Na próxima vez, o app tenta **carregar do Supabase (cache)** e evita re-download.

## Stack

- Backend: Python 3.12, FastAPI, PySUS, pandas, Gemini via `GEMINI_API_KEY` (opcional), openpyxl.
- Frontend: React + Tailwind + Recharts (Vite).
- Persistência: Supabase (Postgres + Storage).

## Requisitos

### 1) Python 3.12 (obrigatório)

O PySUS não funciona corretamente com Python 3.13+. Use **Python 3.12**.

### 2) Node.js

Necessário para rodar o frontend (Vite).

### 3) Chaves opcionais/necessárias por recurso

- `GEMINI_API_KEY`: necessária para a Clara responder com LLM real.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`: opcionais, só se quiser sincronizar cache/persistência com Supabase.
- `SUSBOT_DEV_AUTH_SECRET`: opcional, usado para assinar o login de desenvolvimento quando Supabase não estiver configurado.
- `SUSBOT_MEMORY_KEY`: chave Fernet opcional para criptografar a memória pessoal da Clara. Em desenvolvimento, uma chave local com permissão `0600` é criada em `api/.secrets/`; em produção, configure-a pelo gerenciador de segredos da infraestrutura.
- Telegram: `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` e `CHANNEL_PAIRING_SECRET`. Veja [INTEGRACAO_CANAIS_CLARA.md](./INTEGRACAO_CANAIS_CLARA.md).

## Instalação (local)

### 1) Criar e ativar o venv (Python 3.12)

```bash
python3.12 -m venv venv
source venv/bin/activate
```

### 2) Instalar dependências

Backend (API):

```bash
pip install -r api/requirements_api.txt
```

Desenvolvimento e testes:

```bash
pip install -r api/requirements_dev.txt
```

Extras do projeto (se você usa o CLI `datasus.py` ou outras libs do repo):

```bash
pip install -r Requirements.txt
```

Frontend:

```bash
cd frontend
npm install
```

## Rodar o projeto

### Opção A) Frontend + backend do servidor (recomendado)

O backend é fixo, hospedado no servidor Ubuntu do grupo. No dia a dia você sobe só o
frontend, e o Vite encaminha `/backend` para lá.

```bash
bash start_dev.sh
```

O script (macOS, Linux e Windows via Git Bash / MSYS2):

- Confere se há `npm` (Node.js >= 18).
- Mostra o `SUSBOT_PROXY_TARGET` configurado em `frontend/.env.local`.
- Roda `npm install` se `node_modules` não existir.
- Sobe o Vite em `http://localhost:3000`.

Configure `frontend/.env.local` (copie de `frontend/.env.example`) com
`SUSBOT_PROXY_TARGET` (URL do backend) e `SUSBOT_API_KEY` (uma das chaves de
`SUSBOT_API_KEYS` do servidor). Quem lê esse arquivo é o Vite, não o script.

### Opção B) Backend local (só pra mexer na API)

Rode o backend você mesmo e aponte `SUSBOT_PROXY_TARGET=http://127.0.0.1:8000` no
`frontend/.env.local`.

Backend:

```bash
source venv/bin/activate
cd api
pip install -r requirements_api.txt
uvicorn main:app --reload --port 8000
```

Se for rodar os testes nesse mesmo ambiente, instale também `api/requirements_dev.txt` uma vez.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Auth de desenvolvimento

Para testar a Clara sem Supabase, use o botão **Entrar como dev** na tela de login.

- Ele chama `POST /api/auth/dev-login`.
- O backend gera um token local assinado.
- Esse token é aceito em `GET /api/auth/me` e nas rotas da Clara.

## Supabase (cache + organização)

O Supabase é usado para evitar re-download e manter os dados tratados organizados.

### Segurança

- Nunca use `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nunca comite `.env`.
- Se uma chave vazar, rotacione imediatamente no Supabase.

### 1) Criar schema no Supabase (SQL)

No Supabase, abra `SQL Editor` e rode:

- `supabase/schema.sql`

O schema cria:

- `datasus_runs`: metadados de cada execução (run).
- `datasus_serie`: série (real + previsto) por ano.
- `datasus_sexo`: distribuição por sexo (%).
- `datasus_faixa_etaria`: distribuição por faixa (%).
- `datasus_top_causas`: top causas/diagnósticos (%).
- `datasus_raw_objects`: objetos brutos no Storage associados ao run.

### 2) Criar bucket no Storage

Crie um bucket (exemplo):

- Nome: `datasus-raw`
- Tipo: recomendado **Private**

### 3) Configurar `.env`

Crie um arquivo `.env` na raiz (existe um modelo em `.env.example`).

Variáveis usadas pelo backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET_RAW` (default: `datasus-raw`)
- `SUPABASE_ENABLE_RAW_UPLOAD` (default: `true`)
- `SUPABASE_RAW_MAX_BYTES` (default: `250000000`)
- `SUPABASE_ENABLE_CACHE_READ` (default: `true`)

Exemplo:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
SUPABASE_BUCKET_RAW=datasus-raw
SUPABASE_ENABLE_RAW_UPLOAD=true
SUPABASE_RAW_MAX_BYTES=250000000
SUPABASE_ENABLE_CACHE_READ=true
```

Se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` não estiverem definidos, o projeto continua funcionando em modo local, usando SQLite e o login de desenvolvimento.

### Como funciona o upload no Supabase

Quando um job termina com sucesso:

- O backend faz **upsert** nas tabelas tratadas (Postgres).
- Se `SUPABASE_ENABLE_RAW_UPLOAD=true`, ele gera um **CSV compactado** (`.csv.gz`) com **colunas mínimas** e faz upload no Storage.
- Se o arquivo compactado passar de `SUPABASE_RAW_MAX_BYTES`, o upload do bruto é ignorado para não estourar o plano.
- O objeto bruto enviado é registrado em `datasus_raw_objects`.

### Como funciona o cache (não baixar toda vez)

Quando o frontend solicita `/api/download`:

- Se `usar_cache=true` (padrão), o backend procura no Supabase um run idêntico (mesma categoria, cidade/UF, período e doença).
- Se existir, ele retorna imediatamente com status `done` e o dashboard carrega do Supabase.
- Se não existir, ele baixa do DATASUS e depois sincroniza.

## Interface (dashboard)

**Esta seção está desatualizada em relação ao `frontend/src/App.jsx` atual e ao redesenho
em andamento — ver `CLAUDE.md` (seção "Redesenho de telas") e `docs/telas/` para o estado
real do frontend e a especificação de telas em vigor.**

Hoje o frontend monta:
- Login/cadastro.
- Dashboard das telas do redesenho.
- Painel flutuante da Clara.
- Gerador de ETP.

O texto abaixo descreve uma versão anterior do dashboard (wizard + mapa de pins), mantido aqui
só como referência histórica do fluxo de cache/Supabase, que continua válido no backend:

- `Visão Geral`: cards e gráficos baseados somente em dados reais retornados pelo backend.
- `Baixar Dados`: wizard para criar novas execuções.
- `Mapa de Risco`: mapa do Brasil com pins baseados em runs reais do Supabase (com coordenadas conhecidas).

Observação: hoje o backend conhece coordenadas apenas do município de São Paulo. Para ampliar pins, adicione coordenadas reais no backend ou evolua para uma tabela de municípios (IBGE6 -> lat/lon) no Supabase.

## Exportar XLSX

O backend expõe:

- `GET /api/export/{job_id}`: gera e baixa um `.xlsx` com abas de resumo e agregações.

O frontend mostra o botão `Exportar XLSX` quando a análise está carregada.

## Endpoints principais (backend)

- `POST /api/download`: inicia um job de download/processamento (com cache opcional).
- `GET /api/status/{job_id}`: progresso e status.
- `GET /api/resultado/{job_id}`: resultado final (JSON).
- `GET /api/export/{job_id}`: export XLSX.
- `GET /api/runs`: lista runs no Supabase (para mapa/filtros).

## Escopo da Clara

A Clara é a assistente de chat do SUS Predict (web e Telegram). Ela **não é um chatbot de uso geral**. Por decisão de projeto, a Clara só produz texto a partir de duas fontes:

1. **Dados devolvidos por uma ferramenta do sistema** (estoque de insumos, alertas, séries epidemiológicas do SIM/SIH/SINASC/SIA/SINAN, geração de ETP).
2. **Um texto fixo sobre o projeto**, escrito à mão pela equipe (ferramenta `sobre_o_projeto`).

Qualquer outra pergunta recebe uma recusa curta e padronizada, gerada em código, sem passar pelo modelo de linguagem.

**O que ela responde**

- "Quais insumos estão em risco de faltar?"
- "Quais alertas estão abertos no município?"
- "Como evoluíram as internações por dengue entre 2022 e 2024?"
- "O que é o SUS Predict? O que você consegue fazer?"
- Pedidos para reformular ou esclarecer algo que ela mesma disse nesta conversa.

**O que ela recusa**

- Perguntas clínicas e farmacológicas (doses, interações, diagnóstico), mesmo que pareçam simples.
- Perguntas acadêmicas de qualquer área: química, biologia, matemática, programação, política.
- Conselhos pessoais e conversa social.
- Qualquer pergunta cuja resposta exigiria conhecimento próprio do modelo em vez de dado do município.

**Por quê**

A Clara roda sobre um modelo de linguagem pequeno e quantizado (ver seção abaixo), executado localmente para não depender de API comercial. Modelos desse porte respondem perguntas abertas com confiança, mas erram com frequência e, pior, mantêm o erro quando corrigidos. Em um sistema de apoio à gestão de saúde, uma resposta clínica errada é um risco real. A regra dura (só dado de ferramenta ou texto curado) elimina essa classe de erro pela arquitetura, não por prompt: o planejador decide entre `responder`, `chamar_ferramenta` e `fora_do_escopo`, e o backend valida todo plano antes de executar, rebaixando para `fora_do_escopo` qualquer coisa fora do enum ou qualquer "responder" sem histórico de conversa que o justifique. A recusa nunca é redigida pelo modelo.

Detalhes do fluxo: [docs/UTILIZACAO_IA_CLARA.md](docs/UTILIZACAO_IA_CLARA.md). Textos e prompts centralizados em `api/core/prompts.py`.

## Modelo de linguagem — Built with Qwen

O modelo local da Clara (`susbot-3b`, servido pelo Ollama) é derivado do **Qwen2.5 3B Instruct**, quantizado em `q4_K_M`. Este projeto é **Built with Qwen**, conforme a atribuição exigida pela cláusula 4(b) da [Qwen Research License](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE). O modelo pode ser substituído por Gemini ou Groq via `SUSBOT_LLM_PROVIDER`; a barreira de escopo descrita acima vale para os três, porque fica no agente e não no adapter de cada provedor.

## Limites e considerações

- FTP do DATASUS pode ser lento em recortes grandes.
- O plano Free do Supabase limita o tamanho do banco. Por isso:
- Guardamos no Postgres apenas agregações pequenas.
- Guardamos bruto (quando possível) no Storage e com budget por arquivo.

## Dicas de desenvolvimento

- `bash start_dev.sh` sobe apenas o frontend; o backend vem do servidor Ubuntu via `SUSBOT_PROXY_TARGET`.
- A memória pessoal pode ser consultada com `/memoria` e apagada com `/esquecer`. A API autenticada também oferece `GET/DELETE /api/susbot/memoria`; ela nunca recebe um identificador de outro usuário como parâmetro.
- O Quick Tunnel do Cloudflare e o registro do webhook do Telegram saíram do `start_dev.sh` — hoje são responsabilidade do servidor Ubuntu, que tem URL pública fixa.
- O Vite usa `--strictPort`: se a 3000 estiver ocupada ele falha em vez de mudar de porta. Encerre o processo antigo e rode de novo.
- Para forçar re-download (ignorando cache), envie `usar_cache=false` no `POST /api/download`.
- Para manter o projeto seguro, nunca exponha `SUPABASE_SERVICE_ROLE_KEY`.
