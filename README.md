BOT TRACCAR PARA WHATSAPP
# Manual de Instalação, Configuração e Execução do Código

# Configurado para quem utiliza traccar

Este manual orienta você na criação de um projeto Node.js que utiliza a biblioteca **whatsapp-web.js** para automatizar interações no WhatsApp e se comunicar com um servidor Traccar. Siga os passos abaixo:

---

## 1. Pré-requisitos

- **Node.js e NPM**: Certifique-se de que o Node.js (versão 12 ou superior) e o NPM estejam instalados no seu sistema.
    - Para verificar, execute no terminal:
        
        ```bash
        node -v
        npm -v
        
        ```
        
- **Git** (opcional): Caso queira clonar repositórios ou gerenciar versões.

---

## 2. Criação do Projeto

1. **Crie uma pasta para o projeto**:
    
    ```bash
    mkdir whatsapp-traccar-bot
    cd whatsapp-traccar-bot
    
    ```
    
2. **Inicialize o projeto com NPM**:
    
    ```bash
    npm init -y
    
    ```
    
    Isso criará um arquivo `package.json` com as configurações padrão.
    

---

## 3. Instalação das Dependências

Instale as bibliotecas necessárias para o projeto:

- **whatsapp-web.js**: Biblioteca para interagir com o WhatsApp Web.
- **qrcode-terminal**: Para exibir o QR Code no terminal e permitir a autenticação.
- **axios**: Para fazer requisições HTTP à API do Traccar.
- **puppeteer**: Utilizado pelo whatsapp-web.js para automação do navegador.

Execute o seguinte comando no terminal:

```bash
npm install whatsapp-web.js qrcode-terminal axios express puppeteer --force

```

---

## 4. Configuração do Código

