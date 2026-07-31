# Roteiro de Banca - Modo Demo: Crise Histórica de Dengue 2024

**Objetivo:** conduzir a demo em 5 a 7 minutos com uma narrativa curta, auditavel e sem ambiguidades entre dado real e cenário demo.

## Frase obrigatoria

> Casos historicos reais; estoque e precos sao cenario demo ficticio.

## Ordem de apresentacao

1. Visao Geral.
2. Avanco do corte temporal.
3. Central de Alertas.
4. Insumos.
5. Gerar ETP.
6. Documentos ou revelacao final da curva.

## Tempo alvo

| Bloco | Tempo | Objetivo |
|---|---:|---|
| Abertura | 45s | Fixar a tese em uma frase |
| Corte inicial | 60s | Mostrar transparência e contexto |
| Virada narrativa | 90s | Mostrar o momento em que o sistema pede acao |
| Prova operacional | 90s | Mostrar risco de ruptura e economia |
| Fechamento juridico | 60s | Mostrar o ETP contextual |
| Revelacao final | 45s | Mostrar que o alerta veio antes do pico |

## Fala pronta por bloco

### 1. Abertura

Fala curta:

> "Aqui eu vou mostrar quando agir, em que insumo agir, e com quanta antecedencia."

O que mostrar:

- Abrir `Visao Geral` com a demo ativa.
- Ler a faixa de transparencia.
- Apontar o municipio e o corte temporal.

### 2. Corte inicial

Fala curta:

> "Os casos sao historicos reais; o estoque e os precos sao simulados para a demonstracao."

O que mostrar:

- O selo `Demo historica`.
- O briefing do SusBot.
- O status atual da cidade.
- A prova de valor ainda em estado inicial.

### 3. Virada narrativa

Fala curta:

> "Quando o surto acelera, o sistema deixa de apenas descrever e passa a orientar decisao."

O que mostrar:

- Avancar um mes.
- Destacar o aumento do alerta.
- Abrir `Alertas` e mostrar origem + evidencia inline.
- Nomear o tipo de alerta em voz alta: surto ou ruptura.

### 4. Prova operacional

Fala curta:

> "Aqui aparece a pergunta que interessa para a secretaria: o que vai faltar primeiro e em quantos dias."

O que mostrar:

- Entrar em `Insumos`.
- Mostrar o item critico no topo.
- Ler os dias restantes.
- Ler a economia estimada.
- Reforcar que o estoque e demo, nao dado oficial.

### 5. Fechamento juridico

Fala curta:

> "Com esse alerta, o sistema abre caminho para o ETP antes da compra emergencial."

O que mostrar:

- Clicar em `Gerar ETP` a partir do alerta ou do item.
- Passar pela revisao do texto.
- Mostrar que o alerta vira `Em andamento`.
- Se necessario, abrir `Documentos` para auditar o que foi gerado.

### 6. Revelacao final

Fala curta:

> "Agora eu volto um passo para mostrar que a recomendacao veio antes do pico."

O que mostrar:

- Avancar mais um corte ou revelar a continuidade da curva.
- Reforcar antecedencia operacional.
- Fechar com economia estimada e evitacao de compra emergencial.

## Respostas curtas para perguntas dificeis

### De onde vem o dado?

> "Os casos de dengue sao historicos reais e foram validados para Campinas/SP. O estoque e os precos sao cenarios de demo, explicitamente rotulados como tal."

### O estoque e oficial?

> "Nao. O DATASUS nao fornece estoque de medicamento. O estoque aqui e um cenario plausivel para demonstrar a decisao operacional."

### O sistema promete tempo real?

> "Nao. A demo e um replay historico com corte mensal. Ela mostra antecedencia de decisao, nao monitoramento em tempo real."

### Como a economia e calculada?

> "E uma estimativa demonstrativa comparando compra planejada e compra emergencial, com o acrescimo emergencial parametrizado no cenario."

### O que acontece se a banca pedir prova de rastreabilidade?

> "A tela exibe municipio, fonte, corte temporal e separa claramente dado historico de cenario demo."

## Plano B

1. Recarregar com `?demo=crise-historica`.
2. Conferir se `VITE_API_BASE` aponta para a porta correta.
3. Se a API nao responder, apresentar a narrativa com a ultima tela carregada.
4. Se a demo cair durante a fala, continuar pelo roteiro sem entrar em telas fora do fluxo.

## Checklist de ensaio

- [ ] O link de abertura carrega a demo historica.
- [ ] A faixa de transparencia aparece na Visao Geral.
- [ ] O corte temporal e visivel em todas as telas core.
- [ ] O SusBot mostra briefing curto e orientado a acao.
- [ ] O alerta muda para `Em andamento` depois do ETP.
- [ ] Insumos mostra item critico, dias restantes e economia.
- [ ] O fechamento cabe em no maximo 7 minutos.
- [ ] O apresentador sabe responder fonte, estoque e custo sem hesitar.

## Mini-script de 60 segundos para emergencia

> "Esta e uma demo historica de dengue 2024. Os casos sao reais e o estoque e os precos sao simulados. Eu avanco o corte temporal, o sistema mostra quando o risco sobe, aponta qual insumo entra em ruptura primeiro e abre o ETP antes da compra emergencial. O ganho aqui e antecedencia operacional com rastreabilidade."
