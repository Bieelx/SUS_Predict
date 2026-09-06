# Revisão de pré-lançamento: privacidade e acessibilidade

Data: 06/09/2026. Escopo: frontend ativo do SusPredict, cadastro, contratos locais de autenticação, Clara e integrações identificadas no código. Implementação local, sem publicação nem alterações no banco de produção. Preservadas as mudanças anteriores de cadastro e CSS.

## Avaliação das 14 recomendações

| Item | Aplicabilidade e resultado |
| --- | --- |
| 1. Contraste | Aplicável. Escurecidos rótulos das seções nos quatro temas, navegação azul, placeholders do login e ação de saída. Testes medem os tokens de seção e os textos auxiliares. Não equivale a auditoria completa de todos os pixels. |
| 2. Texto alternativo | Aplicável. A marca já usa `alt=""` e `aria-hidden` junto ao nome textual; ícones Material já são decorativos. Mantidos. Gráficos analíticos receberam alternativas tabulares, que são mais úteis que uma descrição genérica. |
| 3. Privacidade | Adicionada `/privacidade`, pública, com conta, conversas, memória, IA, Telegram, infraestrutura e limites de retenção. Links no login e no conteúdo autenticado. |
| 4. Acessibilidade | Link de salto para o conteúdo, correção da semântica do seletor entrar/criar conta (grupo de botões com estado pressionado), foco restaurado no campo da Clara e repasse de atributos ARIA no componente Card. |
| 5. Termos | Adicionada `/termos`, com escopo acadêmico, uso responsável, fontes e revisão humana de previsões/ETP. |
| 6. Embeds externos | Nenhum iframe identificado no frontend ativo. Google Fonts foi removido do HTML/CSS: arquivos e licenças agora em `frontend/public/fonts`. Telegram segue opcional, com pareamento existente. |
| 7. Política de cookies | Adicionada `/cookies`, incluindo inventário de localStorage e duração real. Não confunde armazenamento local com cookies. |
| 8. Tracking | Nenhum SDK de publicidade/analytics identificado no frontend. Teste de rede das páginas públicas confirma ausência de requisições externas. |
| 9. Consentimento em formulários | Cadastro informa finalidade e dá acesso às políticas antes do envio. Não foi criada uma caixa obrigatória de consentimento genérico: não há marketing no fluxo e a base legal institucional ainda precisa ser definida. Não existe novo registro de aceite contratual no servidor. O pareamento de Telegram e a confirmação de ações da Clara já são explícitos. |
| 10. Tracking novamente | Duplicado do item 8. |
| 11. Rótulos claros | Mantidos botões de ação descritivos, campo “Nome de identificação” em lugar de exigir nome completo, links para nova aba identificados e instruções de senha associadas ao campo. |
| 12. Consentimento de cookies | Banner não adicionado para a implementação atual, sem publicidade/analytics. Caso sejam adicionados rastreadores ou embeds não necessários, implementar controle antes do carregamento e revisar a base legal. |
| 13. Minimização | Cadastro continua enviando apenas nome, e-mail e senha; confirmação de senha fica no cliente. Não adicionados CPF, telefone, cargo ou dados clínicos. Clara informa persistência possível das conversas e orienta a não enviar dados identificáveis de pacientes. Isso é orientação, não um filtro automático de dados pessoais. |
| 14. Formulários por teclado | Validação nativa de e-mail, campos obrigatórios e tamanho mínimo de senha, rótulos/autocomplete preservados, foco no conteúdo e tabelas expansíveis operáveis por teclado. |

## Decisões de implementação

As três rotas públicas são resolvidas antes de montar o App; não dependem de uma sessão nem disparam consultas autenticadas. O servidor de produção deve encaminhar essas rotas para `index.html`, como as demais rotas da SPA.

As fontes locais preservam as famílias existentes e eliminam requisições do visitante ao Google Fonts. Os arquivos TTF somam aproximadamente 3,6 MB com licenças; o navegador carrega as faces efetivamente utilizadas. Uma otimização futura pode usar WOFF2/subconjuntos, preservando símbolos e caracteres portugueses.

As tabelas expansíveis de Epidemiologia, Internações e Vacinação usam os mesmos arrays exibidos nos gráficos. Valores ausentes são “Indisponível”. Nos gráficos cartesianos, também foi habilitada a camada de acessibilidade do Recharts. O foco no campo da Clara não é mais anulado por `outline: none` inline. O Card agora propaga `aria-hidden`, permitindo que os skeletons permaneçam decorativos para leitores de tela.

## Pendências antes de abrir ao público

1. A organização responsável deve fornecer identidade do controlador, contato público para direitos dos titulares, bases legais por finalidade, operadores, localização do tratamento/transferências e prazos reais de retenção e backups. As páginas atuais informam esses limites; não são uma declaração de conformidade LGPD completa.
2. Validar infraestrutura publicada: cookies inseridos por proxy/CDN, logs, cabeçalhos, redirecionamentos, HTTPS, roteamento público e serviços de IA realmente habilitados. A ausência de tracking no frontend não certifica a infraestrutura.
3. Definir e validar o procedimento de acesso, correção e exclusão de conta/conversas/memórias e o atendimento das solicitações. Não foi criado um botão de exclusão que apenas simula esse processo.
4. Fazer auditoria assistiva completa com VoiceOver/NVDA, todos os estados dinâmicos, zoom e gráficos restantes. As correções e testes deste trabalho não certificam WCAG AA integral.

## Validação

- `npm test`: 7 testes unitários aprovados.
- Os arquivos novos/locais em `frontend/tests/` seguem a regra existente de `.gitignore`; a política de versionamento de testes não foi alterada.
- `npx playwright test tests/pre-lancamento.spec.js tests/p1-fluxo-acessibilidade.spec.js tests/dados-operacionais.spec.js`: cobre políticas sem sessão/API/terceiros, teclado, validação de cadastro, contraste de temas, quatro breakpoints, tabelas analíticas e confirmação de ações da Clara. APIs simuladas nos testes, sem criar contas reais.
- `npm run build` e `git diff --check`.
- Inspeção visual local do cadastro desktop e política de armazenamento mobile; tabela com rolagem própria para manter a leitura em telas estreitas.
- O teste adicional `rotas-deep-links.spec.js` não passou: depende do login de demonstração real e não alcançou a tela autenticada neste ambiente. Não houve mudança nesse fluxo nem validação de autenticação no servidor nesta revisão.

## Fontes

- [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/): contraste, teclado, foco, alternativas textuais e identificação de campos.
- [ANPD: recomendações sobre cookies](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-emite-recomendacoes-para-adequacao-da-pratica-de-coleta-de-cookies-do-portal-gov.br): transparência, finalidades, bases legais e controle de cookies não necessários.
- Evidência local: `frontend/src/shared/auth.js`, `frontend/src/App.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/ClaraPanel.jsx`, `api/core/auth.py` e `api/core/susbot_memory.py`.
- Licenças das fontes: `frontend/public/fonts/*-OFL.txt` e `material-symbols-LICENSE.txt`.
