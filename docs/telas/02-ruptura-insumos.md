# Tela 02 — Ruptura de Insumos

**Status: PROPOSTO**

## Objetivo da tela

Este é o módulo de **prioridade máxima** do MVP (docs/README: status "Vazio" → "Implementar
— prioridade máxima"). Resolve a dor validada como #1 na pesquisa de campo
([../01-visao-geral.md](../01-visao-geral.md)): 50% dos gestores cita previsão de insumo
como prioridade máxima (contra 20% de alerta de surto), 90% já enfrentou falta de
medicamento nos últimos 2 anos.

Diferente da Visão Geral, esta tela não é só leitura — depende de um dado que o DATASUS
não fornece (estoque), então tem uma dimensão de **entrada de dado** que não existia nas
telas anteriores. Isso muda a estrutura: o estado "sem dado" precisa ser resolvido antes de
qualquer visualização.

## Estrutura em camadas

### Camada 0 — Estado vazio (primeira visita, sem estoque cadastrado)

Sem estoque cadastrado, a tela não simula conteúdo (sem gráfico vazio, sem tabela
zerada). É uma tela de resolução de problema:

- CTA principal: **"Enviar planilha de estoque"** (upload CSV/Excel)
- CTA secundário: **"Cadastrar manualmente"** — para secretarias sem nenhum sistema local
  (docs/02 confirma que a fonte pode ser input manual, upload de planilha, ou API de
  sistema local)

### Regra — dependência entre estoque e alerta de ruptura

**Um alerta de ruptura não existe para um item sem estoque cadastrado.** Sem estoque,
não há "dias restantes" para calcular — a regra é matemática, não uma escolha de produto.
Isso vale por item: se a secretaria cadastrou 8 de 12 medicamentos, só esses 8 podem gerar
alerta de ruptura na Central de Alertas ([03-central-alertas.md](./03-central-alertas.md));
os outros 4 simplesmente não aparecem no fluxo de alertas até serem cadastrados aqui.

### Camada 1 — Resumo executivo

Três números, não um semáforo único — porque aqui a história é financeira, não binária:

| Métrica | Descrição |
|---|---|
| **Itens críticos** | Quantidade de insumos com dias restantes abaixo do limiar crítico |
| **Itens em alerta** | Quantidade em zona de atenção, ainda não crítica |
| **Economia estimada agindo agora** | Comparação entre custo de compra planejada vs. compra emergencial (30-40% a mais, conforme [../01-visao-geral.md](../01-visao-geral.md)) |

A "economia estimada" é o gancho de valor mais forte do produto e hoje não aparece em
nenhuma tela — é o número que justifica o preço da assinatura para a Dra. Márcia.

### Camada 2 — Lista priorizada (corpo principal da tela)

Ordenada por **dias restantes, crescente** (mais urgente primeiro) — não alfabética. Cada
linha:

```
[● status] Medicamento          dias restantes   consumo médio   [Gerar ETP]
            ^--- clique aqui abre o drawer (Camada 3)      clique aqui = ação direta
```

- Ação **inline**: o botão `Gerar ETP` é o único elemento que dispara a ação — clicar nele
  não abre o drawer de detalhe
- Clicar em qualquer outro ponto da linha (nome do medicamento, status, dias restantes)
  abre o drawer de detalhe (Camada 3) — os dois alvos de clique não se sobrepõem
- Cor de status: crítico / alerta / ok (mesma linguagem de status já usada na Visão Geral)

### Camada 3 — Detalhe sob demanda (progressive disclosure)

O gráfico de projeção de estoque vs. consumo previsto (20 semanas, docs/02) **não fica
solto para todos os itens simultaneamente** — isso reintroduz o problema de BI descritivo
que estamos evitando. Em vez disso:

- Clicar na linha do medicamento (fora do botão `Gerar ETP`) abre um **painel lateral
  (drawer)** com a curva de queda projetada daquele item específico, com a linha de
  ruptura marcada
- O painel também mostra o botão `Gerar ETP` e a composição do cálculo (consumo médio ×
  previsão epidemiológica → dias restantes), para transparência da decisão

### Camada 4 — Secundário (fora da dobra principal)

"Top consumo por setor" (UTI, Enfermaria etc. — docs/02) é consulta analítica, não decisão
imediata. Vira uma alternância dentro da própria tela (`Por medicamento` / `Por setor`),
sem competir por espaço com a lista priorizada.

## Gestão de dados de origem (CRUD de estoque)

Decisão validada com o grupo: o botão de atualização de estoque não é só um re-upload —
vira uma **tela/seção de CRUD completo**, acessível a partir de um botão discreto
**"Atualizar estoque"** no canto da tela principal (não compete com a lista priorizada pelo
espaço). Corresponde à "gestão de dados de origem" levantada como ponto em aberto na
Camada 0 original.

Nessa seção:

- **Criar**: adicionar item de estoque manualmente (nome do insumo, quantidade atual,
  consumo médio, unidade)
- **Ler**: listar todos os itens cadastrados, com origem do dado (upload / manual / API) e
  **data da última atualização** por item
- **Atualizar**: editar quantidade/consumo de um item específico, ou re-upload de planilha
  completa (com preview de diff antes de confirmar substituição)
- **Excluir**: remover item descontinuado da lista de acompanhamento

### Por que isso importa além de "ser mais completo"

O dado de estoque envelhece — ninguém sobe planilha toda semana. Sem visibilidade de
*quando* foi a última atualização, o gestor pode confiar em um número de "dias restantes"
calculado sobre estoque de três semanas atrás sem saber disso. Por isso:

- Cada item na lista priorizada (Camada 2) exibe, em texto pequeno, a data da última
  atualização de estoque
- Estoque desatualizado além de um limiar (ex: 15 dias) recebe um indicador visual próprio
  (não é "crítico" por consumo, é "dado desatualizado — confiança reduzida"), coerente com
  a transparência de qualidade de dado já praticada no projeto
  ([../04-qualidade-dados.md](../04-qualidade-dados.md))

## Wireframe textual

```
┌──────────────────────────────────────────────────────────────┐
│  Insumos                                    [Atualizar estoque]│
├──────────────────────────────────────────────────────────────┤
│  4 críticos · 7 em alerta · Economia estimada: R$ 38.400       │
│                                                                │
│  [ Por medicamento ]  Por setor                                │
│                                                                │
│  ● Dipirona 500mg        22 dias    120/sem    [Gerar ETP]      │
│    atualizado há 3 dias                                        │
│  ● Soro fisiológico 1L   28 dias    340/sem    [Gerar ETP]      │
│    atualizado há 3 dias                                        │
│  ○ Repelente infantil    61 dias     40/sem    [Gerar ETP]      │
│    ⚠ atualizado há 19 dias — confiança reduzida                │
│  ...                                                            │
└──────────────────────────────────────────────────────────────┘

  (clique em um item → drawer lateral com gráfico de 20 semanas
   estoque × consumo previsto + composição do cálculo)
```

### Tela de gestão de estoque (CRUD), acessada via "Atualizar estoque"

```
┌──────────────────────────────────────────────────────────────┐
│  Gestão de Estoque                              [+ Novo item] │
├──────────────────────────────────────────────────────────────┤
│  [Enviar planilha (CSV/Excel)]                                 │
│                                                                │
│  Item              Qtd atual   Consumo médio   Atualizado  ⋯   │
│  Dipirona 500mg     640          120/sem         3 dias    [✎][🗑]│
│  Soro fisiológico   1200         340/sem         3 dias    [✎][🗑]│
│  Repelente infantil  180          40/sem         19 dias   [✎][🗑]│
│  ...                                                            │
└──────────────────────────────────────────────────────────────┘
```

## De onde vêm os dados de cada bloco

| Bloco | Fonte |
|---|---|
| Consumo previsto (base do cálculo de dias restantes) | Previsão epidemiológica (SINAN, modelo Holt/OLS) × protocolo clínico — conforme docs/02 ("quantos casos → quantos insumos") |
| Estoque atual, consumo médio manual | Novo — armazenamento de estoque local (upload/manual/API), ainda não existe no backend atual |
| Economia estimada | Novo cálculo — comparação custo planejado vs. emergencial (percentual de 30-40% citado em docs/01, aplicado sobre quantidade × preço unitário estimado) |
| Botão Gerar ETP | Aciona o módulo de ETP (docs/02), reaproveitando os dados desta tela como insumo do documento |

## O que NÃO entra nesta tela

| Removido | Motivo |
|---|---|
| Gráfico de projeção para todos os itens ao mesmo tempo | Vira BI descritivo — fica sob demanda no drawer (Camada 3) |
| CRUD completo de estoque na tela principal | Fica na seção separada "Atualizar estoque", para não competir com a lista priorizada |

## Perguntas em aberto para aprovação

1. O upload de planilha na tela de CRUD deveria ter um **preview de diff** antes de
   confirmar substituição (ex: "12 itens atualizados, 2 novos, 1 removido — confirmar?"),
   ou substituição direta é aceitável no MVP?
2. O limiar de "estoque desatualizado" (proposto 15 dias) deveria ser configurável por
   secretaria, ou fixo no MVP?
3. A alternância "Por medicamento / Por setor" (Camada 4) é suficiente, ou "Por setor"
   merece uma tela própria mais adiante (fora do MVP)?
4. O cálculo de "Economia estimada" precisa de preço unitário por insumo — isso deveria
   fazer parte do CRUD (campo obrigatório) desde já, ou pode ser opcional/aproximado por
   enquanto?
