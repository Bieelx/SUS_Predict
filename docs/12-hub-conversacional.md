# Clara: continuidade entre canais

Implementação de 11/09/2026. Este documento descreve o código atual e substitui,
para convergência e confirmação, as descrições antigas de proposta.

## Jornada

1. O gestor abre um alerta na web e escolhe **Analisar com Clara**. A nova conversa
   fixa município, período, insumo e unidade. Epidemiologia também transmite o
   período selecionado ao iniciar uma análise.
2. No Telegram, `/conversas`, `/continuar`, `/menu` ou `/start` mostram até seis
   conversas recentes, ordenadas por atividade. O quadro também aparece ao
   concluir o pareamento e após uma pausa de 30 minutos.
3. O usuário escolhe um botão. O servidor valida vínculo, conversa privada,
   acesso ativo e pertencimento da conversa. A Clara apresenta um resumo
   **extrativo das últimas três trocas**, com município, período e ações recentes.
   Esse resumo não faz nova inferência nem depende de um LLM disponível.
4. A próxima pergunta continua a conversa escolhida com seu histórico e contexto.
   `/nova` inicia outro assunto no município do pareamento.
5. Uma proposta de ETP fica pendente no hub. Na web, o usuário abre a mesma
   conversa, revisa e confirma ou cancela. O Telegram não confirma ações.

Conversas anteriores à implantação não recebem contexto presumido ao serem
selecionadas pelo Telegram: precisam primeiro ser retomadas na web. O município
e período usados nessa primeira retomada são então fixados e mostrados no painel.
Após inatividade, a mensagem que abriu o menu não é executada: o usuário escolhe
a conversa e envia sua pergunta, conforme a orientação do quadro.

## Mesma fonte, conceitos distintos

`consultar_aquisicoes` utiliza `consultar_risco_aquisicao`, a mesma função chamada
por `/api/dados/ruptura`. Alertas são agrupados da mesma maneira que na interface.
Quando a conversa nasceu de um alerta, insumo e unidade selecionados prevalecem
sobre parâmetros sugeridos pelo modelo. As respostas e os artefatos informam
competência, fonte e limitação; um valor medido como zero é preservado.

Perguntas gerais sobre alertas e insumos consultam aquisições. Estoque físico,
consumo e cobertura continuam em `consultar_estoque`, dependentes de cadastro local.
`consultar_alertas` corresponde apenas aos alertas operacionais locais cadastrados.
Compras públicas não são convertidas em estoque, cobertura ou dimensionamento de
compra. A ausência de fonte é distinta da ausência de alertas.

## Contexto e permissões

`clara_contextos` armazena o contexto por conversa. Ele é fixado uma vez com
inserção condicional, inclusive sob concorrência. A seleção atual do painel não
reescreve o município de uma conversa retomada. O contexto fica visível; para
usar outro município, período ou item de referência, inicia-se nova conversa.

O perfil continua limitando ferramentas. Consultas às fontes públicas curadas
podem abranger outros municípios, respeitando o perfil. Estoque físico, alertas
locais e geração de ETP exigem município explicitamente atribuído em
`usuarios_acesso.municipios`. Lista vazia não concede acesso privado; perfil admin
também não constitui autorização municipal implícita.

Administradores podem atribuir municípios pela área **Usuários e acesso**.
`PUT /api/admin/usuarios/{usuario}/municipios` valida os códigos e registra antes,
depois e responsável no log existente. Autoalteração permanece proibida. As
permissões são recarregadas ao consultar e ao confirmar, inclusive entre canais.

Os artefatos de leitura são persistidos em `clara_evidencias`, ligados à mensagem
e à conversa. Assim, os cartões de fonte e números permanecem ao reabrir ou
atualizar o histórico. As evidências descrevem a consulta daquele momento, não
uma atualização automática dos dados de origem.

## Confirmações duráveis

`clara_acoes` guarda a proposta, argumentos, conversa, expiração e resultado.
O cliente confirma somente `acao_id` na conversa de origem. Argumentos ou nomes
de ferramenta enviados adicionalmente pelo cliente não substituem a proposta.

