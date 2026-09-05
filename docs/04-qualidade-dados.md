# SusPredict — Qualidade de Dados

## Por que qualidade de dados é um problema central

O DATASUS é a maior base de dados de saúde pública da América Latina. É também historicamente inconsistente. Erros de digitação, mudanças de layout entre anos, subnotificação e codificações não padronizadas são documentados pela própria SVS/MS e pelo TCU.

A banca avaliadora identificou corretamente esse risco: **consumir dados brutos do DATASUS sem tratamento produz análises incorretas e potencialmente prejudiciais para decisões de gestão pública.**

A camada de qualidade do SusPredict é a resposta técnica a esse problema.

---

## Problemas conhecidos no DATASUS

### Erros de conteúdo

| Exemplo real | Sistema | Causa provável |
|---|---|---|
| Mulheres com CID C61 (câncer de próstata) | SIM, SIH | Erro de digitação ou troca de campo |
| Asma (J45) registrada apenas em São Paulo | SIM | Subnotificação em outros estados, não ausência real |
| Recém-nascidos com 80 anos | SINASC | Campo IDADEMAE mal preenchido |
| CID com letra inválida (ex: "Z00Z") | SIM, SIH | Digitação livre sem validação no sistema de origem |
| Municípios com código IBGE inexistente | Todos | Alterações de municípios não refletidas nos sistemas |

### Erros de codificação

**Idade no SIM e SIH** — o campo `IDADE` usa um sistema proprietário:
- Valores 001–099: dias de vida
- Valores 101–199: meses de vida  
- Valores 301–399: anos (1–99), codificados como 300+anos
- Valores 400–499: anos (40–99), codificados como 400+anos

Isso faz com que a mediana do campo `IDADE` fique em valores acima de 200, o que precisa ser detectado e decodificado antes de qualquer análise de faixa etária.

**Sexo** — diferentes bases usam convenções diferentes:
- `1` / `M` / `m` → Masculino
- `2` / `F` / `f` → Feminino
- `0` / `9` / em branco → ignorado

**SINAN — faixa etária** — usa campo `CS_FAIXA_ETARIA` com código numérico (1–12) mapeando para faixas próprias da vigilância epidemiológica, incompatível com as faixas do SIM/SIH.

### Erros de temporalidade

- **Latência de publicação:** dados do DATASUS chegam com 1-24 meses de atraso dependendo do sistema. Dados "do ano passado" podem estar incompletos
- **Dados preliminares:** competências recentes no SIH e SIM são publicadas como preliminares e podem ser corrigidas nas versões seguintes
- **Instabilidade do FTP:** o FTP do DATASUS tem interrupções documentadas e arquivos corrompidos ocasionais

---

## Camadas de tratamento — O que está implementado

### 1. Limite de ano confiável (`ANO_MAXIMO_CONFIAVEL`)

```python
ANO_MAXIMO_CONFIAVEL = {
    "SINAN":  ano_atual - 1,
    "SIM":    ano_atual - 1,
    "SIH":    ano_atual - 1,
    "SINASC": ano_atual - 1,
    "SIA":    ano_atual - 1,
}
```

O backend rejeita requisições para anos além do limite configurado por sistema. Se o usuário tentar consultar dados preliminares, recebe erro explícito com explicação — em vez de receber dados potencialmente incorretos sem aviso.

### 2. Decodificação de idade (SIM e SIH)

```python
# Detecção automática: se mediana do campo IDADE > 200, aplica decodificação
if sistema in ("SIM", "SIH") and idades.median() > 200:
    def _dec(v):
        v = int(v)
        if v < 300:  return 0           # dias/meses de vida → 0 anos
        return v - 400 if v >= 400 else v - 300  # remove prefixo 3xx ou 4xx
    idades = idades.map(_dec).clip(0, 120)
```

### 3. Normalização de sexo

Mapeamento unificado aplicado antes de qualquer agregação:
```python
mapa_sexo = {
    "1": "Masculino", "M": "Masculino", "m": "Masculino",
    "2": "Feminino",  "F": "Feminino",  "f": "Feminino",
}
# Valores fora do mapa (0, 9, em branco) são descartados via .dropna()
```

### 4. Normalização de município (código IBGE)

Todos os sistemas usam colunas diferentes para o município:

