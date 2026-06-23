# Traccar WhatsApp Bot

Bot Node.js para receber eventos do Traccar e enviar alertas no WhatsApp usando Baileys.

## Recursos

- Webhook Traccar em `POST /webhook/traccar`
- Monitoramento por polling do Traccar
- SQLite para eventos, fila e templates
- Winston logs em `logs/combined.log` e `logs/error.log`
- Anti-duplicacao de eventos por hash persistente
- Fila de mensagens com retry e rate limit
- Reconexao automatica do Baileys
- Tratamento global de erros
- Templates configuraveis via API
- PM2 ready com `ecosystem.config.js`
- Dockerfile e `docker-compose.yml`
- Backup automatico da sessao WhatsApp
- Health check em `GET /health`
- API REST administrativa em `/api`

## Instalacao local

```bash
npm install
cp .env.example .env
npm start
```

No primeiro start, escaneie o QR Code exibido no terminal. A sessao fica salva em `auth/`.

## Configuracao

Edite o arquivo `.env`:

```env
PORT=3000
ADMIN_TOKEN=troque-este-token

TRACCAR_BASE_URL=http://SEU_SERVIDOR:8082
TRACCAR_USER=SEU_USUARIO
TRACCAR_PASS=SUA_SENHA
TRACCAR_WEBHOOK_TOKEN=troque-token-webhook
```

Se `ADMIN_TOKEN` ficar vazio, a API administrativa fica sem autenticacao. Em producao, mantenha um token forte.

## Webhook Traccar

Configure o Traccar para enviar eventos para:

```text
http://SEU_SERVIDOR:3000/webhook/traccar?token=troque-token-webhook
```

O bot tambem pode monitorar por polling. Controle isso com:

```env
TRACCAR_POLL_ENABLED=true
TRACCAR_POLL_INTERVAL_MS=10000
```

## API administrativa

Use o header:

```text
Authorization: Bearer SEU_ADMIN_TOKEN
```

Endpoints:

- `GET /health`: saude do servico
- `GET /api/status`: status do WhatsApp, fila e Traccar
- `GET /api/events?limit=50`: ultimos eventos processados
- `GET /api/messages?limit=50`: ultimas mensagens da fila
- `POST /api/messages`: enfileira mensagem manual
- `GET /api/templates`: consulta template atual
- `PUT /api/templates`: altera template de evento
- `POST /api/traccar/poll`: executa uma rodada manual de polling

Exemplo de envio manual:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer SEU_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"5582999999999\",\"message\":\"Teste do bot\"}"
```

## Templates

Variaveis disponiveis no template:

- `{{device.name}}`
- `{{state.status}}`
- `{{state.ignitionText}}`
- `{{state.motionText}}`
- `{{event.type}}`
- `{{event.date}}`
- `{{position.latitude}}`
- `{{position.longitude}}`
- `{{position.address}}`
- `{{position.mapsLink}}`

Atualizacao:

```bash
curl -X PUT http://localhost:3000/api/templates \
  -H "Authorization: Bearer SEU_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventTemplate\":\"Alerta {{device.name}}\\nStatus: {{state.status}}\\n{{position.mapsLink}}\"}"
```

## PM2

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

Volumes persistidos:

- `./auth`: sessao WhatsApp
- `./data`: banco SQLite
- `./logs`: logs Winston
- `./backups`: backups automaticos da sessao

## Estrutura

```text
src/config        configuracao por ambiente
src/db            SQLite e migrations
src/http          Express, health, webhook e API
src/services      WhatsApp, Traccar, fila, eventos e backup
src/utils         telefone, templates e hash
```