- A proposta expira em 24 horas e pode ser cancelada enquanto pendente.
- A transição `pendente → executando` é condicional no banco; apenas uma
  requisição consegue adquiri-la.
- Uma confirmação repetida de uma ação concluída retorna os eventos já salvos.
- O resultado é salvo antes de ser transmitido ao cliente.
- Falha após possível escrita fica em `verificar_resultado`; não há tentativa
  automática que possa duplicar o efeito. É necessário conferir o resultado
  operacional antes de solicitar outra ação.
- Uma interrupção do processo pode deixar a ação em `executando`. Esse estado
  também bloqueia repetição automática e exige conferência operacional.

Isso garante no máximo uma tentativa por proposta. Não se apresenta como uma
transação distribuída entre o armazenamento da Clara e o armazenamento de ETPs.
O rascunho continua exigindo dados locais e revisão humana. Um `alerta_id` de
outro município é recusado antes da criação do documento.

Endpoints adicionais:

| Rota | Finalidade |
| --- | --- |
| `GET /api/susbot/conversas/{id}/hub` | Contexto, ações e resultados da conversa do usuário |
| `DELETE /api/susbot/conversas/{id}/acoes/{acao_id}` | Cancelar uma proposta pendente |

## Banco e ativação

O SQLite cria as tabelas pelo `init_db`. No Supabase, executar
[`supabase/clara_hub.sql`](../supabase/clara_hub.sql) após a estrutura existente.
As tabelas têm RLS habilitada, sem políticas de cliente; privilégios de `anon` e
`authenticated` são revogados. Somente o backend usa a chave privilegiada e
verifica ownership em cada rota. O aviso informativo de RLS sem políticas é
intencional para esse modelo de acesso exclusivo pelo servidor.

As tabelas **já foram aplicadas no Supabase configurado neste projeto**.
Criação, leitura, transição condicional e exclusão em cascata foram verificadas
também pela API PostgREST real, com registros temporários removidos ao final.

O webhook real **já foi atualizado**, preservando a URL e as atualizações
pendentes, para aceitar `message` e `callback_query`. O script de túnel contém a
mesma configuração. A interface usa o teclado inline nativo do Telegram e
responde a `answerCallbackQuery` para encerrar o indicador de carregamento.

Para usar as mudanças em um servidor que já estava rodando, atualizar o código,
instalar a mesma versão testada e reiniciar o backend; publicar o build atualizado
do frontend. Não basta alterar o webhook ou o banco. Esta implementação não
equivale a uma implantação comprovada do novo backend no servidor remoto.

## Validação e limites

Verificações locais concluídas em 11/09/2026: **283 testes Python aprovados**,
**5 testes Playwright aprovados** (hub e regressão de fluxo/acessibilidade) e
**build de produção do frontend aprovado**. A suíte Python isola a URL do
Supabase para não consultar a base real; a validação remota foi executada
separadamente, com registros temporários controlados.

- Testes cobrem a preservação de contexto, seleção Telegram → web, ownership,
  município autorizado, revogação, adulteração de argumentos, confirmação
  concorrente, repetição, expiração, cancelamento e falha após possível efeito.
- Testes de interface cobrem retomada de conversa originada no Telegram,
  contexto visível, envio do identificador de ação e dimensões desktop/mobile.
- A fonte de aquisição é testada com o mesmo serviço da tela, incluindo unidade,
  período, item exato e zero medido.
- Fluxos automatizados substituem modelo e envio Telegram por fixtures. Nenhuma
  conversa foi enviada a usuários para validar esta entrega.
- Ainda é necessário exercitar o novo backend implantado com uma conta pareada:
  clicar na conversa, continuar por texto/áudio e confirmar uma proposta na web.
  Qualidade das respostas livres do modelo e transcrição ao vivo dependem do
  runtime instalado; os testes de contrato não comprovam essa qualidade.

Referências de implementação: [Telegram Bot API](https://core.telegram.org/bots/api#inlinekeyboardmarkup)
e [segurança da Data API Supabase](https://supabase.com/docs/guides/api/securing-your-api).
