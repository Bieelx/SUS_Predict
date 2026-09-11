# 11 — Deploy em produção (Azure)

> Registro do deploy feito em **10/09/2026** para deixar o SusPredict online para a banca.
> Nenhum segredo aparece aqui — chaves e tokens vivem só no `.env` da VM.

---

## 1. Por que sair do servidor de casa

Até setembro/2026 todo o backend rodava no servidor Ubuntu do Gabriel, exposto por túnel. Com as
chuvas, quedas de luz e de internet derrubavam o produto inteiro. Objetivo:

- Produto (site + API) numa nuvem, independente da casa.
- Servidor de casa fica **só com a IA local** (Ollama, modelo `susbot-3b`), consumida pela nuvem.
- Se a IA de casa cair, a Clara cai para Gemini → Groq sem ninguém perceber.

### Prazos que a hospedagem precisa cobrir

| Data | Evento |
|---|---|
| 17/09/2026 | Banca |
| meados de out/2026 | Apresentação intermediária |
| 24/10/2026 | Apresentação final |

---

## 2. Opções avaliadas

| Opção | Resultado | Motivo |
|---|---|---|
| Oracle Cloud Always Free | ❌ | Antifraude recusou o cadastro (tentativa de conta antiga). Além disso, limite do A1 caiu para 2 OCPU / 12 GB em 15/06/2026 e VM ociosa é recuperada |
| Hugging Face Spaces | ❌ | Desde jun–jul/2026 Spaces Docker em CPU grátis exigem PRO; também bloqueia saída FTP (PySUS) |
| Render (free) | ❌ | 512 MB RAM, 0,1 CPU, dorme após 15 min |
| DigitalOcean (GitHub Student Pack) | ❌ | Crédito encerrado em 01/08/2026 |
| Google Cloud Free Trial (US$ 300) | ❌ | Trial já tinha sido usado nessa conta Google |
| **Azure for Students (US$ 100 / 12 meses)** | ✅ | Sem cartão, validado com e-mail FIAP |

**Plano B se o crédito acabar:** trial Google Cloud ou Azure for Students na conta de outro membro do
grupo (cada pessoa tem direito ao próprio crédito).

---

## 3. Infraestrutura atual

| Item | Valor |
|---|---|
| Provedor | Azure for Students |
| Região | **North Central US** (`northcentralus`) |
| VM | `sus-predict` · **B2als_v2** (2 vCPU, 4 GB RAM) · ~US$ 30/mês |
| Sistema | Ubuntu Server 24.04 LTS (Python 3.12 nativo) |
| Disco | Standard SSD 30 GB + swap de 4 GB |
| Disponibilidade | Sem redundância de infraestrutura (sem zona) |
| Domínio | `https://suspredict.northcentralus.cloudapp.azure.com` (rótulo DNS do IP público) |
| IP público | `52.159.113.201` — estático, SKU Standard |
| Portas abertas (NSG) | 22, 80, 443 |
| Usuário SSH | `gabriel` (chave ed25519 com passphrase, `~/.ssh/azure_sus` no Mac) |

### Acesso SSH pelo Mac

```bash
ssh-add ~/.ssh/azure_sus
ssh -i ~/.ssh/azure_sus gabriel@52.159.113.201
```

O primeiro comando desbloqueia a chave no agente SSH; digite a passphrase apenas no terminal.

### Por que essas escolhas

- **Região:** a assinatura de estudante só permite `spaincentral`, `canadacentral`, `francecentral`,
  `northcentralus` e `southafricanorth` (política "Allowed resource deployment regions"). Brazil South e
  West US 2 foram recusados (`RequestDisallowedByAzure`). North Central US tem a menor latência para o
  Brasil (~150 ms) entre as permitidas.
- **Zona de disponibilidade:** com zona marcada, os tamanhos B aparecem como indisponíveis. Usar
  "Nenhuma redundância de infraestrutura necessária".
- **Tamanho:** com US$ 100 e ~44 dias até 24/10, B2als_v2 custa ~US$ 53 no período (sobra ~US$ 47,
  dá até ~dezembro). B2as_v2 (8 GB, US$ 54/mês) comeria ~US$ 87. Se faltar RAM, dá para redimensionar
  a VM sem recriar (reinicia em ~2 min).

---

## 4. Arquitetura em produção

```
Navegador ──HTTPS──▶ Caddy (VM, :443, certificado Let's Encrypt automático)
                       ├── /            → /var/www/suspredict (build do React)
                       └── /backend/*   → remove prefixo → uvicorn 127.0.0.1:8000
                                           (injeta X-API-Key só em /api/susbot/perguntar)
FastAPI ──▶ Supabase (dados curados, auth)
        ──▶ Gemini → Groq (Clara)
```

