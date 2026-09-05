# Contrato de cobertura de estoque

**Status:** implementado na Interface/IA em 11/08/2026  
**Responsável pelo contrato de consumo:** Interface/IA  
**Responsável pela validação caso→insumo:** equipe de dados/domínio

## Decisão de produto

O contrato atual permite calcular **cobertura de estoque**, não uma previsão de abastecimento:

```text
cobertura_dias = quantidade_atual / consumo_medio_dia
```

A interface e a Clara não podem afirmar que esse resultado foi ajustado pela previsão epidemiológica. O vínculo caso→insumo permanece indisponível até que seus coeficientes sejam validados por profissional de domínio e entregues pela equipe de dados.

## Campos consumidos hoje

| Campo | Uso | Regra de contingência |
|---|---|---|
| `ibge6` | fixa o município autorizado | consulta indisponível sem município |
| `item` | identifica apresentação do insumo | não agregar apresentações silenciosamente |
| `quantidade_atual` | numerador da cobertura | valor ausente ou inválido bloqueia o cálculo |
| `consumo_medio_dia` | denominador da cobertura | zero ou ausente bloqueia o cálculo e o ETP |
| `atualizado_em` | competência do estoque | ausência reduz a confiança |

## Metadados derivados pela camada de aplicação

Cada item devolvido à Clara inclui `qualidade`:

- `tipo_calculo`: `cobertura_estoque`;
- `formula`: `quantidade_atual / consumo_medio_dia`;
- `fonte`: estoque local informado pelo município;
- `competencia` e `defasagem_dias`;
- `confianca`: moderada, reduzida ou indisponível;
- `calculo_disponivel` e `entradas_faltantes`;
- `premissas` e `limitacoes`.

Defasagem superior a 15 dias reduz a confiança. Consumo local menor ou igual a zero torna o cálculo indisponível e impede a geração do ETP pela Clara.

## Premissas exibidas

- consumo médio permanece constante no horizonte;
- pedidos em trânsito não são considerados;
- o protocolo caso→insumo ainda não foi validado;
- severidade clínica, lead time e margem de segurança não participam do cálculo atual.

## Simulação

A tela de Insumos permite variar visualmente o consumo semanal de -30% a +50%. O resultado é identificado como **cenário**, recalcula apenas a visualização e não persiste nem altera o estoque cadastrado. O ETP continua usando a premissa-base, nunca o cenário sem confirmação.

## Contrato solicitado à equipe de dados/domínio

Para evoluir de cobertura para previsão de abastecimento, cada coeficiente caso→insumo deve conter:

- insumo, apresentação e unidade normalizadas;
- tipo e severidade do caso;
- quantidade por caso;
- protocolo de origem, versão e validade;
- município ou regra de aplicabilidade;
- margem de segurança e lead time;
- responsável e data da validação;
- sinais locais recentes, incluindo consumo, pedidos em trânsito e competência da carga.

Até a entrega e validação desse contrato, a promessa comercial deve usar "previsão epidemiológica" e "cobertura estimada do estoque" como conceitos separados.

## Reprodução externa

Com um item contendo `quantidade_atual = 1200` e `consumo_medio_dia = 100`, qualquer planilha ou script deve reproduzir `12 dias` de cobertura. A competência e as limitações não alteram a aritmética, mas qualificam a confiança e a decisão permitida.
