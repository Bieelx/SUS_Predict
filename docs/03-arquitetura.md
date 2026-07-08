# SusPredict — Arquitetura Técnica

## Visão geral

A arquitetura do SusPredict é organizada em quatro camadas desacopladas:

```
DATASUS (FTP público)
        ↓
[Camada de Ingestão] — PySUS / AWS Batch (jobs diários)
        ↓
[Camada de Processamento] — Databricks / PySpark — Medallion (Bronze → Silver → Gold)
        ↓
[Camada de Aplicação] — FastAPI + LangGraph (SusBot) — Amazon EKS
        ↓
[Camada de Entrega] — React (web) + WhatsApp Business API + SES (e-mail)
```

---

## Duas arquiteturas: visão de produção vs. deploy real do TCC

Este documento descreve **duas coisas diferentes** e é importante não confundi-las na frente da banca:

1. **Arquitetura de visão (produção em escala)** — a seção [Infraestrutura AWS](#infraestrutura-aws-visão-de-produção-em-escala) mais abaixo. É o desenho de como o SusPredict rodaria como startup real, atendendo centenas de municípios com SLA, HA e compliance. Não está implantada — é a resposta para "como isso escalaria".
2. **Deploy real do TCC (MVP)** — a seção [Infraestrutura real de deploy](#infraestrutura-real-de-deploy-tcc--mvp) logo abaixo. É onde o sistema efetivamente roda hoje para demonstração/avaliação: **Vercel (frontend) + Railway (backend) + Supabase (banco)**, com custo próximo de zero.

A lógica do produto (ingestão PySUS, modelos Holt/OLS, endpoints FastAPI) é a mesma nos dois cenários — o que muda é só onde e como isso é hospedado.

---

## Infraestrutura real de deploy (TCC — MVP)

| Camada | Serviço | Função |
|---|---|---|
| Frontend | **Vercel** | Build estático do React/Vite (`frontend/`), deploy automático via Git, HTTPS e CDN inclusos |
| Backend | **Railway** | Hospeda o FastAPI (`api/main.py`) como serviço web, build via Nixpacks/Docker, variáveis de ambiente para credenciais |
| Banco de dados | **Supabase** | Postgres gerenciado — usado para o bloco de sincronização já existente (comentado) em `datasus.py`; também serve autenticação simples se implementada |

### Por que essa combinação

- **Custo:** Vercel (plano Hobby) e a camada gratuita do Supabase cobrem o projeto inteiro sem custo. Railway não tem mais free tier permanente — hoje dá ~$5 de crédito de trial e depois cobra por uso; para um backend leve, ligado só durante demonstrações/avaliação, o custo real fica na casa de poucos dólares por mês.
- **Simplicidade:** deploy por push no Git, sem Kubernetes, sem VPC, sem gestão de infraestrutura — adequado ao escopo e ao prazo de um TCC.
- **Compatibilidade:** o backend já detecta em runtime se Supabase está configurado (`Supabase → sincronização opcional via variáveis de ambiente`, ver seção de Camada de aplicação) — não exige mudança de código, só configurar as env vars de conexão.

### Limitações conhecidas (importante ser transparente com a banca)

- **Residência de dados:** Railway e Vercel não garantem região `sa-east-1`; os dados tratados aqui são públicos e agregados (sem identificação de paciente — ver seção de Segurança), então o requisito de soberania de dados do Ministério da Saúde citado na arquitetura de produção não se aplica ao MVP.
- **Cold start:** dependendo do plano, o backend no Railway pode hibernar após inatividade — primeira requisição após um tempo parado pode demorar alguns segundos.
- **Sem HA/Multi-AZ:** ao contrário do RDS Aurora da arquitetura de visão, o Supabase free tier é single-region e sem failover automático — aceitável para demonstração, não para produção real.

---

## Stack de tecnologias

| Camada | Tecnologias |
|---|---|
| Frontend | React 18, Tailwind CSS v3, Recharts, Vite, React Router, Axios |
| Backend | Python 3.12, FastAPI, Pydantic, PySUS, Pandas, NumPy |
| ML / Predição | Prophet (sazonal), XGBoost (variáveis exógenas), Holt (séries temporais), OLS (fallback) |
| Engenharia de dados | Apache Spark / PySpark, Databricks, Delta Lake |
| Banco analítico | Amazon S3 (Parquet — Medallion), Amazon RDS Aurora PostgreSQL (PostGIS) |
| IA conversacional | LangGraph, modelos de linguagem (LLM — planejado) |
| Infraestrutura | AWS (sa-east-1 — São Paulo) |
| Observabilidade | Amazon CloudWatch, AWS CloudTrail, Amazon GuardDuty |

---

## Camada de ingestão

Jobs diários via **AWS Batch** utilizam a biblioteca **PySUS** para conectar ao FTP público do DATASUS (`ftp.datasus.gov.br`) e baixar arquivos `.DBC` das bases:

| Base | Conteúdo | Coluna município |
|---|---|---|
| SINAN | Doenças notificáveis (dengue, TB, meningite e +24 agravos) | `ID_MUNICIP` |
| SIH | Internações hospitalares (AIH) | `MUNIC_RES` |
| CNES | Estabelecimentos de saúde, leitos, capacidade instalada | `CODUFMUN` |
| PNI | Cobertura vacinal por imunobiológico e UBS | — |

Dados são armazenados na **camada Bronze** do S3 em formato Parquet, particionados por UF e competência (mês/ano), sem transformação — garantindo rastreabilidade e possibilidade de reruns.

**Restrição técnica importante:** PySUS exige Python 3.12. Python 3.13+ quebra o pacote `cffi` que o PySUS usa internamente. O `venv/` do projeto está configurado com 3.12 e não deve ser recriado com outra versão.

---

## Camada de processamento — Arquitetura Medallion

### Bronze (dados brutos)
- Arquivos DBC do DATASUS convertidos para Parquet
- Sem transformação — dados exatamente como chegam do DATASUS
- Particionamento: `/bronze/{sistema}/{uf}/{ano_mes}/`

### Silver (dados limpos)
- Limpeza e padronização aplicadas (ver [04-qualidade-dados.md](./04-qualidade-dados.md) para detalhes)
- CID-10 decodificado e padronizado
- Municípios normalizados por código IBGE (6 dígitos)
- Campos de idade decodificados (formato DATASUS → anos reais)
- Campos de sexo normalizados (`1/M/m → Masculino`, `2/F/f → Feminino`)
- Registros inválidos descartados com log de auditoria
- Particionamento: `/silver/{sistema}/{uf}/{ano}/`

### Gold (dados analíticos)
- Previsões dos modelos Prophet e XGBoost rodando na camada Silver
- Indicadores agregados por município, semana epidemiológica, CID-10
- Índice de Risco composto (epidemiológico + capacidade + estoque + vacinação)
- Replicados no Aurora PostgreSQL para acesso de baixa latência pela API
- Particionamento: `/gold/{municipio_ibge}/{sistema}/`

---

## Camada de aplicação — Backend FastAPI

### Runtime e capacidades

O backend detecta em runtime quais capacidades estão disponíveis:

```python
PYSUS_OK   → dados reais do DATASUS (requer Python 3.12 + venv)
PROPHET_OK → predição avançada com intervalos de confiança
SQLite     → cache local sempre ativo (sem necessidade de Supabase para rodar)
Supabase   → sincronização opcional via variáveis de ambiente
```

### Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/sistemas` | Lista sistemas disponíveis (SIM, SIH, SINASC, SIA, SINAN) |
| GET | `/api/estados` | 27 estados brasileiros |
| GET | `/api/cidades/{uf}` | Municípios por UF via API do IBGE |
| GET | `/api/doencas` | Lista de agravos notificáveis do SINAN |
| GET | `/api/capacidades` | Flags de runtime (pysus_ok, prophet_ok) |
| GET | `/api/ano_limite` | Ano máximo confiável por sistema |
| POST | `/api/download` | Inicia job assíncrono, retorna `job_id` |
| GET | `/api/status/{job_id}` | Status do job (pending/running/done/error) |
| GET | `/api/resultado/{job_id}` | Resultado completo em JSON |
| GET | `/api/overview/{ibge}` | Agrega últimos resultados de todos os sistemas para um município |
| GET | `/api/export/{job_id}` | Exporta resultado como XLSX |
| DELETE | `/api/cleanup/{job_id}` | Remove dados temporários e job da memória |

### Padrão de job assíncrono

Downloads do DATASUS podem demorar vários minutos:

1. `POST /api/download` retorna `job_id` imediatamente
2. Frontend faz polling em `GET /api/status/{job_id}` a cada 800ms
3. Quando `status === "done"`, frontend busca `GET /api/resultado/{job_id}`
4. `DELETE /api/cleanup/{job_id}` limpa os dados temporários ao final

---

## Modelos preditivos

### Pipeline de predição

```
Série histórica bruta
        ↓
Detecção de surtos (MAD)   ← identifica anos com desvio estatístico
        ↓
Limpeza da série (interpolação de surtos para o ajuste)
        ↓
Cascade de modelos:
  ≥ 4 pontos limpos → Holt (suavização exponencial dupla em log1p)
  < 4 pontos limpos → OLS (regressão linear em log1p)
        ↓
Restauração dos valores reais nos pontos históricos
        ↓
Previsão + intervalos de confiança (80%)
```

### Detecção de surtos via MAD

Surtos epidemiológicos (como o de dengue em 2024) distorcem o ajuste do modelo se não forem tratados. A detecção usa **Median Absolute Deviation**:

- Requer ≥ 5 pontos não-zero para evitar false positives em séries curtas
- Um ano é marcado como surto quando: MAD z-score > 2,0 **e** razão ao mediano > 1,5× ou < 0,4×
- Anos marcados são substituídos por interpolação linear para o ajuste, mas os valores reais são restaurados no output

### Modelo Holt (primário — ≥ 4 pontos)

Suavização exponencial dupla (nível + tendência) aplicada em `log1p` para estabilizar variância:
- Grid search de α e β em `[0.2, 0.35, 0.5, 0.65, 0.8]`
- Parâmetros selecionados pelo menor MSE de resíduos
- Intervalo de confiança: `margem = 1.28 × σ_resíduos × (1 + i × 0.12)` para cada horizonte `i`

### Modelo OLS (fallback — < 4 pontos)

Regressão linear simples em `log1p(total)` vs. ano:
- Intervalo de confiança: `margem = 1.28 × σ_resíduos × (1 + i × 0.15)` para cada horizonte `i`
- Retorna `lower` e `upper` — frontend exibe banda de confiança

### Por que Prophet foi removido

Prophet foi removido do cascade após testes. Em séries epidemiológicas com surtos dominantes (dengue 2024, p.ex.), o Prophet superajusta os picos e produz previsões distorcidas. Holt com detecção de surtos é mais robusto para dados anuais com poucos pontos.

---

## Infraestrutura AWS (visão de produção em escala)

> Esta seção descreve como o SusPredict escalaria como startup real — **não é o ambiente onde o TCC está hospedado hoje** (ver [Infraestrutura real de deploy](#infraestrutura-real-de-deploy-tcc--mvp) acima).

| Serviço | Função |
|---|---|
| Amazon EKS | Orquestração de containers (Kubernetes) — 3 deployments: api-core, etl-worker, ml-inference |
| Amazon RDS Aurora PostgreSQL | Banco principal com PostGIS, Multi-AZ, failover automático, Row-Level Security |
| Amazon S3 | Data Lake Medallion (Bronze/Silver/Gold) em Parquet |
| AWS Batch | Jobs ETL diários de ingestão do DATASUS |
| Amazon SageMaker | Treinamento e inferência dos modelos Prophet e XGBoost |
| Amazon API Gateway | Exposição segura das APIs FastAPI |
| Amazon CloudWatch | Logs e alertas operacionais |
| AWS WAF + Shield | Proteção contra DDoS e injeção em APIs públicas |
| Amazon SES | Envio de alertas por e-mail |
| Amazon ECR | Registro privado de imagens Docker para CI/CD |
| AWS CloudTrail | Auditoria de acesso a dados |

Região: `sa-east-1 (São Paulo)` — garante residência de dados em território nacional (LGPD + soberania de dados do Ministério da Saúde).

### Estimativa de custos

| Componente | MVP (10 municípios) | Escala (500 municípios) |
|---|---|---|
| Computação (EKS/EC2) | ~R$ 800/mês | ~R$ 6.000/mês |
| Banco de dados (RDS Aurora) | ~R$ 400/mês | ~R$ 3.200/mês |
| Armazenamento (S3 + EBS) | ~R$ 150/mês | ~R$ 1.200/mês |
| ML (SageMaker/Batch) | ~R$ 200/mês | ~R$ 2.500/mês |
| Rede, CDN e extras | ~R$ 100/mês | ~R$ 800/mês |
| **Total estimado** | **~R$ 1.650/mês** | **~R$ 13.700/mês** |

---

## Segurança e conformidade LGPD

O SusPredict opera exclusivamente com dados epidemiológicos **públicos e agregados** disponibilizados pelo Ministério da Saúde via DATASUS. Nenhum dado de paciente identificado é processado ou armazenado — todos os registros são manipulados em nível agregado (município, semana epidemiológica, CID-10).

- **Autenticação:** JWT (RS256) com expiração de 8 horas e refresh token rotativo
- **Autorização:** RBAC com três perfis — Administrador de Secretaria, Analista de Saúde, Gestor Estadual — com isolamento por Row-Level Security no PostgreSQL
- **Criptografia:** TLS 1.3 em trânsito; KMS em repouso no S3 e Aurora
- **Auditoria:** CloudTrail para acesso a dados; logs de todas as operações de exportação e geração de ETP
