# Demonstração histórica na interface atual

O cenário de Campinas/SP em 2024 foi recuperado do commit
`7968c1f8a3c8da8487c7fe6f0a055e7c896a9540`. A implementação reaproveita os
cards, gráficos, tabelas, navegação e painel da Clara atuais.

## Acesso e roteiro

- No login, escolha **Acessar demonstração**. Não precisa de conta ou backend.
- Com uma sessão aberta, use **Configurações → Iniciar demo histórica**.
- Avance os meses na barra **Demo histórica · Campinas 2024**. Janeiro inicia
  a série; fevereiro e março mostram a aceleração; abril e maio evidenciam a
  pressão sobre o estoque fictício.
- Visão Geral mantém os quatro cards e o gráfico de evolução. Alertas e Insumos
  usam as estruturas atuais com rótulos próprios para simulação de estoque.
- **Analisar com Clara** abre o painel existente em leitura guiada local. Não é
  uma chamada ao modelo de IA; as perguntas apresentam o briefing do corte.
- Em **Roteiro e premissas**, prepare um rascunho demonstrativo de ETP. Ele aparece
  em Documentos e pode ser baixado como Markdown, identificado como rascunho sem
  validade para contratação.
- **Reiniciar demonstração** volta a janeiro e apaga os rascunhos da demo.
- **Sair da demo** retorna ao login ou à sessão autenticada anterior, preservando
  seu município e os dados operacionais em cache.

A demo e seus documentos ficam na memória desta aba. Recarregar a página encerra
o replay. A conversa guiada é reiniciada quando o corte muda. Epidemiologia,
Internações, Vacinação e Perfil mostram um aviso de área fora do cenário, sem
consultar bases atuais em paralelo ao replay.

## Dados e limites

Casos confirmados por mês de início dos sintomas: snapshot histórico do CSV
oficial CVE/SES-SP, registrado no cenário em 30/07/2026. Total de 2024: 121.473.
Não foi feita uma nova extração da fonte nesta integração.

Estoque inicial, consumo, preços, planejamento de compra e diferença de custo
emergencial são **fictícios**. Não são aquisições públicas, fornecedores reais ou
estoque das unidades. As projeções são ilustrativas e usam apenas os meses
visíveis; não executam o modelo preditivo operacional. Índice regional, SIH,
distribuição estadual e mapa ficam sem dados quando não existem no cenário.

O replay não cria tokens, não concede permissões e não escreve em Supabase,
SQLite, histórico da Clara ou serviços de mensagens. A autenticação institucional
permanece independente. A antiga opção `SUS_PREDICT_DEV_AUTH` não é necessária
para abrir esta demonstração visual local.

## Manutenção e validação

O motor Python e o dataset originais são a origem do bundle `frontend/src/demo/replay.json`.
Esse bundle é carregado sob demanda. Ele permite apresentar o cenário mesmo com
o backend remoto indisponível, sem manter um segundo cálculo em JavaScript.

Após alterar o motor ou o dataset:

```bash
venv/bin/python scripts/gerar_demo_historica_frontend.py
venv/bin/python -m pytest api/tests/test_demo_crise_historica.py api/tests/test_demo_historica_bundle.py -q
cd frontend
npm test
npm run build
npx playwright test tests/demo-historica-atual.spec.js --workers=1
```

Os testes conferem correspondência entre bundle e motor, ausência de uso de
observações futuras nas previsões, janelas de comparação, distinção entre estoque
e aquisição, navegação desktop/mobile, zero chamadas de API no replay público,
rascunho, reinício e retorno à sessão operacional.

## Fonte histórica

[CVE/SES-SP: dengue em 2024 por município e mês](https://www.saude.sp.gov.br/resources/cve-centro-de-vigilancia-epidemiologica/areas-de-vigilancia/doencas-de-transmissao-por-vetores-e-zoonoses/dados/dengue/2024/dengue24_mes.csv)
