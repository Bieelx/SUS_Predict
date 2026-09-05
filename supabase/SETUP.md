## Setup Supabase (SUS Predict)

### 1) Segurança (obrigatório)
- Nunca use `service_role` no frontend.
- Se uma `service_role key` for exposta, trate como comprometida e rotacione no Supabase.

### 2) Banco (tabelas tratadas)
1. Abra o SQL Editor do Supabase.
2. Rode o arquivo `supabase/schema.sql`.

Isso cria tabelas pequenas (agregadas) para não estourar os `0.5 GB` do Free Plan.

### 2b) Identidade e permissões (docs/09) — ordem obrigatória, ANTES do deploy
Rode no SQL Editor, nesta ordem:
1. `supabase/usuarios_acesso.sql` — tabela de perfil/ativo/municipios, RLS ligada, sem policy.
2. `supabase/seed_usuarios_acesso.sql` — os UUIDs do grupo (admin só aqui, nunca pela tela).
3. `supabase/usuarios_acesso_log.sql` — trilha append-only da tela de administração, RLS ligada, sem policy.
4. `supabase/susbot_canais.sql` — tabelas `susbot_*`/`canal_*` que o sync espera.

Só depois: deploy do código no Ubuntu e restart. O SQLite do Ubuntu continua sendo o que
o backend lê (`init_db()` cria as tabelas locais no boot); o Supabase recebe cópia via
sync best-effort. Se o código subir antes do SQL, o login continua funcionando (lê SQLite),
mas cada escrita em `usuarios_acesso`/`usuarios_acesso_log` gera só um WARNING
"Supabase sync failed" e a cópia no Postgres fica faltando — sem trilha de auditoria fora
do servidor. Trate como bloqueante do deploy.

Conferência pós-SQL, um comando (schema, publicável barrada, secreta lê e escreve):
```bash
source venv/bin/activate && python scripts/supabase_acesso.py verificar
```
Prova de que o sync voltou, depois de alterar um perfil pela tela:
```bash
python scripts/supabase_acesso.py provar --uuid <UUID alterado> --api $SUSBOT_PROXY_TARGET --email <admin>
```
Idempotência: os `create table if not exists` são reexecutáveis. O **seed** também roda de
novo sem erro, mas **sobrescreve** perfil/ativo/atribuido_por dos 3 UUIDs listados —
qualquer alteração feita pela tela nesses 3 é desfeita. Rode o seed uma vez só.

### 3) Storage (bruto compactado)
1. Crie um bucket no Storage (ex: `datasus-raw`).
2. O backend vai tentar subir `csv.gz` (colunas mínimas) respeitando o budget `SUPABASE_RAW_MAX_BYTES`.

### 4) Variáveis de ambiente
1. Copie `.env.example` para `.env`.
2. Preencha:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 5) Rodar
O `.env` da raiz é lido pelo backend, que roda no servidor Ubuntu — é lá que estas
variáveis precisam estar. Para rodar o backend localmente:
`source venv/bin/activate && cd api && uvicorn main:app --reload --port 8000`
(o `start_dev.sh` sobe apenas o frontend).

