# Tela 09 — Modo Simulação (cenário COVID-19)

**Status: PROPOSTO** — decidido em reunião de grupo (29/07/2026)

## Por que existe

Problema de demonstração, não de operação: em dia normal, o município selecionado não tem
crise. Abrir a plataforma numa banca de TCC ou numa reunião com secretaria mostra uma tela
de "tudo sob controle" — o pior cenário possível para explicar o valor do produto. A
plataforma só se prova quando há problema.

## Cenário escolhido — COVID-19, não surto sintético de dengue

Decisão: o cenário é a **pandemia de COVID-19 (2020–2021)**. Isso muda a natureza do modo,
para melhor: em vez de inventar um pico sintético, o modo faz **replay de dado histórico
real**. A linha do tempo do sistema é travada em fev/2020, a plataforma roda com o que se
sabia até ali, e o resultado é comparável com o que de fato aconteceu.

Vantagem sobre o surto sintético de dengue:

| | Pico sintético (dengue) | Replay COVID |
|---|---|---|
| Origem do dado | Inventado (multiplicador × média sazonal) | Real, DATASUS 2020–2021 |
| Vale como validação do modelo | Não — o modelo acerta o que nós mesmos plantamos | Sim — previsão vs. desfecho conhecido |
| Força narrativa | "poderia acontecer" | "aconteceu, e a plataforma teria avisado em X semanas" |

O gancho da apresentação vira concreto: *"em 28/02/2020 a plataforma já projetava saturação
de leitos para abril — o município descobriu em abril"*. É o argumento mais forte que o
produto pode fazer, e não depende de nenhum dado fictício.

## Ressalva de dado — COVID não é agravo do SINAN

Isso é um problema real e precisa ser resolvido antes de implementar: **COVID-19 não está na
lista de agravos notificáveis que o pipeline atual lê** (`/api/doencas`, via PySUS). A série
de casos não sai do caminho de dado que já existe. Opções, em ordem de esforço:

| Fonte | O que dá | Custo |
|---|---|---|
| **SIH** (AIH com CID U07.1) | Internações por COVID por município/mês — já é o pipeline atual, só filtro de CID | Baixo — extensão de leitura, mesma coisa que `VAL_TOT` em [06](./06-analises-nivel2.md) |
| **SIM** (óbito com causa básica U07.1) | Óbitos por COVID — idem, pipeline existente | Baixo |
| Histórico do painel do Ministério / OpenDataSUS | Casos confirmados (o dado "certo" epidemiologicamente) | Coleta nova, fonte fora do FTP do DATASUS |

Caminho recomendado: **começar por SIH + SIM**, que já cabem no pipeline. A narrativa até
funciona melhor assim — internação e óbito é exatamente a linguagem de capacidade e insumo
que o produto fala, e evita a discussão de subnotificação de casos de 2020.

## Bloqueador confirmado — série anual não sustenta o replay

Testado contra `api/core/prediction.py` (29/07/2026), com série pré-pandemia estável
(2015–2019, ~835/ano) e COVID em 2020–2021 (2450 / 2100):

| Cenário | Resultado |
|---|---|
| Replay travado em fev/2020 (entrada: só 2015–2019) | Previsão para 2020: **845**. Real: **2450**. Modelo: `Holt(log1p)` |
| Série completa com COVID passando por `_detectar_surtos` | Flagra `{2020, 2021}` e `_limpar_surtos` achata os dois para **835** — o evento é substituído por interpolação dos vizinhos |

Ou seja, dois problemas distintos:

1. **Não há sinal para prever.** A série do pipeline é **anual**
   (`serie_temporal: [{ano, total}]`). Em fev/2020 o último ponto disponível é 2019 — o
   primeiro ponto de 2020 só fecha em dezembro. A frase "a plataforma teria avisado 52 dias
   antes" é **falsa nessa granularidade**: não existe informação em fevereiro capaz de
   antecipar nada.
2. **O MAD apaga exatamente o que o modo quer mostrar.** A detecção de surto existe para
   impedir que um pico histórico contamine a tendência — comportamento correto no uso
   normal, destrutivo aqui, onde o surto *é* o objeto da demonstração.

### Pré-requisitos, em ordem

1. **Agregação mensal no pipeline.** A competência da AIH já é mensal — o dado existe, é o
   `processar_download` (`api/main.py`) que agrega por ano. Sem isso o modo não funciona,
   com nenhum cenário. Impacto ainda não medido.
2. **Bypass do `_detectar_surtos` no modo replay.** Flag no `gerar_predicao()`, não remoção
   da detecção (que segue certa para o uso normal).
3. **Só então** o painel "previsto vs. real" e o resto do desenho abaixo.

