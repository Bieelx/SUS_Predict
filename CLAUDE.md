# CLAUDE.md — SUS Predict

Projeto acadêmico de startup desenvolvido por um grupo de 5 pessoas da FIAP (TCC 2026).
Gabriel é o cientista de dados do grupo.

---

## Redesenho de telas em andamento — leia antes de mexer no frontend

O frontend (`frontend/src/App.jsx`) está passando por um redesenho completo de produto.
**A fonte de verdade para qualquer tela nova ou alterada é `docs/telas/`**, não o código
atual do `App.jsx` nem a seção "Frontend React" mais abaixo neste arquivo (que descreve a
versão anterior, hoje obsoleta).

Contexto: o `App.jsx` atual (~1860 linhas) é um protótipo visual de alta fidelidade com
**dados 100% mockados** (arrays estáticos no topo do arquivo, sem nenhuma chamada à API) —
inclui Visão Geral, Epidemiologia SINAN e Internações SIH já com layout e gráficos, mais
Ruptura de Insumos/Alertas/Superlotação como placeholders "Em desenvolvimento". Decisão do
grupo: **esse protótipo não será reaproveitado.** A Visão Geral em particular reproduz o
padrão de BI descritivo (4 KPIs soltos + gráfico + gauge + mapa hexagonal + donut) que o
redesenho existe para corrigir — o produto deve responder "eu preciso agir hoje, e em quê",
não só mostrar dado.

O redesenho está documentado tela por tela em `docs/telas/` (ver
[docs/telas/README.md](./docs/telas/README.md)), com casos de uso, wireframes textuais e
uma auditoria de consistência entre telas já validada com o grupo. `DESIGN.md` na raiz
descreve o design system do protótipo antigo — os tokens visuais podem servir de ponto de
partida, mas a estrutura de páginas ali (seção "Pages") está superada pelas telas em
`docs/telas/`.

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
│   ├── requirements_api.txt    ← dependências de runtime da API
│   ├── requirements_dev.txt    ← pytest + dependências de desenvolvimento
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
# Se for rodar testes: pip install -r requirements_dev.txt
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

Para usar o SusBot com Gemini, exporte também `GEMINI_API_KEY` antes de subir a API.
Sem essa variável, o backend continua subindo, mas o agente fica sem o LLM real.

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

A API já expõe SINAN também (`/api/sistemas`, `/api/doencas`), mas o protótipo web atual
não usa esses endpoints (dados mockados — ver seção de redesenho no topo deste arquivo).
CNES segue disponível apenas no CLI (`datasus.py`).

---

## Backend FastAPI — `api/main.py`

### Endpoints

| Método | Rota                    | Descrição                                      |
|--------|-------------------------|------------------------------------------------|
| GET    | /api/sistemas           | Lista os 5 sistemas disponíveis (SIM, SIH, SINASC, SIA, SINAN) |
| GET    | /api/doencas            | Lista agravos notificáveis do SINAN (requer PySUS) |
| GET    | /api/capacidades        | Flags de runtime (`pysus_ok`, `prophet_ok`)     |
| GET    | /api/ano_limite         | Ano máximo confiável por sistema                |
| GET    | /api/estados            | Lista os 27 estados brasileiros                |
| GET    | /api/cidades/{uf}       | Lista municípios pré-cadastrados por UF        |
| POST   | /api/download           | Inicia job em background, retorna `job_id`     |
| GET    | /api/status/{job_id}    | Status do job (pending/running/done/error)     |
| GET    | /api/resultado/{job_id} | Resultado completo em JSON (só se done)        |
| GET    | /api/overview/{ibge}    | Agrega últimos resultados de todos os sistemas para um município |
| GET    | /api/runs               | Lista runs persistidos (SQLite/Supabase), para mapa/filtros |
| GET    | /api/export/{job_id}    | Exporta resultado como XLSX                     |
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

Cascade Holt → OLS em `api/core/prediction.py` (`gerar_predicao()`). **Prophet foi
removido do cascade** — em séries epidemiológicas com surtos dominantes (dengue 2024, por
exemplo) ele superajusta os picos e distorce a previsão. Detalhe completo do pipeline
(detecção de surto via MAD, limpeza da série, restauração dos valores reais) em
[docs/03-arquitetura.md](./docs/03-arquitetura.md).

1. **Holt** (primário, ≥ 4 pontos limpos): suavização exponencial dupla em `log1p`, grid
   search de α/β, IC 80% via margem proporcional ao horizonte
2. **OLS** (fallback, < 4 pontos limpos): regressão linear simples em `log1p`, mesma lógica
   de IC

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

## Frontend React — `frontend/src/App.jsx` (em redesenho — ver seção no topo deste arquivo)

Estado atual: arquivo único de ~1860 linhas, React 18 + Recharts + Vite (Tailwind não é
mais o sistema de estilo predominante — o protótipo atual usa CSS-in-JS inline com
variáveis de tema). Sidebar fixa com navegação por páginas (`visao-geral`,
`epidemiologia`, `internacoes`, `vacinal`, `superlotacao`, `insumos`, `alertas`,
`configuracoes`, `perfil`), chat flutuante do SusBot (`<FloatingChat>`) e gate de login
simples (`authed` em `useState`, sem JWT real). **Todos os dados são mock** — nenhuma
página faz `fetch`/`axios` para a API.

Isso **não é a especificação do produto** — é o protótipo visual que está sendo
substituído. A especificação atual, tela por tela, está em `docs/telas/`. Ao implementar
qualquer tela, seguir a estrutura e as regras documentadas lá (camadas, fluxo de estados,
regras de dependência entre telas), não a estrutura do `App.jsx` hoje.

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
- O status de job em andamento (`pending/running/done/error`) segue em dict em memória —
  não precisa de banco para isso. Resultados finalizados **já são persistidos**
  (SQLite sempre; Supabase se configurado — ver `api/core/db.py`), então não confundir os
  dois: job em voo é memória, resultado pronto é banco

---

## Próximos passos do projeto

Lista viva — o detalhamento e a priorização atuais estão em
[docs/README.md](./docs/README.md) (status por camada) e em `docs/telas/` (telas por
tela). Resumo de alto nível:

1. ✅ Conectar PySUS real ao `api/main.py` — implementado com detecção automática
2. ✅ Cascade Holt → OLS com detecção de surto (MAD) — implementado, Prophet removido
3. ✅ Persistência SQLite + Supabase opcional (`api/core/db.py`) — implementado
4. ✅ Redesenho de telas (Visão Geral, Insumos, Alertas, ETP, Análises nível 2) — desenhado
   em `docs/telas/`, aguardando implementação
5. Implementar as telas do redesenho no `App.jsx` (o protótipo mock atual será
   descartado — ver seção de redesenho no topo deste arquivo)
6. Integrar API do Gemini para geração de insights textuais automáticos (SusBot Fase 1,
   Camada 2 de [docs/telas/01-visao-geral.md](./docs/telas/01-visao-geral.md))
7. Autenticação simples para o grupo conseguir usar sem expor a API publicamente