O Caddy reproduz em produção o que o proxy do Vite faz no desenvolvimento: mesma origem (sem CORS),
`VITE_API_BASE=/backend` e chave da Clara fora do bundle do navegador. **Nenhuma mudança de código
foi necessária.**

---

## 5. Configuração aplicada

### 5.1 `.env` da VM (`~/suspredict/.env`, `chmod 600`)

Copiado do Mac via `scp` e ajustado para produção:

| Variável | Valor em produção | Motivo |
|---|---|---|
| `APP_ENV` | `production` | Coerência (não lida pelo código hoje) |
| `SUS_PREDICT_DEV_AUTH` | `false` | **Segurança:** com `true`, tokens podem ser forjados com o segredo dev padrão |
| `SUSBOT_LLM_PROVIDER` | `gemini` | Ollama de casa está no Tailscale, a VM não alcança |
| `ENABLE_TELEGRAM_TUNNEL` | `false` | VM tem URL fixa, túnel desnecessário |
| `SUSBOT_API_KEYS` | chave gerada com `secrets.token_urlsafe(32)` | Mesma chave injetada pelo Caddy |
| `SUSBOT_RATE_LIMIT_PER_MINUTE` | `60` | O limite é por chave; todos os usuários compartilham a do Caddy (padrão 10 travaria a banca) |
| `SUSBOT_CORS_ORIGINS` | `https://suspredict.northcentralus.cloudapp.azure.com` | Substitui `CORS_ALLOWED_ORIGINS` |
| `FRONTEND_URL`, `AUTH_REDIRECT_URL`, `AUTH_COOKIE_SECURE` | domínio HTTPS / `true` | Coerência — nenhuma dessas é lida pelo código atual |

Variáveis `SUSBOT_LOCAL_*` ficam comentadas até a integração com o Ollama de casa.

### 5.2 Backend — systemd

`/etc/systemd/system/suspredict.service` roda
`venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000` como `gabriel`, com
`EnvironmentFile` apontando para o `.env` e `Restart=always`.

Dependências instaladas com `api/requirements_api.txt` **sem o `prophet`** (não é usado no cascade
Holt → OLS e só pesa na instalação).

Teste: `curl -s 127.0.0.1:8000/health` → `{"status":"ok"}`. Rotas como `/api/sistemas` exigem login e
respondem `401 Token ausente` sem token — comportamento esperado.

### 5.3 PySUS

O `pip` instalou o PySUS 2.11.2, que não tem mais `pysus.online_data` — o backend loga
"PySUS não disponível" e cai no fallback. Como os dados em produção são lidos do Supabase, **o PySUS
foi considerado dispensável** na VM (pode ser desinstalado para economizar RAM). Se for necessário,
fixar `pysus==1.0.1` (versão do venv local).

### 5.4 Frontend

Build na própria VM (Node do apt do Ubuntu 24.04, suficiente para Vite 5):

```bash
cd ~/suspredict/frontend
npm ci
VITE_API_BASE=/backend npm run build
sudo cp -r dist/. /var/www/suspredict/
```

### 5.5 Caddy — `/etc/caddy/Caddyfile` (`root:caddy`, `640`, contém a chave)

```
suspredict.northcentralus.cloudapp.azure.com {
    encode gzip

    handle_path /backend/* {
        @clara path /api/susbot/perguntar /api/susbot/perguntar/
        request_header @clara X-API-Key "<SUSBOT_API_KEYS>"
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        root * /var/www/suspredict
        try_files {path} /index.html
        file_server
    }
}
```

---

## 6. Rotina de atualização

Depois de um `git push` para `main`:

```bash
cd ~/suspredict && git pull
venv/bin/pip install -q -r <(grep -v '^prophet' api/requirements_api.txt)
sudo systemctl restart suspredict
cd frontend && npm ci && VITE_API_BASE=/backend npm run build && sudo cp -r dist/. /var/www/suspredict/
```

Diagnóstico rápido:

| Sintoma | Comando |
|---|---|
| Certificado / site fora | `journalctl -u caddy -n 30` |
| `/backend` retorna 502 | `sudo systemctl status suspredict` e `journalctl -u suspredict -n 40` |
| Clara retorna 401 | Chave do Caddyfile diferente de `SUSBOT_API_KEYS` |
| Clara retorna 429 | Conferir `SUSBOT_RATE_LIMIT_PER_MINUTE` e reiniciar o backend |
| `npm ci` "Killed" | Falta de memória — conferir swap com `free -h` |

