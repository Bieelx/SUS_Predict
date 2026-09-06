# Interface mobile, setembro de 2026

O mobile usa rolagem do documento, em vez do painel fixo com rolagem interna do desktop. Isso libera largura útil e permite que o Safari responda ao gesto de rolagem com sua barra de navegação. O cabeçalho mantém a marca e oferece seleção de município; a navegação inferior dá acesso a Visão, Alertas, Insumos, Clara e Mais.

## Comportamento

- Até 768 px: conteúdo sem moldura externa, cabeçalho sticky, navegação inferior de 62 px e espaçamento para as safe areas. A troca de página retorna ao início.
- Indicadores em duas colunas, com uma coluna abaixo de 360 px. Valores monetários separam moeda e valor para evitar quebrar centavos.
- Fonte, atualização, período e tabelas ficam no disclosure “Fonte e período”. A data de atualização continua visível quando recolhido. No desktop, a apresentação de origem continua expandida.
- O aviso de que aquisições não representam estoque físico permanece visível. A explicação pode ser expandida.
- Os insumos passam de tabela para uma lista de registros no mobile, preservando quantidade, valor, unidade, fornecedores e classificação de risco.
- Formulários usam campos com fonte de 16 px e altura mínima de 44 px. Isso evita o zoom automático usual de campos pequenos no Safari.
- Mais contém o foco, bloqueia a rolagem de fundo e devolve o foco ao botão ao fechar. Clara ocupa a tela, incluindo a faixa de 721 a 768 px.
- Os contratos, cálculos e recortes geográficos não foram alterados. Dados indisponíveis continuam diferentes de zero observado.

## Implementação

`frontend/src/index.css` define o shell responsivo. `frontend/src/mobile.css` reúne as adaptações de conteúdo. `App.jsx` contém o seletor de território e a navegação. `dataUi.jsx` contém os padrões de indicadores e origem; `RupturaReal.jsx`, o aviso e a tabela de insumos.

## Validação

Execute dentro de `frontend/`:

```sh
npm test
npm run build
npx playwright install webkit
npx playwright test tests/mobile-rework.spec.js tests/mobile-interface.spec.js tests/beta-interface.spec.js --workers=1
```

Os testes de retrabalho usam fixtures sintéticas, exclusivamente no navegador de teste. Percorrem as nove áreas em 320, 390, 430 e 768 px no Chromium e WebKit, verificam overflow, rolagem do documento, primeiro indicador, seletor de município, origem dos dados e retorno de foco. Os testes de navegação também cobrem Clara e confirmação do pareamento Telegram. A suíte beta verifica que as versões existentes continuam navegáveis.

A emulação WebKit não substitui validação em iPhone físico: recolhimento da barra real do Safari, teclado virtual e rotação com safe areas ainda precisam de conferência no aparelho. Nenhuma publicação ou alteração de backend faz parte deste retrabalho.
