# 🏥 SUS Predict — FIAP TCC 2025/2026

Aplicação web para **extrair dados públicos do DATASUS (via PySUS)**, **tratar/agregar**, **publicar no Supabase** quando configurado e oferecer um **dashboard React** com análises, previsão e o **SusBot** (chat contextual).

O foco atual do projeto é **São Paulo/SP** (município: **São Paulo**, IBGE **3550308**), mas a arquitetura já suporta evoluir para mais cidades.

## Visão geral (fluxo)

- Você escolhe **categoria (SIM/SIH/SINASC/SIA/SINAN)**, localização e período.
- O backend baixa os dados reais via **FTP do DATASUS** usando **PySUS** (Python 3.12).
- O backend calcula agregações e previsão e retorna um `resultado.json`.
- O backend também expõe o SusBot, que consulta conversas, estoque e alertas no banco local/Supabase quando disponíveis.
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

- `GEMINI_API_KEY`: necessária para o SusBot responder com LLM real.
- `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (ou a chave legada `SUPABASE_ANON_KEY`): obrigatórias para login.
- `SUPABASE_SECRET_KEY` (ou a chave legada `SUPABASE_SERVICE_ROLE_KEY`): obrigatória no backend para roles, convites e persistência.

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

### Opção A) Tudo junto (recomendado)

```bash
bash start_dev.sh
```

O script:

- Ativa `venv/` automaticamente.
- Carrega variáveis do `.env` (se existir) e exporta para o processo.
- Instala dependências do backend se necessário.
- Sobe FastAPI em `http://localhost:8000`.
- Sobe frontend em `http://localhost:3000`.
- Mata processos antigos nas portas `8000`, `3000` e `3001` antes de subir.

### Opção B) Separado

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

## Autenticação e autorização

O dashboard exige uma sessão Supabase válida com a role de negócio `admin`. A
existência de uma string no navegador não libera nenhuma tela, e todas as rotas
`/api/*` (exceto o fluxo público de autenticação) são validadas no backend.

- Não existe cadastro público.
- Novos usuários são convidados por um Admin na aba **Perfil do Usuário**.
- Access e refresh tokens permanecem em cookies `HttpOnly`; não são gravados no `localStorage`.
- O modo dev é desligado por padrão, não aparece no frontend e é recusado em produção.

O tutorial completo do painel, SQL, primeiro Admin, SMTP e recuperação de senha
está em [`supabase/SETUP.md`](supabase/SETUP.md).

## Supabase (cache + organização)

O Supabase é usado para evitar re-download e manter os dados tratados organizados.

### Segurança

- Nunca use `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nunca comite `.env`.
- Se uma chave vazar, rotacione imediatamente no Supabase.

### 1) Criar schema no Supabase (SQL)

No Supabase, abra `SQL Editor` e rode, nesta ordem:

- `supabase/schema.sql`
- `supabase/auth.sql`

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
- `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`)
- `FRONTEND_URL`
- `AUTH_REDIRECT_URL`
- `CORS_ALLOWED_ORIGINS`
- `SUPABASE_BUCKET_RAW` (default: `datasus-raw`)
- `SUPABASE_ENABLE_RAW_UPLOAD` (default: `true`)
- `SUPABASE_RAW_MAX_BYTES` (default: `250000000`)
- `SUPABASE_ENABLE_CACHE_READ` (default: `true`)

Exemplo:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
FRONTEND_URL=http://localhost:3000
AUTH_REDIRECT_URL=http://localhost:3000/auth/update-password
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SUPABASE_BUCKET_RAW=datasus-raw
SUPABASE_ENABLE_RAW_UPLOAD=true
SUPABASE_RAW_MAX_BYTES=250000000
SUPABASE_ENABLE_CACHE_READ=true
```

Se as chaves de autenticação não estiverem definidas, o backend falha fechado com
`503`; ele não cria mais uma sessão local silenciosamente.

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
- Login e recuperação de senha (sem cadastro público).
- Dashboard das telas do redesenho.
- Painel flutuante do SusBot.
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

Todos os endpoints abaixo exigem sessão Admin:

- `POST /api/download`: inicia um job de download/processamento (com cache opcional).
- `GET /api/status/{job_id}`: progresso e status.
- `GET /api/resultado/{job_id}`: resultado final (JSON).
- `GET /api/export/{job_id}`: export XLSX.
- `GET /api/runs`: lista runs no Supabase (para mapa/filtros).

## Limites e considerações

- FTP do DATASUS pode ser lento em recortes grandes.
- O plano Free do Supabase limita o tamanho do banco. Por isso:
- Guardamos no Postgres apenas agregações pequenas.
- Guardamos bruto (quando possível) no Storage e com budget por arquivo.

## Dicas de desenvolvimento

- Use `bash start_dev.sh` para evitar “esquecer” de ativar venv ou carregar `.env`.
- Se o frontend abrir em outra porta, pare os processos antigos e rode `bash start_dev.sh` de novo.
- Para forçar re-download (ignorando cache), envie `usar_cache=false` no `POST /api/download`.
- Para manter o projeto seguro, nunca exponha `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
