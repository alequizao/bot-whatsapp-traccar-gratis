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