Enquanto 1 e 2 não existirem, este documento é desenho, não backlog implementável.

## O que o modo faz

Ao ativar, o sistema trava a data de referência em **fev/2020** e alimenta as telas com a
série real até aquele ponto. O resto **recalcula normalmente** — nada é hardcoded por tela:

| Tela | Efeito esperado |
|---|---|
| Visão Geral ([01](./01-visao-geral.md)) | Status vira crítico, briefing textual muda, ações recomendadas aparecem |
| Alertas ([03](./03-central-alertas.md)) | Alertas de surto e de saturação entram na bandeja, badge sobe |
| Insumos ([02](./02-ruptura-insumos.md)) | Demanda projetada explode → indicadores de suficiência per capita despencam |
| Epidemiologia ([06](./06-analises-nivel2.md)) | Curva destaca a anomalia contra a média histórica pré-2020 |
| Superlotação ([06](./06-analises-nivel2.md)) | O caso mais forte — projeção de ocupação vs. capacidade CNES do município |
| Clara ([08](./08-painel-clara.md)) | Responde sobre o cenário com os mesmos dados das telas |

Regra: o modo altera **a série de entrada e a data de referência**, não as telas. Se uma
tela não reage, é bug de integração — o modo funciona como teste de ponta a ponta do produto.

### Camada extra exclusiva do modo — "o que aconteceu de verdade"

Como o desfecho é conhecido, o modo pode fazer o que nenhuma tela real faz: mostrar a
previsão **e** o real por cima. Um painel de fechamento, ao final do replay:

```
Previsto em 28/02/2020 para abril:   1.240 internações  (IC 80%: 890–1.700)
Real observado em abril/2020:        1.410 internações
Antecedência do aviso:               52 dias
```

Isso é validação de modelo virando material de apresentação — o mesmo número serve para os
dois usos.

## Regra crítica — nunca confundível com o presente

Dado real de 2020 exibido sem contexto é pior que dado fictício: parece situação atual. Por
isso, enquanto ativo:

- **Faixa persistente no topo de todas as telas**: `⚠ MODO SIMULAÇÃO — replay COVID-19,
  referência 28/02/2020 · [Sair da simulação]`
- A data de referência simulada aparece em toda tela onde normalmente apareceria "hoje"
- Toda exportação (XLSX, PDF de ETP) carrega marca d'água "SIMULAÇÃO" e sufixo no arquivo
- Nada gerado no modo persiste junto com resultados reais — sessão isolada, descartada ao sair
- Estado por sessão de usuário, nunca global

## Onde fica o botão

Não é item de menu (não é destino, é um estado). Fica em **Configurações**, seção própria
"Demonstração":

```
┌──────────────────────────────────────────────────────────┐
│  Demonstração                                              │
│                                                            │
│  Replay COVID-19 (2020)                                    │
│  Roda a plataforma com a linha do tempo travada em          │
│  fev/2020, usando dados reais do município, e compara a     │
│  previsão com o que de fato aconteceu.                      │
│                                                            │
│  Data de referência:  [ 28/02/2020 ▾ ]                     │
│  Horizonte:           [ 90 dias ▾ ]                        │
│                                                            │
│                              [ Ativar simulação ]           │
└──────────────────────────────────────────────────────────┘
```

## De onde vêm os dados

| Bloco | Fonte |
|---|---|
| Série COVID do município | SIH (AIH com CID U07.1) + SIM (óbito U07.1) — pipeline existente, precisa ler o CID |
| Linha de base pré-pandemia | Série histórica do município já disponível (2015–2019) |
| Capacidade de leitos (Superlotação) | CNES — ainda pendente de investigação, ver [05-analise-dados.md](../05-analise-dados.md) |
| Previsão | Cascade Holt → OLS existente, sem alteração — é o ponto do modo |
| "Real observado" do painel de fechamento | Mesma série SIH/SIM, período posterior à data de referência |

## Perguntas em aberto

1. Data de referência configurável ou fixa em 28/02/2020? (Variar a data é o que mostra
   "quanto antes o aviso vinha" — parece valer o esforço.)
2. Município do replay: o mesmo já selecionado pelo usuário, ou um município fixo com dado
   sabidamente bom? Município pequeno pode ter série COVID rala demais para o modelo.
3. O painel de fechamento ("previsto vs. real") entra no MVP ou fica para depois? É o
   diferencial do modo, mas é a única parte que não reaproveita tela existente.
4. ~~Detecção de surto por MAD vai limpar o pico COVID — precisa ser verificado~~
   **Verificado e confirmado** — ver "Bloqueador confirmado" acima. Junto com isso apareceu
   um problema maior (série anual não dá sinal em fev/2020). Ambos precisam ser resolvidos
   antes de qualquer implementação.
