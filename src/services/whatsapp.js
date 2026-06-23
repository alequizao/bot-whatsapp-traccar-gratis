'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');

class WhatsAppService {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.sock = null;
    this.connected = false;
    this.qr = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.startedAt = null;
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger: P({ level: 'silent' }),
      auth: state,
      printQRInTerminal: false,
      browser: ['Traccar Bot', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qr = qr;
      this.logger.info('WhatsApp QR code received. Scan it in the terminal.');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      this.connected = true;
      this.qr = null;
      this.reconnectAttempts = 0;
      this.startedAt = new Date();
      this.logger.info('WhatsApp connected');
    }

    if (connection === 'close') {
      this.connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      this.logger.warn('WhatsApp connection closed', { statusCode, loggedOut });

      if (loggedOut) {
        this.logger.error('WhatsApp session logged out. Remove auth directory and scan QR again.');
        return;
      }

      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      this.config.whatsapp.reconnectInitialMs * (2 ** this.reconnectAttempts),
      this.config.whatsapp.reconnectMaxMs
    );

    this.reconnectAttempts += 1;
    this.logger.info('Scheduling WhatsApp reconnect', { delay });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.logger.error('WhatsApp reconnect failed', { error });
        this.scheduleReconnect();
      }
    }, delay);
  }

  isConnected() {
    return Boolean(this.connected && this.sock);
  }

  async resolveJid(phone) {
    if (!this.isConnected()) {
      throw new Error('WhatsApp is not connected');
    }

    const [result] = await this.sock.onWhatsApp(phone);
    if (!result?.exists) {
      throw new Error(`Phone is not on WhatsApp: ${phone}`);
    }

    return jidNormalizedUser(result.jid);
  }

  async sendText({ jid, phone, text }) {
    if (!this.isConnected()) {
      throw new Error('WhatsApp is not connected');
    }

    const targetJid = jid || await this.resolveJid(phone);
    await this.sock.sendMessage(targetJid, { text });
    return targetJid;
  }

  status() {
    return {
      connected: this.isConnected(),
      hasQr: Boolean(this.qr),
      reconnectAttempts: this.reconnectAttempts,
      startedAt: this.startedAt,
    };
  }
}

module.exports = { WhatsAppService };