---

## 7. Status

| Etapa | Status |
|---|---|
| VM, DNS, portas | ✅ |
| `.env` de produção | ✅ |
| Backend (systemd) | ✅ |
| Frontend (build + `/var/www`) | ✅ |
| Caddy + HTTPS | ✅ |
| Webhook do Telegram apontando para a VM | ⏳ pendente |
| URLs da VM no Supabase Auth | ⏳ pendente |
| Ollama de casa + fallback | ⏳ pendente (pós-banca) |

---

## 8. Pendências

### 8.1 Telegram (antes da banca)

Um bot só tem um webhook. **Desligar antes o backend de casa** (ou `ENABLE_TELEGRAM_TUNNEL=false` lá),
senão o script de túnel re-registra o webhook antigo. Na VM:

```bash
set -a; . ~/suspredict/.env; set +a
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url="https://suspredict.northcentralus.cloudapp.azure.com/backend/api/susbot/telegram/webhook" \
  -d secret_token="$TELEGRAM_WEBHOOK_SECRET" \
  -d allowed_updates='["message"]'
```

Esperado: `"ok":true`.

### 8.2 Supabase Auth

Se houver links por e-mail (confirmação, redefinição de senha): **Authentication → URL Configuration**,
adicionar `https://suspredict.northcentralus.cloudapp.azure.com` em Site URL e Redirect URLs.

### 8.3 IA local em casa (pós-banca)

- Instalar Tailscale na VM para alcançar `ollama.tail209902.ts.net` sem expor nada na internet.
- Código: hoje `SUSBOT_LLM_PROVIDER=local` usa só o `LocalClaraLLM`, **sem fallback**
  (`api/core/susbot_agent.py::_montar_llm_com_fallback`). Envolver em `FallbackClaraLLM` na ordem
  local → Gemini → Groq.
- Baixar `SUSBOT_LOCAL_TIMEOUT_SECONDS` de 90 para ~15–20 s, para o fallback entrar rápido quando a
  casa cair.

### 8.4 Repositório

- Tirar `prophet` de `api/requirements_api.txt` (elimina o `grep` da atualização).
- Fixar `pysus==1.0.1` se o PySUS voltar a ser usado — hoje nada impede a 2.x incompatível.

### 8.5 Custos e prazo

- Crédito restante: portal → **Education hub → Overview**. Sem cartão: ao zerar, a assinatura só é
  desativada.
- Para economizar entre apresentações: **Parar** a VM no portal (desaloca; IP estático é mantido).
- Antes do fim do crédito, fazer backup do SQLite (`api/sus_predict.db`) se ele tiver algo que não
  esteja no Supabase.

---

## 9. Notas de segurança

- Dev auth desligado em produção (ver 5.1).
- Chave da Clara nunca vai ao navegador: fica no `.env` e no Caddyfile (`640`).
- A primeira chave SSH gerada foi exposta por seleção no editor e **foi substituída** antes da criação
  da VM; a atual tem passphrase. Não abrir `~/.ssh/azure_sus` (sem `.pub`) no VS Code.


## 10. Desativação do backend de casa (10/09/2026)

- Acesso via Tailscale: `ssh bieelx@100.125.146.50`.
- `susbot.service` confirmado como `inactive` e `disabled` após
  `sudo systemctl disable --now susbot`.
- Encerrados os dois processos `cloudflared` que encaminhavam para `127.0.0.1:8000`
  e a sessão tmux `susbot-tunnel`; ausência de processos confirmada.
- Ollama e Tailscale continuam ativos e habilitados no boot.
- Ollama responde em `127.0.0.1:11434`; modelo `susbot-3b:latest` disponível.
- A API pública da Azure continua respondendo `{"status":"ok"}`.

**Integração de IA ainda pendente:** o `.env` da Azure foi conferido por SSH e mantém
`SUSBOT_LLM_PROVIDER=gemini`. Além disso, `tailscale serve status` na máquina de casa
mostra Funnel em `https://ollama.tail209902.ts.net` encaminhando para
`127.0.0.1:8000` (backend desativado), e não para o Ollama. Essa configuração não foi
alterada nesta etapa. Antes de usar IA local como primária, configurar acesso privado
Azure → Ollama e validar a conexão; não basta trocar o provider para `local`.


## 11. Ollama primário ativado (10/09/2026)

Esta seção substitui o estado histórico das seções 5.1, 7, 8.3 e 10 para a IA.

