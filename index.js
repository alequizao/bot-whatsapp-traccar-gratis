'use strict';

require('dotenv').config();

const { createApp } = require('./src/http/app');
const { config } = require('./src/config');
const { logger } = require('./src/logger');
const { database } = require('./src/db/database');
const { WhatsAppService } = require('./src/services/whatsapp');
const { TraccarService } = require('./src/services/traccar');
const { MessageQueue } = require('./src/services/messageQueue');
const { EventService } = require('./src/services/eventService');
const { BackupService } = require('./src/services/backup');

let server;
let shuttingDown = false;

async function main() {
  await database.connect();
  await database.resetProcessingMessages();

  const whatsapp = new WhatsAppService({ config, logger });
  const traccar = new TraccarService({ config, logger });
  const messageQueue = new MessageQueue({ config, logger, database, whatsapp });
  const eventService = new EventService({
    config,
    logger,
    database,
    traccar,
    messageQueue,
  });
  const backupService = new BackupService({ config, logger });

  const app = createApp({
    config,
    logger,
    database,
    whatsapp,
    traccar,
    messageQueue,
    eventService,
  });

  server = app.listen(config.port, () => {
    logger.info('HTTP server started', { port: config.port });
  });

  await whatsapp.connect();
  messageQueue.start();
  eventService.startMonitor();
  backupService.start();
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutdown requested', { signal });

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await database.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

main().catch((error) => {
  logger.error('Fatal startup error', { error });
  process.exit(1);
});
