# Interface beta

Acesse `/beta` no servidor do frontend. A sessão de login é a mesma da aplicação principal. As páginas também aceitam o prefixo, como `/beta/insumos` e `/beta/alertas/aquisicao-1?tipo=surto`.

A proposta conserva o conteúdo central em um card, a continuidade entre navegação e barra superior e os componentes funcionais existentes. O link “Interface original” retorna à página equivalente sem o prefixo.

## Três versões

Em `/beta/configuracoes`, escolha uma das prévias. O atalho “Explorar versões” também leva até lá.

- **Beta v1 · Céu:** azul claro mais vivo, com menu lateral tradicional.
- **Beta v2 · Aurora:** pêssego e terracota, com todas as áreas em abas superiores no desktop.
- **Beta v3 · Jardim:** verde fresco, com coluna lateral compacta e mais espaço para conteúdo.

A escolha é aplicada imediatamente e salva em `sus_predict_beta_variant` no localStorage. Sem preferência válida, a versão inicial é v1. Abaixo de 1025px, a v2 usa o menu responsivo existente; no celular, todas mantêm a navegação inferior. A navegação entre páginas do beta volta ao início da área de conteúdo.

Os estilos de `beta.css` são limitados a `.beta-app`. Autenticação, consultas, filtros, Clara e conteúdo das páginas são compartilhados. Não há dados fictícios adicionados ao aplicativo. A tela de login continua sendo a original.

Validação local: build Vite, quatro testes da beta e o teste dos contratos das telas analíticas passaram. Os testes cobrem as três escolhas, persistência após recarga, rotas, histórico, retorno ao original e navegação mobile. Capturas desktop (1280 × 720) e mobile (390 × 844) foram inspecionadas com respostas simuladas exclusivamente nos testes. Não houve validação com dados ao vivo nem publicação.

Para repetir: `npm run build`, `npm test` e `npm exec playwright test tests/beta-interface.spec.js tests/dados-operacionais.spec.js`, a partir de `frontend/`.