### Configuração efetiva

- Azure vinculada à tailnet como `sus-predict-azure`, IP `100.79.158.98`.
- Máquina de IA: `100.125.146.50`; Ollama permanece em `127.0.0.1:11434`.
- Funnel público desativado. Encaminhamento privado persistente:
  `tailscale serve --bg --tcp=11434 tcp://127.0.0.1:11434`.
- O tráfego HTTP passa dentro do túnel criptografado Tailscale; não há porta pública
  aberta para Ollama. Acesso sujeito às permissões da tailnet.
- O proxy HTTPS foi substituído pelo TCP porque o Ollama recusou o Host do domínio
  com HTTP 403. O acesso pelo IP privado foi validado.

No `.env` da Azure:

```dotenv
SUSBOT_LLM_PROVIDER=local
SUSBOT_LOCAL_BASE_URL=http://100.125.146.50:11434/v1
SUSBOT_LOCAL_MODEL=susbot-3b
SUSBOT_LOCAL_TIMEOUT_SECONDS=20
```

O sufixo `/v1` é necessário ao adaptador atual para o streaming OpenAI-compatible;
o planejamento remove esse sufixo para usar `/api/chat`.

### Código, validação e recuperação

- `api/core/susbot_agent.py` atualizado localmente e copiado à Azure: ordem
  Ollama → Gemini → Groq; reservas ausentes são ignoradas.
- 41 testes locais aprovados em `test_local_llm.py` e `test_susbot_agent.py`,
  incluindo falha do primário, falha dos dois primeiros e resposta parcial.
- Inferência real a partir da Azure com `susbot-3b`: planejamento ~3,17 s e resposta
  ~2,62 s. Medições pontuais, não benchmark de carga.
- Serviço `suspredict` reiniciado; `/backend/health` público retorna `{"status":"ok"}`.
- O timeout é por operação de rede, não um prazo total para a resposta inteira.
  Queda depois de emitido texto interrompe a resposta, sem anexar texto de outro modelo.
- O fallback foi coberto por testes simulados; consumo real das reservas cloud sob falha
  de Ollama não foi validado nesta etapa.
- Backup pré-deploy na VM: `/home/gabriel/deploy-backups/ollama-6oDAkl32/`;
  contém `susbot_agent.py` e `env` (segredo, permissão 600).
- Correção de fallback publicada no commit `522bb20`; checkout da VM reconciliado
  com a mesma versão para permitir atualizações automáticas.

Para voltar temporariamente ao Gemini, definir `SUSBOT_LLM_PROVIDER=gemini` no `.env`
da VM e executar `sudo systemctl restart suspredict`. Ollama e Tailscale podem permanecer ativos.

