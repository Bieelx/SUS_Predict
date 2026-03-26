# CLAUDE.md — SUS Predict

Projeto acadêmico de startup desenvolvido por um grupo de 5 pessoas da FIAP (TCC 2025/2026).
Gabriel é o cientista de dados do grupo.

---

## O que é este projeto

Plataforma web para extração, análise preditiva e visualização de dados públicos de saúde do
DATASUS (sistema de informações do SUS). O usuário seleciona a base de dados, o município e
o período — o sistema baixa os dados, processa e exibe um dashboard interativo com gráficos
e previsões baseadas em regressão linear.

---

## Dois fluxos distintos

**Fluxo de produção** (ainda não ativo — Supabase não configurado):
```
seleciona → baixa via PySUS → sobe no Supabase → dashboard → compacta dados
```

**Fluxo de teste** (implementado e funcional):
```
seleciona → baixa (dados simulados) → dashboard → exclui localmente
```

O código de Supabase já existe em `datasus.py` mas está comentado. Quando o grupo configurar
as credenciais, basta descomentar o bloco `── 8. Supabase` no final de `datasus.py`.

---

## Estrutura de arquivos

```
DataSusScrapper/
│
├── CLAUDE.md                  ← este arquivo
├── datasus.py                 ← extrator CLI original (usa PySUS, roda em terminal)
├── debug.py                   ← script auxiliar de depuração
├── Requirements.txt           ← deps do datasus.py (pysus, pandas, openpyxl, tqdm)
├── readme.MD                  ← documentação do datasus.py para o usuário final
├── start_dev.sh               ← sobe backend + frontend juntos
│
├── exports/                   ← saída do datasus.py (XLSXs exportados)
├── venv/                      ← ambiente virtual Python 3.12 (não modificar)
│
├── api/
│   ├── main.py                ← backend FastAPI (modo de teste com dados simulados)
│   ├── requirements_api.txt   ← fastapi, uvicorn, pydantic
│   └── temp_data/             ← criada em runtime, deletada pelo /api/cleanup
│
└── frontend/
    ├── package.json           ← react 18, recharts, tailwind, vite
    ├── vite.config.js         ← porta 3000, abre browser automaticamente
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── App.jsx            ← componente único: wizard + loading + dashboard
        ├── main.jsx           ← entry point React
        └── index.css          ← @tailwind base/components/utilities + scrollbar
```

---

## Como rodar

```bash
# Tudo junto (recomendado)
bash start_dev.sh

# Separado — Terminal 1: backend
cd api
pip install -r requirements_api.txt
uvicorn main:app --reload --port 8000

# Separado — Terminal 2: frontend
cd frontend
npm install
npm run dev
```

URLs:
- Frontend → http://localhost:3000
- API → http://localhost:8000
- Docs da API → http://localhost:8000/docs

---

## Restrição crítica de Python

**PySUS exige Python 3.12 obrigatoriamente.** Python 3.13+ quebra o pacote `cffi` que o PySUS
depende internamente. O `venv/` do projeto já está criado com 3.12 — nunca recriar com outra
versão. O `api/main.py` (FastAPI) pode rodar com qualquer versão >= 3.10.

---

## Bases de dados suportadas

| Sistema  | Conteúdo                                              | Col. município |
|----------|-------------------------------------------------------|----------------|
| SIM      | Óbitos com causa básica CID-10                        | CODMUNRES      |
| SIH      | Internações hospitalares (AIH), diagnóstico, duração  | MUNIC_RES      |
| SINASC   | Nascidos vivos, peso, Apgar, escolaridade da mãe      | CODMUNNASC     |
| SINAN    | 27 doenças notificáveis (dengue, TB, meningite…)      | ID_MUNICIP     |
| CNES     | Estabelecimentos de saúde, leitos, CNPJ               | CODUFMUN       |
| SIA      | Produção ambulatorial (apenas na interface web)       | —              |

A interface web expõe SIM, SIH, SINASC e SIA. SINAN e CNES estão apenas no CLI (`datasus.py`).

---

## Backend FastAPI — `api/main.py`

### Endpoints

| Método | Rota                    | Descrição                                      |
|--------|-------------------------|------------------------------------------------|
| GET    | /api/sistemas           | Lista os 4 sistemas disponíveis                |
| GET    | /api/estados            | Lista os 27 estados brasileiros                |
| GET    | /api/cidades/{uf}       | Lista municípios pré-cadastrados por UF        |
| POST   | /api/download           | Inicia job em background, retorna `job_id`     |
| GET    | /api/status/{job_id}    | Status do job (pending/running/done/error)     |
| GET    | /api/resultado/{job_id} | Resultado completo em JSON (só se done)        |
| DELETE | /api/cleanup/{job_id}   | Apaga temp_data/{job_id} e remove job da memória|

### Padrão de job assíncrono

O download pode demorar minutos, então usa BackgroundTasks do FastAPI:
1. POST retorna `job_id` imediatamente
2. Frontend faz polling de `GET /api/status/{job_id}` a cada 800ms
3. Quando `status === "done"`, frontend busca `GET /api/resultado/{job_id}`

Jobs ficam em memória (`dict`). Em produção, substituir por Redis ou banco.

### Dados reais e fallback sintético

`processar_download()` em `api/main.py` detecta em runtime se PySUS está disponível:
- **PySUS disponível** → baixa dados reais do FTP do DATASUS ano a ano, filtra pelo código IBGE,
  extrai distribuição de sexo e faixa etária do DataFrame real.
- **PySUS indisponível** → gera dados sintéticos com tendências realistas:
  - SIM: +1,8%/ano | SIH: +1,5%/ano | SINASC: -1,2%/ano | SIA: +2,5%/ano

