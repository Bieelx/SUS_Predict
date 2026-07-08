# SusPredict — Análise de Dados

Levantamento do que já existe (backend/pipeline/dado real), o que falta, e o que cada tela
de `docs/telas/` vai precisar para sair do papel. Baseado em leitura direta do código
(`api/core/*.py`, `datasus.py`, `schema.py`) e em teste real de import contra o ambiente
(`venv/`) do projeto — não é suposição, é verificado.

---

## Achado crítico (bloqueante) — PySUS está quebrado no ambiente atual

**O modo de "dados reais" descrito em `CLAUDE.md` e `docs/03-arquitetura.md` não está
funcionando hoje.** Testado diretamente:

```
$ ./venv/Scripts/python.exe -c "from pysus.online_data.SIH import download"
ModuleNotFoundError: No module named 'pysus.online_data'

$ ./venv/Scripts/python.exe -c "from pysus.ftp.databases.sinan import SINAN"
ModuleNotFoundError: No module named 'pysus.ftp'
```

**Causa:** `Requirements.txt` fixa só `pysus>=0.15.0` (sem teto de versão). O `venv/`
atual instalou **pysus 2.3.0**, uma versão que reestruturou completamente a API pública —
não existe mais `pysus.online_data.*` nem `pysus.ftp.databases.*`. A API nova expõe os
sistemas como submódulos de topo: `pysus.sih`, `pysus.sim`, `pysus.sinasc`, `pysus.sia`,
`pysus.sinan`, `pysus.ibge`, `pysus.pni`, `pysus.ciha` (e `pysus.cnes` aparece listado em
`dir(pysus)`, mas falhou ao importar diretamente na checagem rápida — precisa investigar
o padrão de acesso correto depois da correção de versão).

**Consequência:** `api/main.py` tenta os imports antigos, falha silenciosamente, e
`PYSUS_OK = False` — a API roda **sempre em modo sintético**, mesmo em produção. Isso não
aparece como erro visível: os badges de "dados reais/sintéticos" no frontend existem
exatamente para avisar disso (`docs/04-qualidade-dados.md`), mas ninguém precisou reparar
porque o app "funciona" — só que com dado fictício.

**Isso bloqueia todo o resto desta análise.** Nenhuma tela que depende de dado real do
DATASUS (Epidemiologia, Internações, Superlotação, e o próprio SINAN da Visão Geral) pode
ser validada de verdade enquanto isso não for corrigido.

**Ação recomendada (prioridade máxima, antes de qualquer tela nova):**
1. Decidir entre (a) fixar uma versão antiga e compatível do pysus (a que o código foi
   escrito para usar) ou (b) migrar `datasus.py`/`api/main.py` para a API nova do 2.3.0+
   (`pysus.sih.download()`, `pysus.sinan.download()`, etc.)
2. Fixar a versão escolhida em `Requirements.txt` **e** `api/requirements_api.txt` (hoje
   nenhum dos dois tem teto de versão para pysus — é o mesmo tipo de problema que já
   aconteceria de novo em qualquer reinstalação)
3. Testar download real de pelo menos um sistema (ex: SIH de um município pequeno) para
   confirmar que `PYSUS_OK` vira `True` de fato, não só que o import não quebra

---

## Achado importante — custo de internação (SIH) já vem do DATASUS

Corrige uma suposição errada registrada em
[telas/06-analises-nivel2.md](./telas/06-analises-nivel2.md): a tela de Internações
listava "custo por procedimento" como um dado que o DATASUS não fornece, exigindo cadastro
manual. **Isso está errado.**

`schema.py` (usado hoje só pelo CLI `datasus.py`, ver `SIH_COLUNAS`) já mapeia os campos
financeiros reais de cada AIH: `VAL_TOT` (valor total pago), `VAL_SH` (serviços
hospitalares), `VAL_SP` (serviços profissionais), `VAL_UTI`, `VAL_UCI`, `VAL_ORTP`
(órteses/próteses), `VAL_TRANSP`. Também há `CNES` (estabelecimento), `MARCA_UTI` (tipo de
UTI) e `ESPEC` (especialidade do leito) — relevantes para Internações e Superlotação.

**O problema real não é ausência do dado — é que o pipeline da API não lê essas colunas.**
`api/core/constants.py` → `COLS_MINIMAS["SIH"]` mantém só
`["MUNIC_RES", "SEXO", "IDADE", "DIAG_PRINC"]` para economizar RAM
(`api/core/download.py::ler_slim` lê só essas colunas do parquet, de propósito — reduz de
~4GB para ~200MB). É uma escolha de engenharia razoável para o fluxo de teste original,
mas descarta exatamente os campos que a tela de Internações precisa.

**`schema.py` e `api/core/*` são dois pipelines desconectados hoje** — o primeiro (usado
pelo CLI) já trata SINAN e SIH em formato Silver com mapeamento de valores; o segundo
(usado pela API/frontend) tem sua própria lógica mais simples, sem os campos financeiros.

**Ação recomendada:** adicionar `VAL_TOT`, `CNES`, `MARCA_UTI`, `ESPEC` ao
`COLS_MINIMAS["SIH"]`, e escrever uma função de agregação de custo (soma/média de
`VAL_TOT` por grupo de causa e por mês) em `api/core/aggregation.py`. Não é um dado
faltante — é uma coluna não lida ainda.

**Impacto na conversa sobre "Cadastro de Unidades"** ([telas/07](./telas/07-pontos-em-aberto.md)):
a motivação de custo por procedimento para essa tela deixa de existir — o dado já vem do
DATASUS. A ideia de Cadastro de Unidades ainda pode fazer sentido por outro motivo
(capacidade/leitos para Superlotação, ver abaixo), mas não por custo.

