'use strict';

const { maskPhoneNumber } = require('../utils/phone');

class MessageQueue {
  constructor({ config, logger, database, whatsapp }) {
    this.config = config;
    this.logger = logger;
    this.database = database;
    this.whatsapp = whatsapp;
    this.timer = null;
    this.processing = false;
    this.lastSentAt = 0;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.process().catch((error) => {
        this.logger.error('Message queue tick failed', { error });
      });
    }, this.config.queue.tickMs);
    this.logger.info('Message queue started');
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async enqueue(message) {
    const id = await this.database.enqueueMessage(message);
    this.logger.info('Message queued', {
      id,
      phone: maskPhoneNumber(message.phone),
      jid: maskPhoneNumber(message.jid),
    });
    return id;
  }

  async process() {
    if (this.processing) return;
    if (!this.whatsapp.isConnected()) return;

    this.processing = true;
    try {
      const messages = await this.database.getPendingMessages(
        this.config.queue.batchSize,
        this.config.queue.maxAttempts
      );

      for (const message of messages) {
        await this.processMessage(message);
      }
    } finally {
      this.processing = false;
    }
  }

  async processMessage(message) {
    await this.database.markMessageProcessing(message.id);
    await this.waitForRateLimit();

    try {
      const jid = await this.whatsapp.sendText({
        jid: message.jid,
        phone: message.phone,
        text: message.body,
      });

      this.lastSentAt = Date.now();
      await this.database.markMessageSent(message.id, jid);
      this.logger.info('Message sent', { id: message.id, jid: maskPhoneNumber(jid) });
    } catch (error) {
      const delaySeconds = Math.min(300, 2 ** (message.attempts + 1) * 10);
      await this.database.markMessageFailed(message.id, error.message, delaySeconds);
      this.logger.warn('Message send failed', {
        id: message.id,
        attempts: message.attempts + 1,
        error: error.message,
        retryInSeconds: delaySeconds,
      });
    }
  }

  async waitForRateLimit() {
    const elapsed = Date.now() - this.lastSentAt;
    const remaining = this.config.whatsapp.minSendIntervalMs - elapsed;
    if (remaining <= 0) return;

    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  async stats() {
    const rows = await this.database.all(
      'SELECT status, COUNT(*) AS total FROM messages GROUP BY status'
    );

    return rows.reduce((stats, row) => {
      stats[row.status] = row.total;
      return stats;
    }, {});
  }
}

module.exports = { MessageQueue };
