# 🚗 Traccar WhatsApp Event Bot (Baileys 2026)

Bot para envio automático de eventos do Traccar via WhatsApp.

Monitora em tempo real:

- Status do dispositivo (online / offline / unknown)
- Ignição (ligada / desligada)
- Movimento (em movimento / parado)
- Localização atual
- Endereço
- Link Google Maps

Envio automático para o telefone cadastrado no dispositivo.

---

## 📦 Requisitos

- Node.js 18+ (recomendado Node 20 LTS)
- Traccar funcionando
- Dispositivo com telefone cadastrado
- WhatsApp válido para envio

---

## 📥 Instalação

Clone o repositório:

```bash
git clone https://github.com/alequizao/bot-whatsapp-traccar-gratis.git
cd bot-whatsapp-traccar-gratis
Instale as dependências:

npm install
⚙️ Configuração do .env
Crie um arquivo chamado:

.env
Baseie-se no arquivo .env.example.

📄 Exemplo de .env.example
PORT=3000

TRACCAR_BASE_URL=http://SEU_SERVIDOR:8082
TRACCAR_USER=SEU_USUARIO
TRACCAR_PASS=SUA_SENHA
🔎 Descrição das variáveis
Variável	Descrição
PORT	Porta onde o servidor local irá rodar
TRACCAR_BASE_URL	URL base do seu servidor Traccar
TRACCAR_USER	Usuário do Traccar
TRACCAR_PASS	Senha do Traccar
⚠️ Nunca suba seu .env para o GitHub.

Adicione ao .gitignore:

.env
auth/
📱 Como conectar o WhatsApp
Execute:

node .
Será exibido um QR Code no terminal.

Abra o WhatsApp no celular

Vá em Dispositivos conectados

Escaneie o QR Code

Após isso, a sessão será salva na pasta:

/auth
Não apague essa pasta se quiser manter a sessão.

🔄 Como funciona o monitoramento
O sistema consulta o Traccar a cada 10 segundos

Detecta mudanças de:

Status

Ignição

Movimento

Se houver alteração, envia mensagem automática

📞 Configuração do telefone no Traccar
O número deve estar cadastrado no dispositivo em:

Campo phone
ou

attributes.phone

Formato recomendado:

5582999999999
Somente números.
Sem espaços.
Sem +.
Sem traços.

🚀 Executar em Produção
Recomendado usar:

pm2 start index.js --name traccar-bot
Para salvar o processo:

pm2 save
🧠 Estrutura do Projeto
/auth
.env
index.js
package.json
README.md
🛡 Segurança
Nunca publique o .env

Nunca exponha credenciais do Traccar

Use firewall no servidor

Prefira HTTPS no Traccar

🧪 Problemas comuns
Mensagem não enviada
Número não possui WhatsApp

Número mal formatado

Campo phone vazio no Traccar

QR Code aparece sempre
Pasta /auth foi apagada

Sessão expirou

📜 Licença
Uso interno / comercial conforme sua necessidade.


---

# 📄 .gitignore recomendado

node_modules/
.env
auth/


---

# 🎯 Resultado

Agora seu repositório fica:

- Profissional
- Seguro
- Reutilizável
- Publicável
- Sem expor credenciais

Se quiser, posso criar também:

- Badge do GitHub
- Dockerfile
- docker-compose
- Deploy em VPS
- Deploy em Railway
- Deploy em Render
- Estrutura enterprise com Redis

Agora seu projeto está no nível certo para ser publicado. 🚀
