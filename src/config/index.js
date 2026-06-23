'use strict';

const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const config = {
  env: process.env.NODE_ENV || 'development',
  rootDir,
  port: asNumber(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  adminToken: process.env.ADMIN_TOKEN || '',
  databaseFile: path.resolve(rootDir, process.env.DATABASE_FILE || 'data/bot.sqlite'),
  logsDir: path.resolve(rootDir, process.env.LOGS_DIR || 'logs'),
  authDir: path.resolve(rootDir, process.env.AUTH_DIR || 'auth'),
  backupDir: path.resolve(rootDir, process.env.BACKUP_DIR || 'backups'),
  backupIntervalMs: asNumber(process.env.BACKUP_INTERVAL_MS, 60 * 60 * 1000),
  backupRetention: asNumber(process.env.BACKUP_RETENTION, 10),
  traccar: {
    baseUrl: process.env.TRACCAR_BASE_URL || '',
    user: process.env.TRACCAR_USER || '',
    pass: process.env.TRACCAR_PASS || '',
    pollEnabled: asBoolean(process.env.TRACCAR_POLL_ENABLED, true),
    pollIntervalMs: asNumber(process.env.TRACCAR_POLL_INTERVAL_MS, 10000),
    notifyOnStartup: asBoolean(process.env.TRACCAR_NOTIFY_ON_STARTUP, true),
    notifyPositionChanges: asBoolean(process.env.TRACCAR_NOTIFY_POSITION_CHANGES, false),
    positionMinIntervalMs: asNumber(process.env.TRACCAR_POSITION_MIN_INTERVAL_MS, 5 * 60 * 1000),
    webhookToken: process.env.TRACCAR_WEBHOOK_TOKEN || '',
  },
  whatsapp: {
    minSendIntervalMs: asNumber(process.env.WHATSAPP_MIN_SEND_INTERVAL_MS, 2000),
    reconnectInitialMs: asNumber(process.env.WHATSAPP_RECONNECT_INITIAL_MS, 5000),
    reconnectMaxMs: asNumber(process.env.WHATSAPP_RECONNECT_MAX_MS, 60000),
  },
  queue: {
    tickMs: asNumber(process.env.QUEUE_TICK_MS, 1000),
    batchSize: asNumber(process.env.QUEUE_BATCH_SIZE, 5),
    maxAttempts: asNumber(process.env.QUEUE_MAX_ATTEMPTS, 5),
  },
  templates: {
    event: process.env.EVENT_TEMPLATE || [
    '🚨 *ALERTA DO VEÍCULO*',
    '',
    '🚗 *Dispositivo:* {{device.name}}',
    '📡 *Status:* {{state.status}}',
    '🔑 *Ignição:* {{state.ignitionText}}',
    '🏃 *Movimento:* {{state.motionText}}',
    '📅 *Data:* {{event.date}}',
    '',
    '📍 *Localização*',
    '🌎 Latitude: {{position.latitude}}',
    '🌍 Longitude: {{position.longitude}}',
    '',
    '🏠 *Endereço:*',
    '{{position.address}}',
    '',
    '🗺️ *Abrir no Google Maps:*',
    '{{position.mapsLink}}',
    '',
    ].join('\n'),
  },
};

module.exports = { config };