O ranking de UFs é sempre sintético (baixar 27 estados seria inviável por requisição).

**Para rodar com dados reais:** usar o `venv/` do projeto (Python 3.12 + PySUS instalado).
O `api/main.py` adiciona o diretório raiz ao `sys.path` e importa `to_df` de `datasus.py`.

### Modelo preditivo

Dois modelos com detecção automática em runtime (`gerar_predicao()`):

1. **Prophet** (primário, se disponível e ≥ 3 pontos de dados):
   - Sazonalidades desativadas para dados anuais
   - `changepoint_prior_scale=0.05` (suaviza mudanças com poucos pontos)
   - `uncertainty_samples=500` → retorna `yhat_lower` e `yhat_upper` (IC 80%)
   - O frontend exibe banda de confiança como linhas tracejadas âmbar com baixa opacidade

2. **OLS** (fallback, Python puro sem dependências):
   - Regressão linear simples sobre anos × totais
   - `lower` e `upper` retornados como `null` → frontend esconde banda de IC

O campo `resultado.meta.modelo` informa ao frontend qual foi usado.
O campo `resultado.meta.dados_reais` informa se os dados são do DATASUS ou sintéticos.
O frontend exibe badges coloridos no cabeçalho do dashboard para ambos.

### Payload de resultado

```json
{
  "meta":     { "sistema", "uf", "cidade", "ibge", "ano_ini", "ano_fim", "gerado_em" },
  "stats":    { "total", "media_anual", "variacao_pct", "anos_analisados", "prox_previsao" },
  "serie_temporal":          [{ "ano", "total", "tipo": "real" }],
  "serie_com_previsao":      [{ "ano", "total", "tipo": "real"|"previsto" }],
  "ranking_ufs":             [{ "uf", "total" }],
  "distribuicao_sexo":       [{ "sexo", "pct" }],
  "distribuicao_faixa_etaria": [{ "faixa", "pct" }],
  "top_causas":              [{ "causa", "pct" }]
}
```

---

## Frontend React — `frontend/src/App.jsx`

Arquivo único de ~730 linhas. Stack: React 18 + Tailwind v3 + Recharts + Vite.

### Máquina de estados

Controlada por `step` (1–3) e `jobStatus` (`idle | running | done | error`):

```
jobStatus idle  + step 1 → Step1 (seleção de sistema)
jobStatus idle  + step 2 → Step2 (localização + período)
jobStatus idle  + step 3 → Step3 (confirmação)
jobStatus running        → LoadingScreen (barra de progresso + checklist)
jobStatus done           → Dashboard (4 gráficos + cards + cleanup)
jobStatus error          → Tela de erro
```

### Componentes principais

- `StepIndicator` — breadcrumb visual dos 3 passos do wizard
- `Step1` — cards de seleção de sistema (SIM/SIH/SINASC/SIA)
- `Step2` — selects de estado/cidade + inputs de ano, com IBGE automático
- `Step3` — resumo dos parâmetros + botão de confirmação
- `LoadingScreen` — barra de progresso + checklist de etapas animado
- `Dashboard` — 4 gráficos Recharts + stat cards + botão cleanup
- `CustomTooltip` — tooltip padronizado, formata números em pt-BR

### Gráficos (Recharts)

1. **LineChart** — série temporal + previsão (duas linhas: azul sólida = real, âmbar tracejada = previsto)
2. **BarChart horizontal** — ranking top 10 UFs por volume
3. **BarChart vertical** — distribuição por faixa etária (%)
4. **PieChart donut** — distribuição por sexo (%) + top causas em barras inline

O gráfico 1 usa dois `<Line>` no mesmo chart com ponto de conexão duplicado para a linha de
previsão começar no último ponto real (transição suave).

### Identidade visual por sistema

Definida em `SISTEMA_META` no topo do App.jsx:
```js
SIM:    { accent: '#ef4444' }  // vermelho
SIH:    { accent: '#3b82f6' }  // azul
SINASC: { accent: '#10b981' }  // verde
SIA:    { accent: '#8b5cf6' }  // roxo
```
Para mudar a cor de um sistema, alterar apenas este objeto.

---

## Convenções de código

- **Python**: snake_case, docstrings em PT-BR, sem tipagem obrigatória no MVP
- **React**: componentes em PascalCase, sem arquivos separados por componente no MVP
- **Commits**: em português, descritivos (`adiciona endpoint de cleanup`, `corrige polling`)
- **Números**: sempre formatar com `.toLocaleString('pt-BR')` no frontend
- **Datas**: ISO 8601 no backend, exibição DD/MM/AAAA no frontend

---

## O que NÃO fazer

- Não recriar o `venv/` com Python 3.13+ — o PySUS vai quebrar
- Não usar `npm run build` durante o desenvolvimento — só `npm run dev`
- Não commitar a pasta `exports/` nem `api/temp_data/` (dados de saúde pública brutos)
- Não hardcodar credenciais do Supabase — usar variáveis de ambiente quando implementar
- Não armazenar jobs em banco de dados ainda — o dict em memória é suficiente para o MVP

---

## Próximos passos do projeto

1. ✅ Conectar PySUS real ao `api/main.py` — implementado com detecção automática
2. ✅ Substituir OLS por Prophet — implementado com fallback para OLS
3. Configurar Supabase e descomentar o bloco de upload em `datasus.py`
4. Integrar API do Gemini para geração de insights textuais automáticos no dashboard
5. Adicionar mapa do Brasil por UF (choropleth) no dashboard
6. Autenticação simples para o grupo conseguir usar sem expor a API publicamente
