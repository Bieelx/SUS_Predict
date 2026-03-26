## Setup Supabase (SUS Predict)

### 1) Segurança (obrigatório)
- Nunca use `service_role` no frontend.
- Se uma `service_role key` for exposta, trate como comprometida e rotacione no Supabase.

### 2) Banco (tabelas tratadas)
1. Abra o SQL Editor do Supabase.
2. Rode o arquivo `supabase/schema.sql`.

Isso cria tabelas pequenas (agregadas) para não estourar os `0.5 GB` do Free Plan.

### 3) Storage (bruto compactado)
1. Crie um bucket no Storage (ex: `datasus-raw`).
2. O backend vai tentar subir `csv.gz` (colunas mínimas) respeitando o budget `SUPABASE_RAW_MAX_BYTES`.

### 4) Variáveis de ambiente
1. Copie `.env.example` para `.env`.
2. Preencha:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 5) Rodar
Use `bash start_dev.sh`. Ele carrega `.env` automaticamente se existir.

