# Plano de Evolução da Demo - Crise Histórica de Dengue 2024

**Base:** [spec da demo](../specs/2026-07-28-modo-demo-crise-historica-dengue.md)

## Objetivo

Transformar a demo histórica de dengue em uma apresentação forte para banca: mais fiel aos dados públicos, mais coerente com a narrativa do produto e mais convincente na prova de valor.

## Princípios

- Dados epidemiológicos precisam ser rastreáveis e explicáveis.
- Estoque, custos e ETP podem ser demonstrativos, mas devem ser rotulados como tal.
- A narrativa da interface precisa bater com o que o backend realmente faz.
- Cada fase deve terminar com um estado demonstrável, mesmo que parcial.

## Fase 0. Pesquisa e validação da base

**Objetivo:** escolher o município e a série histórica que sustentam a demo.

**Tarefas:**
- Validar a fonte oficial da série de dengue 2024.
- Comparar pelo menos 3 candidatos: Campinas/SP, Ribeirão Preto/SP e São José do Rio Preto/SP.
- Confirmar total anual, curva mensal, pico e início da aceleração.
- Registrar URL, data de acesso e limitações metodológicas.
- Definir o município final da demo com justificativa objetiva.

**Saída esperada:**
- Documento curto com a decisão do município.
- Série mensal validada ou fonte clara para reconstrução do dataset.

**Aceite:**
- É possível responder de onde vieram os números em poucos segundos.
- A escolha do município não parece arbitrária.

**Status:** concluída. Município-base definido como Campinas/SP.

## Fase 1. Ajustar o dataset da demo

**Objetivo:** trocar a curva provisória por uma série histórica consistente.

**Tarefas:**
- Substituir a série mensal atual por valores validados.
- Atualizar metadados do dataset: fonte, período, status e observações.
- Marcar explicitamente o que é dado histórico real e o que é cenário demo.
- Garantir que o corte temporal continue determinístico.

**Saída esperada:**
- Dataset versionado e pronto para replay.

**Aceite:**
- O replay reproduz a evolução real da crise sem depender de fonte ao vivo.

## Fase 2. Recalibrar o cenário operacional

**Objetivo:** fazer o risco de insumos aparecer no momento certo.

**Tarefas:**
- Revisar estoque inicial dos itens críticos da demo.
- Definir consumo por caso e premissas de cobertura.
- Ajustar limiares de atenção, crítico e ruptura.
- Garantir que a ruptura apareça depois do sinal epidemiológico, não antes.

**Saída esperada:**
- Tabela de premissas operacionais documentada.

**Aceite:**
- O status de risco faz sentido para a banca e para a narrativa de secretaria.

## Fase 3. Recalibrar a prova de valor

**Objetivo:** tornar a economia e a recomendação de ETP defensáveis.

**Tarefas:**
- Revisar a fórmula de economia estimada.
- Documentar o que é compra planejada vs. compra emergencial.
- Ajustar o percentual emergencial se necessário.
- Exibir claramente antecedência operacional e mês recomendado para ação.

**Saída esperada:**
- Métricas de valor consistentes e explicáveis.

**Aceite:**
- A banca entende por que o SusPredict teria recomendado agir antes.

## Fase 4. Limpar a narrativa da interface

**Objetivo:** reduzir sinais de mock e inconsistência.

**Tarefas:**
- Revisar textos que prometem mais do que o backend entrega.
- Marcar o que é demo, o que é histórico real e o que é estimativa.
- Remover ou adaptar telas/resumos estáticos que destoem do replay.
- Garantir que badges, alertas e contadores reflitam o estado real da demo.

**Saída esperada:**
- Interface mais honesta e menos prototipada.

**Aceite:**
- O usuário não encontra contradições entre telas diferentes.

## Fase 5. Ensaiar o fluxo da banca

**Objetivo:** transformar a demo em apresentação guiada.

**Tarefas:**
- Definir ordem das telas.
- Escrever falas curtas para cada marco do replay.
- Preparar resposta para perguntas sobre fonte, estoque e custo.
- Testar o fluxo completo em 5 a 7 minutos.

**Saída esperada:**
- Roteiro curto de apresentação.

**Aceite:**
- A demo funciona com segurança mesmo se houver interrupção ou pergunta difícil.

**Status:** concluída. Roteiro de banca consolidado em [docs/superpowers/demo-roteiro-crise-historica-dengue.md](../demo-roteiro-crise-historica-dengue.md).

## Ordem recomendada

1. Validar município e fonte.
2. Recriar o dataset.
3. Recalibrar estoque e alertas.
4. Ajustar economia e ETP.
5. Limpar a narrativa da UI.
6. Ensaiar a banca.

## Critério de sucesso

- A demo parece auditável.
- A curva epidemiológica é crível.
- A ruptura de insumos é plausível.
- A recomendação de ação chega antes do pico.
- A banca entende a tese em poucos minutos.