1. **Crie o arquivo principal**:
    
    Crie um arquivo, por exemplo, `index.js`, e copie o código abaixo para ele:
    
    ```jsx
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const qrcode = require('qrcode-terminal');
    const axios = require('axios');
    const express = require('express'); // Servidor HTTP para receber mensagens do Traccar
    
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    
    // Configuração do Traccar
    const TRACCAR_URL = 'https://USUARIO:SENHA@SEU-IP:PORTA';
    const urlObj = new URL(TRACCAR_URL);
    const baseUrl = urlObj.origin;
    const authHeader = 'Basic ' + Buffer.from(`${urlObj.username}:${urlObj.password}`).toString('base64');
    
    // Inicializa o WhatsApp Web
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: 'SEU-NOME' }),
        puppeteer: {
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu'
            ],
            executablePath: require('puppeteer').executablePath(),
            dumpio: true,
            timeout: 60000
        }
    });
    
    // Gera QR Code para autenticação
    client.on('qr', qr => {
        qrcode.generate(qr, { small: true });
    });
    
    client.on('ready', () => {
        console.log('✅ WhatsApp bot está pronto!');
    });
    
    // Recebe mensagens do Traccar
    //Exemplo:
    // http://localhost:3000/send-message?phone=5582988717072&text=teste
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    
    app.all('/send-message', async (req, res) => {
        let phone = req.query.phone || req.body.phone;
        const text = req.query.text || req.body.text;
    
        if (!phone || !text) {
            return res.status(400).json({ error: 'Parâmetros inválidos' });
        }
    
        // 🔹 Correção do número para o formato correto
        phone = normalizePhoneNumber(phone);
    
        try {
            await client.sendMessage(phone + '@c.us', text);
            console.log(`📩 Mensagem enviada para ${phone}: ${text}`);
            res.json({ success: true, message: 'Mensagem enviada com sucesso' });
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            res.status(500).json({ error: 'Erro ao enviar mensagem' });
        }
    });
    
    // 🔹 Função para normalizar números brasileiros
    function normalizePhoneNumber(phone) {
        phone = phone.replace(/\D/g, ''); // Remove tudo que não for número
    
        // Se começar com 55 (Brasil), verifica o tamanho do número
        if (phone.startsWith('55')) {
            const localNumber = phone.substring(2); // Remove o 55
            if (localNumber.length === 11) {
                return phone; // Já está correto (558298XXXXXXXX)
            } else if (localNumber.length === 10) {
                return '55' + localNumber[0] + '9' + localNumber.substring(1); // Adiciona o 9 no celular
            }
        }
    
        return phone; // Retorna sem alteração se não for do Brasil
    }
    
    // Inicia o servidor para escutar requisições do Traccar
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
    
    // Processa mensagens recebidas no WhatsApp
    client.on('message', async msg => {
        if (msg.body.startsWith('/gps ')) {
            const query = msg.body.split('/gps ')[1];
            await getGPSData(query, msg.from);
        }
    });
    
    // Função para obter dados GPS do Traccar
    async function getGPSData(query, number) {
        try {
            // Obtém a lista de dispositivos
            const deviceResponse = await axios.get(`${baseUrl}/api/devices`, {
                headers: { Authorization: authHeader }
            });
    
            // Procura o dispositivo pelo uniqueId, id ou name
            const device = deviceResponse.data.find(d => 
                d.id == query || d.name.toLowerCase() === query.toLowerCase() || d.uniqueId == query
            );
    
            if (!device) {
                return client.sendMessage(number, '❌ Dispositivo não encontrado.');
            }
    
            // Obtém a posição mais recente do dispositivo
            const positionsResponse = await axios.get(`${baseUrl}/api/positions`, {
                headers: { Authorization: authHeader }
            });
    
            const position = positionsResponse.data.find(p => p.deviceId === device.id);
    
            if (!position) {
                return client.sendMessage(number, '⚠️ Não foi possível obter a posição do dispositivo.');
            }
    
            // Formata a resposta
            const googleMapsLink = `https://www.google.com/maps?q=${position.latitude},${position.longitude}`;
            const message = `🚗 *Informações do Dispositivo:*
    🏷️ *Nome*: ${device.name}
    ⚡ *Status*: ${device.status}
    📍 *Localização Atual:*
    🌍 *Latitude*: ${position.latitude}
    🌐 *Longitude*: ${position.longitude}
    🏠 *Endereço*: ${position.address || 'Endereço não disponível'}
    🔗 *Google Maps*: ${googleMapsLink}`;
    
            return client.sendMessage(number, message);
        } catch (error) {
            console.error('Erro ao buscar GPS:', error);
            return client.sendMessage(number, '⚠️ Ocorreu um erro ao consultar o Traccar.');
        }
    }
    
    client.initialize();
    
    ```
    

No contexto da URL const TRACCAR_URL = 'https://USUARIO:SENHA@SEU-IP:PORTA';, a autenticação básica HTTP é implementada incorporando o nome de usuário (USUARIO) e a senha (SENHA) diretamente na URL. Essa técnica permite que o cliente se autentique automaticamente ao acessar o recurso especificado. 

    
2. **Configurações Específicas**:
    - **TRACCAR_URL**: Substitua `USUARIO` e `SENHA` pelos dados reais do seu servidor Traccar.
    - **clientId**: No objeto `LocalAuth`, você pode alterar o `clientId` caso deseje diferenciar esta instância de outras.

---

## 5. Execução do Projeto

1. **Execute o código**:
No terminal, dentro da pasta do projeto, execute:
    
    ```bash
    node index.js
    
    ```
    
2. **Autenticação no WhatsApp**:
    - Ao executar o código, um QR Code será gerado no terminal.
    - Abra o WhatsApp no seu celular, acesse **Configurações > WhatsApp Web/Desktop > Escanear QR Code** e aponte para o QR Code exibido.
    - Após a leitura, o bot exibirá a mensagem `WhatsApp bot está pronto!` no terminal.

---

## 6. Teste das Funcionalidades

- **Enviar comando /gps**:
    - Abra uma conversa no WhatsApp com o número que foi autenticado.
    - Envie uma mensagem no formato:
        
        ```
        /gps <ID ou Nome do Dispositivo>
        
        ```
        
    - O bot irá buscar os dados GPS do dispositivo e responderá com as informações, incluindo um link para o Google Maps.

---

## 7. Considerações Finais e Dicas

- **Erros e Logs**:
    - Qualquer erro relacionado à comunicação com o Traccar ou problemas de conexão serão exibidos no console. Verifique os logs para depurar possíveis problemas.
- **Ambiente de Desenvolvimento**:
    - Se desejar rodar o projeto em um ambiente de produção, considere as configurações do Puppeteer (por exemplo, utilizar o modo headless) e o tratamento adequado de erros.
- **Personalizações**:
    - O código pode ser expandido para incluir mais comandos e funcionalidades conforme sua necessidade.

### **Configuração do Traccar**

Agora, no seu `traccar.xml`, configure o envio de mensagens SMS via HTTP para o seu servidor Node.js:

```xml
<entry key='notificator.types'>web,mail,sms,command</entry>
<entry key='sms.http.url'>http://SEU_IP:3000/send-message</entry>
<entry key='sms.http.template'>phone={phone}&amp;text={message}</entry>

```

### **Como Funciona?**

1️⃣ O **Traccar** envia uma requisição `POST` para `http://SEU_IP:3000/send-message` sempre que houver um evento de alerta.

2️⃣ O **Node.js recebe a requisição** e extrai `chat_id` (número de telefone) e `text` (mensagem).

3️⃣ O **bot do WhatsApp envia a mensagem** para o número recebido.

🚀 Agora, seu Traccar pode enviar alertas diretamente para o WhatsApp!

Meu instagram: https://instagram.com/alequizao
Meu whatsapp: https://wa.me/82988717072