```python
COL_MUNICIPIO = {
    "SIM":   "CODMUNRES",   # 7 dígitos
    "SIH":   "MUNIC_RES",   # 6 dígitos
    "SINASC":"CODMUNNASC",  # 7 dígitos
    "SIA":   "CODUFMUN",    # 6 dígitos
    "SINAN": "ID_MUNICIP",  # 6 dígitos
}
```

O backend usa os primeiros 6 dígitos do código IBGE como chave universal de filtro, garantindo compatibilidade entre sistemas.

### 5. Detecção de surtos epidemiológicos (MAD)

Surtos distorcem modelos preditivos. A detecção por **Median Absolute Deviation** identifica anos estatisticamente anômalos antes do ajuste do modelo:

```python
def _detectar_surtos(serie, threshold=2.0):
    # Requer ≥ 5 pontos não-zero (evita false positives em séries curtas)
    # Ano é flagado quando: MAD z-score > threshold E (ratio > 1.5x ou < 0.4x mediana)
    # A segunda condição evita flagar variância natural em séries estáveis (ex: SINASC)
```

Anos detectados como surto são **interpolados linearmente** para o ajuste do modelo, mas os **valores reais são restaurados no output** — o usuário vê o dado verdadeiro, mas a previsão não é distorcida pelo pico.

### 6. Filtro de registros insuficientes

Se um município não retorna nenhum registro para o sistema e período selecionado, ou se todos os registros retornam zero, o job falha com mensagem explicativa ao usuário — em vez de retornar uma série vazia ou gráfico em branco sem contexto.

### 7. Coluna mínima por sistema (`COLS_MINIMAS`)

Para exportação e persistência, apenas as colunas relevantes de cada sistema são mantidas, reduzindo volume e risco de persistir campos sensíveis desnecessários:

```python
COLS_MINIMAS = {
    "SIM":    ["CODMUNRES", "SEXO",  "IDADE",    "CAUSABAS"],
    "SIH":    ["MUNIC_RES", "SEXO",  "IDADE",    "DIAG_PRINC"],
    "SINASC": ["CODMUNNASC","SEXO",  "IDADEMAE", "PARTO"],
    "SIA":    ["CODUFMUN",  "SEXO",  "PA_PROC_ID"],
    "SINAN":  ["ID_MUNICIP","CS_SEXO","CS_FAIXA_ETARIA","CLASSI_FIN"],
}
```

---

## Camada Silver — O que está planejado (Databricks)

A camada Silver do pipeline ETL (em desenvolvimento com Gabriel) aplicará regras de validação mais amplas antes que os dados cheguem à API:

| Regra | Descrição |
|---|---|
| Validação de CID-10 | Rejeitar códigos inválidos (padrão `[A-Z][0-9]{2}(\.[0-9]{1,2})?`) |
| Cruzamento de sexo × CID | Alertar/descartar combinações biologicamente impossíveis (ex: C61 em mulheres) |
| Validação de faixa etária | Rejeitar idades > 120 anos ou negativas após decodificação |
| Completude mínima | Registros sem município IBGE válido são descartados |
| Deduplicação | Identificar e remover registros duplicados por chave natural de cada sistema |
| Log de descarte | Cada registro descartado é logado com motivo — permite auditoria e revisão das regras |

---

## O que o SusPredict NÃO faz

- **Não imputa valores faltantes de conteúdo** (ex: não "inventa" o sexo de um registro sem sexo). Registros inválidos são descartados.
- **Não corrige subnotificação** (ex: a dengue subnotificada não aparece nos dados — o sistema trabalha com o que foi notificado).
- **Não garante que os dados do DATASUS são corretos** na fonte. O tratamento remove inconsistências detectáveis, mas erros não detectáveis (ex: CID errado mas válido) chegam à análise.

---

## Como a qualidade é comunicada ao usuário

O frontend exibe badges no dashboard indicando:
- **Dados reais / Dados sintéticos** — se PySUS estava disponível no momento da análise
- **Ano máximo confiável** — aviso quando o período selecionado inclui dados preliminares
- **Modelo usado** — Holt, OLS ou outro — com implicações para a largura do intervalo de confiança
- **Surtos detectados** — anos identificados como estatisticamente anômalos são sinalizados no gráfico temporal

Transparência sobre limitações dos dados é parte da proposta de valor — o gestor precisa saber em que base está tomando decisões.