Referências: [instalação Linux](https://tailscale.com/docs/install/linux),
[Tailscale Serve privado](https://tailscale.com/docs/features/tailscale-serve) e
[proxy Ollama](https://docs.ollama.com/faq).


## 12. Atualização automática pela main

A VM consulta o GitHub a cada dois minutos usando `suspredict-update.timer`.
Após `git push origin main`, o próximo ciclo prepara e publica a atualização.
Não requer GitHub Actions, chave privada de deploy no GitHub ou o Mac ligado.
O repositório é público; o fetch usa HTTPS sem credencial.

### Comportamento

1. Exige checkout limpo na branch `main`; bloqueia histórico divergente e usa fast-forward.
2. Sem commit novo, termina sem instalar dependências, reconstruir ou reiniciar.
3. Gera um snapshot exato do commit, roda `npm ci` e build com `VITE_API_BASE=/backend`.
   Falha no build mantém a aplicação atual em execução.
4. Salva o frontend anterior e, se `api/requirements_api.txt` mudou, o venv anterior.
5. Para a API, avança o checkout, instala dependências somente quando necessário
   (mantendo a exclusão de Prophet), publica o frontend e inicia a API.
6. Verifica o `/backend/health` público. Falha na ativação restaura código, frontend
   e venv anterior quando alterado; pausa novas ativações até investigação.

Há uma breve indisponibilidade durante a troca; alterações de dependências podem
prolongá-la. Não é um deploy sem downtime. A verificação de saúde não substitui testes
funcionais de login, Telegram ou IA. O rollback não reverte dados ou migrações de banco.
`.env` e os arquivos ignorados pelo Git permanecem na VM; nenhum segredo é enviado ao GitHub.

### Instalação (executada como gabriel na Azure)

```bash
cd ~/suspredict
sudo install -m 755 deploy/azure-update.sh /usr/local/bin/suspredict-update
sudo install -m 644 deploy/suspredict-update.service /etc/systemd/system/
sudo install -m 644 deploy/suspredict-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now suspredict-update.timer
```

A cópia instalada do script é independente do checkout, permitindo recuperar uma
atualização que falhou. Se alterar o script ou units no Git, repetir a instalação acima.
O timer usa o usuário `gabriel` e o sudo sem senha já existente nesta VM para controlar
`suspredict` e publicar `/var/www/suspredict`; não é um modelo de isolamento entre usuários.

### Operação

```bash
# Próxima execução
systemctl list-timers suspredict-update.timer

# Logs (incluem SHA publicado e resultado)
journalctl -u suspredict-update.service -n 80 --no-pager

# Atualizar agora e acompanhar até concluir
sudo systemctl start suspredict-update.service

# Parar verificações futuras (não interrompe um deploy em andamento)
sudo systemctl disable --now suspredict-update.timer

# Depois de investigar/corrigir uma falha de ativação, liberar novas tentativas
rm -f ~/.local/state/suspredict-deploy/paused
sudo systemctl start suspredict-update.service
```

Estado em `~/.local/state/suspredict-deploy/`: `last-success`, `last-attempt`, `lock` e,
se houver falha de ativação, `paused`. Se a recuperação falhar, o log informa o diretório
`build.*` preservado com os backups. Não apagar esses backups antes da recuperação manual.
Evite editar o checkout enquanto ocorre um deploy. Para mudanças manuais, desabilite o
timer e aguarde o serviço de atualização terminar.

### Validação

- Seis testes de integração em Linux, com Git e arquivos reais e serviços simulados:
  sucesso, ciclo sem mudanças, checkout sujo, falha de build, falha de dependências e
  rollback após falha de saúde. Executar `python3 deploy/test_azure_update.py -v`.
- 41 testes do adaptador e agente de IA aprovados antes da publicação do fallback.
- Ativação do timer e deploy real: conferir o journal e `last-success` na VM.

Referências: [fast-forward no Git](https://git-scm.com/docs/git-pull) e
[timers systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html).


## 13. Recuperação do Telegram e ETP sem item

- Webhook corrigido para
  `https://suspredict.northcentralus.cloudapp.azure.com/backend/api/susbot/telegram/webhook`.
  O destino antigo era o domínio da máquina de IA. Telegram confirmou o novo webhook;
  a fila passou de uma atualização pendente para zero, sem erro de entrega informado.
- Clara: plano `gerar_etp` sem `item` provocava TypeError após confirmação.
  Agora pede o medicamento/insumo antes de confirmar; a ferramenta também valida o item
  para confirmações antigas. Não cria ETP com item ausente, vazio ou de tipo inválido.
- 60 testes locais do agente, ferramentas e adaptador aprovados.


## 14. WhatsApp via OpenWA (plano B da Meta Cloud API)

A Meta recusou envio para o Brasil na conta de teste (`Business account is restricted from
messaging users in this country`). O canal usa o gateway **não oficial** OpenWA (Baileys),
pareado por QR. Risco de banimento: usar **chip dedicado**, nunca número pessoal.

Mesma lógica do Telegram (`api/core/channel_router.py`): pareamento por link
`wa.me/<número>?text=conectar <token>` + confirmação no painel, só número pareado conversa,
histórico, sessão de 30 min, memória e áudio. Diferenças: lista de conversas numerada
(responder `1`–`6`, `0` = nova) em vez de botões; grupos e status são ignorados.

```bash
bash deploy/openwa.sh up        # container na 2785 (só loopback)
bash deploy/openwa.sh chave     # → OPENWA_API_KEY no .env
bash deploy/openwa.sh sessao    # → OPENWA_SESSION_ID no .env
bash deploy/openwa.sh qr        # escanear no chip em Aparelhos conectados
# .env: WHATSAPP_BOT_NUMBER=55DDNUMERO e OPENWA_WEBHOOK_SECRET (>= 16 caracteres)
sudo systemctl restart suspredict
bash deploy/openwa.sh webhook   # registra a URL pública .../backend/api/susbot/whatsapp/webhook
```

O webhook usa a URL pública (passa pelo Caddy): `127.0.0.1` dentro do container é o próprio
container e o guard de SSRF do OpenWA recusa IP privado. A autenticidade vem do HMAC
(`X-OpenWA-Signature`). No Supabase, reaplicar a view `susbot_conversas_resumo` de
`supabase/susbot_canais.sql` para o filtro de histórico reconhecer `whatsapp`.
