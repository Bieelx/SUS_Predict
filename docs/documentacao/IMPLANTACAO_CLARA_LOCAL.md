# Implantação local da Clara para a banca

Este roteiro ativa o backend no Ubuntu sem expor o Ollama nem abrir portas no roteador. Execute os comandos no servidor, dentro do `venv` Python 3.12 do projeto.

## 1. Configuração

Copie `.env.example` para `.env`, preserve as configurações de autenticação existentes e preencha:

```dotenv
SUSBOT_LLM_PROVIDER=local
SUSBOT_LOCAL_BASE_URL=http://127.0.0.1:11434/v1
SUSBOT_LOCAL_MODEL=susbot-3b
SUSBOT_API_KEYS=uma-chave-por-pessoa-separada-por-virgula
SUSBOT_CORS_ORIGINS=https://susbot.seudominio.com
CLARA_STT_PROVIDER=local
CLARA_STT_MODEL=small
CLARA_STT_DEVICE=cpu
CLARA_STT_COMPUTE_TYPE=int8
CLARA_AUDIO_MAX_SECONDS=120
CLARA_AUDIO_MAX_BYTES=10485760
```

Gere cada chave com o Python 3.12 do `venv`:

```bash
./venv/bin/python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Instale a transcrição e baixe o modelo uma vez no servidor, ainda durante a preparação:

```bash
./venv/bin/pip install -r api/requirements_api.txt
./venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
```

Depois desse download, defina `CLARA_STT_LOCAL_FILES_ONLY=true` para garantir que a
demonstração não dependa da internet para carregar o modelo.

Quando `SUSBOT_API_KEYS` estiver vazio, a camada adicional de chave fica desativada para desenvolvimento local. A autenticação normal do SusPredict continua obrigatória. O cliente web aceita a chave na opção `apiKey` de `conversarComSusbot`; não grave chaves no repositório.

## 2. Validação em localhost

```bash
curl -s http://127.0.0.1:11434/api/tags
./venv/bin/python -m pytest api/tests -q
./venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
curl -s http://127.0.0.1:8000/health
```

Teste uma pergunta autenticada pelo fluxo normal do frontend. Se as chaves adicionais estiverem ativas, envie também `X-API-Key`. Nunca publique a porta `11434`.

## 3. Serviço e túnel

Revise os caminhos e o usuário em `deploy/susbot.service.example`, copie-o para `/etc/systemd/system/susbot.service` e então execute:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now susbot
sudo systemctl status susbot --no-pager
curl -s http://127.0.0.1:8000/health
```

Crie o Cloudflare Tunnel seguindo o painel/CLI da conta e adapte `deploy/cloudflared-config.yml.example`. O ingress público deve apontar somente para `http://127.0.0.1:8000`. Mantenha a regra final `http_status:404`.

## 4. Ensaio antes da banca

- reinicie o servidor e confirme que Ollama, Clara e cloudflared sobem sozinhos;
- confirme que `/health` responde sem autenticação, mas `/api/susbot/perguntar` recusa chave inválida;
- teste duas pessoas e o limite de 10 perguntas por minuto por chave;
- teste uma pergunta conceitual que usa o modelo e uma consulta de estoque que segue o caminho determinístico;
- envie um áudio curto pelo Telegram, confira a transcrição exibida e a resposta textual;
- confira `free -h`, `ollama ps`, `nvidia-smi` e os logs dos dois serviços;
- mantenha Tailscale apenas para administração e não abra portas no roteador.

Esta entrega prepara a implantação, mas não confirma que o serviço systemd, o domínio ou o túnel estejam ativos: isso precisa ser executado e verificado no servidor Ubuntu.