---

## Leitura por tela

### 01 — Visão Geral

| | Status |
|---|---|
| Já existe | Previsão Holt/OLS funcional (`/api/resultado/{job_id}`) — uma vez PySUS corrigido |
| Falta | **Índice de Risco composto** (epidemiológico + leitos + estoque + vacinação) — nenhuma agregação assim existe; só o componente epidemiológico (SINAN) tem caminho de dado real hoje |
| Falta | Texto do SusBot (Camada 2) — nenhuma integração Gemini implementada |
| Falta | Lista de alertas acionáveis (Camada 3) — depende da tela 03 existir primeiro |
| Ação | Depende de 02 e 03 estarem ao menos com schema definido antes de fechar o Índice de Risco |

### 02 — Ruptura de Insumos

| | Status |
|---|---|
| Já existe | Nada. Não há tabela de estoque em nenhum lugar (nem SQLite `api/core/db.py`, nem `supabase/schema.sql`) |
| Falta | Schema de estoque (medicamento, quantidade atual, consumo médio, origem, última atualização) |
| Falta | **Protocolo clínico caso→insumo** — a previsão de consumo depende de "quantos casos previstos → quantos insumos necessários", e esse mapeamento não existe em lugar nenhum do projeto. Não é dado do DATASUS — é conhecimento de domínio que precisa ser definido (Gabriel/time clínico) |
| Ação | Esta é a peça de dado mais nova do projeto — não tem precedente em nenhum pipeline existente, precisa ser desenhada do zero |

### 03 — Central de Alertas

| | Status |
|---|---|
| Já existe | Nada persistido — não há tabela de alerta nem máquina de estado (Novo/Em andamento/Resolvido) |
| Falta | Schema de alerta (tipo, estado, origem, evidência, timestamps de transição) |
| Falta | Lógica de geração por tipo: surto (threshold sobre previsão SINAN — mais perto de existir), ruptura (depende de 02), ocupação (depende de Superlotação/CNES, o mais distante) |
| Ação | É o hub que conecta 01, 02, 04 e a Superlotação — vale desenhar o schema antes das outras três, mesmo que a lógica de geração de cada tipo amadureça depois |

### 04 — Gerador de ETP

| | Status |
|---|---|
| Já existe | Nada |
| Falta | Integração Gemini para a justificativa (Etapa 3); geração de PDF; schema de documento (rascunho/finalizado) |
| Ação | Mais simples que 02/03 uma vez que existam — ETP consome dados deles, não gera dado novo próprio |

### 06 — Epidemiologia (SINAN)

| | Status |
|---|---|
| Já existe | Pipeline funcional em `aggregation.py` (`faixa_sinan_de_df`, `causas_de_df`, `sexo_de_df`) — uma vez PySUS corrigido |
| Falta | Agregação **mensal** com sazonalidade (atual × ano anterior × média 5 anos) — hoje `serie_de_df` só agrega por ano, não por mês; comparação de 5 anos não existe |
| Ação | Nova função de agregação mensal + endpoint dedicado |

### 06 — Internações (SIH)

| | Status |
|---|---|
| Já existe | Pipeline SIH funcional — uma vez PySUS corrigido. `DIAS_PERM` (permanência) já vem tratado em `schema.py` |
| Falta | Custo (ver achado acima — só precisa estender `COLS_MINIMAS` e agregar); agregação por grupo de causa com custo médio; origem da AIH (mapear `CAR_INT`/campo correspondente) |
| Ação | Menor esforço relativo dos três de nível 2 — dado já existe na fonte, falta só ler e agregar |

### 06 — Superlotação

| | Status |
|---|---|
| Já existe | Nada. CNES hoje só é baixado pelo CLI (`datasus.py`), grupo **"ST" (estabelecimentos)** — não leitos/capacidade |
| Falta | Confirmar se a API nova do pysus (pós-correção de versão) expõe leitos por especialidade via `pysus.cnes` — não verificado ainda, pysus 2.3.0 lista `cnes` em `dir(pysus)` mas a importação direta falhou na checagem rápida |
| Falta | Cruzamento SINAN (surto previsto) + SIH (tendência) + CNES (capacidade) — nenhuma parte deste cruzamento existe |
| Ação | A mais complexa das seis telas. Depende 100% da correção do PySUS primeiro, e depois de uma investigação dedicada sobre capacidade de leitos no CNES — se o dado de leitos não estiver disponível ou for pouco confiável, a ideia de **Cadastro de Unidades** ([telas/07](./telas/07-pontos-em-aberto.md)) volta a fazer sentido, mas para capacidade, não para custo |

---

## Resumo de prioridade

1. **Corrigir a versão do PySUS** — bloqueia tudo que depende de dado real (praticamente
   todas as telas, em algum grau)
2. **Estender `COLS_MINIMAS["SIH"]` com os campos financeiros** — ganho rápido, desbloqueia
   os KPIs de custo de Internações sem trabalho novo de coleta
3. **Desenhar o schema de Alertas** — é o hub que as outras telas (Visão Geral, Insumos,
   ETP) dependem para funcionar de ponta a ponta
4. **Desenhar o schema de Estoque + definir o protocolo clínico caso→insumo** — é a peça
   sem nenhum precedente no projeto, então é a que mais exige decisão de domínio (não só
   engenharia)
5. **Investigar capacidade de leitos no CNES** (pós-correção do PySUS) — determina se
   Superlotação é viável com dado público ou precisa de Cadastro de Unidades
