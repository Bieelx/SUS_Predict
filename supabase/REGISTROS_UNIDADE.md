# Registros da unidade

A rota `/registros-unidade` usa `estabelecimentos` como cadastro e não escolhe o PS do piloto. As atividades locais anteriores continuam disponíveis pelo link dedicado e pelos seus endereços antigos.

## Contrato do time de dados

- `estabelecimentos.id` e `cnes` são texto. `municipio_ibge6` é gerado pelo banco.
- `vacinacao_usuario` registra movimentações positivas de doses, com `entrada` ou `saida`. `vacinacao_estabelecimento` contém o saldo por estabelecimento e vacina.
- `medicamento_usuario` registra embalagens. Nome, concentração, forma farmacêutica, embalagem e quantidade por embalagem identificam uma apresentação. `medicamento_estabelecimento` contém seu saldo.
- `internacao_usuario` registra a situação dos leitos. `internacao_estabelecimento` contém a última situação por estabelecimento e tipo, sem somar atualizações.
- A aplicação grava somente no histórico após confirmação humana. Os triggers existentes atualizam os saldos na mesma transação. O histórico original não é reescrito.

## Leitura e revisão

`GET /api/clara/inputs-operacionais/estabelecimentos/{id}/registros` retorna os três saldos e até 50 registros recentes por categoria, inclusive inserções externas à Clara. A API verifica o município autorizado antes de ler os dados. Rascunhos são filtrados por usuário e estabelecimento antes do limite de 100.

A consulta de estoque da Clara também usa esses saldos quando `CLARA_REGISTROS_LOCAIS_ENABLED=true`, por meio de `CLARA_REGISTROS_DATABASE_URL`. Não há fallback para o estoque antigo se a conexão configurada falhar. Sem essa habilitação, o contrato SQLite anterior permanece disponível para os ambientes locais existentes.

Essas tabelas não fornecem consumo médio diário nem cobertura vacinal. O modelo preserva doses/embalagens, unidade e apresentação, sem inventar previsão de esgotamento. As séries históricas DATASUS e seus modelos estatísticos mantêm suas fontes próprias.

## Dependências e validação

Requer as tabelas e triggers documentados pelo time, além das migrações já existentes de registros locais e inputs operacionais. Esta alteração não recria tabelas nem executa a carga inicial destrutiva descrita no documento de vacinação.

Validação automatizada: testes de API em SQLite com triggers, contrato da consulta da Clara e Playwright com respostas HTTP simuladas. A validação não insere movimentações no Supabase de produção.
