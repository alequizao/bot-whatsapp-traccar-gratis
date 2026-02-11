'use strict';

process.env.LOG_LEVEL = 'fatal';
require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');

const P = require('pino');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = 2000; // 🔥 2 segundos

const TRACCAR_BASE_URL = process.env.TRACCAR_BASE_URL;
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

const axiosInstance = axios.create({
    baseURL: TRACCAR_BASE_URL,
    timeout: 10000,
    headers: {
        Authorization:
            'Basic ' +
            Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64')
    }
});

// ================= WHATSAPP =================
let sock;
const deviceCache = {};
let monitorStarted = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: P({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear();
            console.log('\n📱 Escaneie o QR Code:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.clear();
            console.log('✅ WhatsApp conectado.');
            if (!monitorStarted) {
                monitorStarted = true;
                startMonitor();
            }
        }

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) startBot();
            else console.log('❌ Sessão encerrada. Apague /auth.');
        }
    });
}

// ================= MONITORAMENTO 2s =================
function startMonitor() {
    console.log('👀 Monitorando a cada 2 segundos...');

    setInterval(async () => {
        try {
            const { data: devices } = await axiosInstance.get('/api/devices');

            for (const device of devices) {
                const deviceId = device.id;

                const { data: positions } = await axiosInstance.get(
                    `/api/positions?deviceId=${deviceId}&limit=1`
                );

                if (!positions.length) continue;

                const pos = positions[0];

                const currentState = {
                    status: device.status,
                    ignition: pos.attributes?.ignition ?? null,
                    motion: pos.attributes?.motion ?? null
                };

                if (!(deviceId in deviceCache)) {
                    deviceCache[deviceId] = currentState;
                    continue;
                }

                const previousState = deviceCache[deviceId];

                if (
                    previousState.status !== currentState.status ||
                    previousState.ignition !== currentState.ignition ||
                    previousState.motion !== currentState.motion
                ) {
                    deviceCache[deviceId] = currentState;
                    await notifyChange(device, pos, previousState, currentState);
                }
            }

        } catch (err) {
            console.error('Erro monitoramento:', err.message);
        }
    }, POLL_INTERVAL);
}

// ================= ENVIO REAL =================
async function notifyChange(device, pos, oldState, newState) {
    try {
        const rawPhone =
            device.phone ||
            device.attributes?.phone ||
            null;

        const phone = normalizePhoneNumber(rawPhone);
        if (!phone) {
            console.log(`⚠️ ${device.name} sem telefone.`);
            return;
        }

        const [result] = await sock.onWhatsApp(phone);

        if (!result?.exists) {
            console.log(`❌ Número inválido WhatsApp: ${phone}`);
            return;
        }

        const jid = jidNormalizedUser(result.jid);

        const latitude = pos.latitude;
        const longitude = pos.longitude;
        const address = pos.address || 'Endereço não disponível';
        const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

        const ignitionText =
            newState.ignition === true ? 'Ligada 🔥' :
            newState.ignition === false ? 'Desligada ❄️' :
            'N/D';

        const motionText =
            newState.motion === true ? 'Em movimento 🚗' :
            newState.motion === false ? 'Parado 🛑' :
            'N/D';

        const message =
`🚨 Evento do Dispositivo

📟 ${device.name}
🌐 Status: ${newState.status}
🔑 Ignição: ${ignitionText}
🚘 Movimento: ${motionText}
🕒 ${new Date().toLocaleString()}

📍 ${latitude}, ${longitude}
🏠 ${address}

🔗 ${mapsLink}`;

        await sock.sendMessage(jid, { text: message });

        console.log(`✅ Mensagem enviada: ${device.name}`);

    } catch (err) {
        console.error('Erro envio:', err.message);
    }
}

// ================= NORMALIZAÇÃO =================
function normalizePhoneNumber(phone) {
    if (!phone) return null;

    phone = phone.replace(/\D/g, '');

    if (phone.startsWith('55')) {
        const local = phone.slice(2);
        if (local.length === 11) return phone;
        if (local.length === 10)
            return '55' + local[0] + '9' + local.slice(1);
    }

    if (phone.length === 11)
        return '55' + phone;

    return phone;
}

// ================= START =================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

startBot();
