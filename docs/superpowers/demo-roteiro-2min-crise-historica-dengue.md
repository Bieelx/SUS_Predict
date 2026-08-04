# Roteiro de 2 Minutos - Demo Historica de Dengue 2024

**Objetivo:** demonstrar, em 2 minutos, que o SusPredict nao apenas mostra a curva de dengue, mas antecipa uma decisao operacional concreta com rastreabilidade.

**Status:** validado no fluxo automatizado do frontend.

## Frase obrigatoria

> Casos historicos reais; estoque e precos sao cenario demo ficticio.

## Link de abertura

`http://localhost:3000/?demo=crise-historica`

## Estrategia

Para 2 minutos, o ideal nao e contar todos os meses. O melhor corte da demo e **abr/2024**.

Use o replay apenas para provar a progressao:

1. `jan/2024` - contexto inicial
2. `fev/2024` - aceleracao epidemiologica
3. `mar/2024` - tensao crescente
4. `abr/2024` - momento ideal para agir
5. `ETP` - consequencia pratica da recomendacao

## Script cronometrado

### 0:00-0:20 - Abertura

**Clique/acao**

1. Abrir a demo historica.
2. Entrar com login dev.
3. Parar em `jan/2024`.

**Fala**

> "Aqui eu nao vou mostrar um dashboard generico. Vou mostrar quando agir, em que insumo agir e com quanta antecedencia. Os casos de dengue sao historicos reais; o estoque e os precos sao um cenario demo ficticio."

### 0:20-0:40 - Sinal epidemiologico

**Clique/acao**

1. Clicar em `Avancar mes` para ir a `fev/2024`.
2. Ler o banner e o SusBot.

**Fala**

> "Em fevereiro, a plataforma ja detecta uma aceleracao forte da dengue: 210,1% sobre o mes anterior. Ainda nao existe ruptura, mas o sistema ja sai da leitura passiva e entra em vigilancia operacional."

### 0:40-1:00 - A janela apertando

**Clique/acao**

1. Clicar em `Avancar mes` para ir a `mar/2024`.
2. Apontar rapidamente o status e os alertas.

**Fala**

> "Em marco, o surto continua acelerando e o sistema ja mostra que a janela esta apertando. O ponto importante aqui nao e so o grafico: e a transicao do risco epidemiologico para risco operacional."

### 1:00-1:30 - O corte que prova valor

**Clique/acao**

1. Clicar em `Avancar mes` para ir a `abr/2024`.
2. Ler o card `Janela de decisao`.
3. Ler a `Antecedencia`, `Ruptura estimada`, `Acao sugerida` e `Economia estimada`.

**Fala**

> "Abril e o melhor corte da demo. Aqui o sistema deixa claro que precisa agir agora. O item critico e Dipirona 500mg, com ruptura estimada para maio. O sistema recomenda abrir o ETP neste corte e mostra 31 dias de antecedencia operacional, alem de uma economia estimada de cerca de 253 mil reais frente a compra emergencial."

### 1:30-1:50 - Prova juridico-operacional

**Clique/acao**

1. Clicar em `Gerar ETP`.
2. Clicar `Proximo`.
3. Clicar `Proximo`.
4. Marcar `Revisei e aprovo o texto acima`.
5. Clicar `Gerar documento`.

**Fala**

> "Com esse alerta, a plataforma nao para no insight. Ela abre caminho para a acao concreta: um ETP contextual, gerado a partir do risco identificado naquele corte historico."

### 1:50-2:00 - Fechamento

**Clique/acao**

1. Abrir `Documentos`.
2. Mostrar o ETP de `Dipirona 500mg` com data historica do replay.

**Fala**

> "Essa e a prova de valor do SusPredict: detectar cedo, priorizar o insumo certo e transformar previsao em decisao com rastreabilidade antes da compra emergencial."

## O que nao fazer em 2 minutos

- Nao entrar nas telas fora do replay.
- Nao gastar tempo no historico resolvido dos alertas.
- Nao tentar explicar todos os calculos do modelo.
- Nao usar `mai/2024` como clímax principal; use abril.

## Perguntas e respostas rapidas

### De onde vem o dado?

> "Os casos de dengue sao historicos reais de Campinas/SP. O estoque e os precos sao um cenario demo ficticio e explicitamente marcado como tal."

### O que a plataforma prova aqui?

> "Que o sistema consegue antecipar uma decisao operacional concreta antes da ruptura, com antecedencia e economia estimada."

### Por que abril e o melhor corte?

> "Porque ali a plataforma ainda tem margem para agir: a ruptura esta a caminho, o ETP faz sentido e o ganho operacional aparece de forma clara."

## Checklist rapido antes da banca

- [ ] Abrir direto em `?demo=crise-historica`
- [ ] Login dev funcionando
- [ ] A demo abre em `jan/2024`
- [ ] `Avancar mes` chega ate `abr/2024` sem erro
- [ ] Card `Janela de decisao` aparece em abril
- [ ] `Gerar ETP` funciona
- [ ] Documento aparece em `Documentos`

## Veredito de uso

Para uma demo curta, o caminho mais forte e:

`Visao Geral (jan)` -> `fev` -> `mar` -> `abr` -> `Gerar ETP` -> `Documentos`

Esse fluxo cabe em 2 minutos e concentra a mensagem principal sem dispersao.
