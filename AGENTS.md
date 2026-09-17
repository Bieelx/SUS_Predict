# AGENTS.md — SUS Predict

Projeto acadêmico de startup de um grupo de 5 pessoas da FIAP (TCC 2026). Gabriel é o
cientista de dados do grupo. Banca em 17/09/2026; final em 24/10/2026.

Visão geral, stack, estrutura e como rodar: [readme.MD](./readme.MD).

## Fonte de verdade

`docs/` é ignorado pelo Git (existe só localmente). Quando existir, prevalece:

- `docs/01-produto.md` — tese, personas, telas e regras de produto
- `docs/02-arquitetura.md` — infra Azure, dados, auth/perfis, Clara, registros locais,
  inputs operacionais, endpoints
- `docs/03-status.md` — feito, pendente e decisões que mudaram

`docs/_arquivo/` é só histórico (inclui `docs/telas/`, superado). Visual:
[DESIGN.md](./DESIGN.md); tom e princípios: [PRODUCT.md](./PRODUCT.md).

## Mapa rápido

| Assunto | Onde |
|---|---|
| Shell, rotas, sidebar, tema | `frontend/src/App.jsx`, `frontend/src/shared/ui.jsx` (`THEMES`) |
| Telas | `frontend/src/pages/*` (Visão Geral e Insumos reexportam `shared/RupturaReal.jsx`) |
| Dados das telas | `api/core/operational_router.py` → `/api/dados/*` (Supabase curado) |
| Clara | `api/core/susbot_*.py`, `prompts.py`, `clara_input_flow.py`, `clara_model_policy.py`, `conversation_*.py`; front `pages/ClaraPanel.jsx`, `shared/susbot*.js` |
| Canais | `api/core/channel_router.py` (Telegram, WhatsApp/OpenWA), `audio_transcription.py` |
| Registros locais | `api/core/local_records_*`; tela `pages/RegistrosUnidade.jsx`, `features/registros-locais/` |
| Inputs operacionais | `api/core/operational_inputs_*`, `gemini_input_interpreter.py`; tabelas `*_usuario` → triggers `*_estabelecimento` |
| Auth e perfis | `api/core/auth.py`, `permissoes.py`, `identidade.py`, `admin_router.py` |
| Predição | `api/core/prediction.py` (Holt → OLS, surto por MAD; sem Prophet) |
| Banco | `api/core/db.py` (SQLite `api/sus_predict.db` + Supabase), `supabase/migrations/` |
| Deploy | `deploy/azure-update.sh` + `suspredict-update.timer` (auto pela `main`) |
| Pipeline de dados | `pipeline/` (notebooks Databricks) |

Legado removido em 14/09/2026 (PySUS, rotas de job, `/api/dengue/*`). Restam em `api/main.py`
`/api/sistemas`, `/estados`, `/cidades`, `/overview`, `/runs` sem uso no frontend.

## Como rodar

```bash
bash start_dev.sh                          # só frontend, porta 3000, proxy /backend
uvicorn api.main:app --reload --port 8000  # backend local, a partir da raiz, venv ativo
venv/bin/python -m pytest api/tests -q     # testes backend
cd frontend && npm test                    # testes unitários frontend
```

Endpoint novo no backend só vale em produção depois do push na `main` (deploy automático).
Migrations do Supabase não rodam no deploy.

## Regras

- **Python 3.12** no `venv/`. Não recriar com 3.13+.
- **Nunca somar registro local ao dado oficial.** Escrita da Clara só após confirmação
  humana; na web a confirmação é pela tela, nos canais com `CONFIRMO`.
- **Autorização em duas cópias** (SQLite da VM e Supabase `usuarios_acesso`): falta em
  qualquer uma = 403. Curinga de município `"*"` só para admin.
- Tabelas Supabase: RLS ligada, sem policy, só o backend acessa com chave secreta. Não
  usar `public.user_roles`/`has_role` (painel externo).
- Não hardcodar credenciais; não commitar `.env`, `exports/`, `temp_data/`, `*.db`.
- Job em andamento fica em memória; resultado pronto é persistido. Não confundir.
- Não usar `npm run build` durante desenvolvimento (só `npm run dev`); o deploy faz o build.

## Convenções

- **Python:** snake_case, docstrings em PT-BR, sem tipagem obrigatória.
- **React:** componentes em PascalCase; uma tela por arquivo em `pages/`; estilos com CSS e
  variáveis de tema (Tailwind só residual).
- **Commits:** em português, descritivos.
- **Números:** `.toLocaleString('pt-BR')` (helpers em `shared/formatters.js`).
- **Datas:** ISO 8601 no backend; DD/MM/AAAA no frontend.

## Imported Claude Cowork project instructions

Esse projeto é uma startup que estou construindo com meu grupo da faculdade, estamos atualmente em 5 e estou na função de cientista de dados
