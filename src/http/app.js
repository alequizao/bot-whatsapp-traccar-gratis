'use strict';

const express = require('express');
const { normalizePhoneNumber } = require('../utils/phone');

function createApp({ config, logger, database, whatsapp, traccar, messageQueue, eventService }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', asyncHandler(async (_request, response) => {
    const [queueStats, dbHealth] = await Promise.all([
      messageQueue.stats(),
      database.health(),
    ]);

    response.json({
      ok: true,
      uptime: process.uptime(),
      database: dbHealth,
      whatsapp: whatsapp.status(),
      queue: queueStats,
    });
  }));

  app.post('/webhook/traccar', validateWebhookToken(config), asyncHandler(async (request, response) => {
    const result = await eventService.handleWebhook(request.body || {});
    response.status(result.queued ? 202 : 200).json(result);
  }));

  const adminRouter = express.Router();
  adminRouter.use(validateAdminToken(config));

  adminRouter.get('/status', asyncHandler(async (_request, response) => {
    const queueStats = await messageQueue.stats();
    response.json({
      env: config.env,
      whatsapp: whatsapp.status(),
      queue: queueStats,
      traccar: {
        configured: traccar.isConfigured(),
        pollEnabled: config.traccar.pollEnabled,
        pollIntervalMs: config.traccar.pollIntervalMs,
      },
    });
  }));

  adminRouter.get('/events', asyncHandler(async (request, response) => {
    const limit = clampLimit(request.query.limit, 50);
    const rows = await database.all(
      'SELECT id, source, event_id, device_id, type, created_at FROM events ORDER BY id DESC LIMIT ?',
      [limit]
    );
    response.json({ data: rows });
  }));

  adminRouter.get('/messages', asyncHandler(async (request, response) => {
    const limit = clampLimit(request.query.limit, 50);
    const rows = await database.all(
      `
        SELECT id, phone, jid, status, attempts, last_error, created_at, updated_at, sent_at
        FROM messages
        ORDER BY id DESC
        LIMIT ?
      `,
      [limit]
    );
    response.json({ data: rows });
  }));

  adminRouter.post('/messages', asyncHandler(async (request, response) => {
    const phone = normalizePhoneNumber(request.body.phone);
    const body = request.body.message || request.body.body;

    if (!phone && !request.body.jid) {
      response.status(400).json({ error: 'phone or jid is required' });
      return;
    }

    if (!body) {
      response.status(400).json({ error: 'message is required' });
      return;
    }

    const id = await messageQueue.enqueue({
      phone,
      jid: request.body.jid,
      body,
      metadata: { source: 'admin-api' },
    });

    response.status(202).json({ queued: true, id });
  }));

  adminRouter.get('/templates', asyncHandler(async (_request, response) => {
    const eventTemplate = await database.getSetting('event_template');
    response.json({
      eventTemplate: eventTemplate || config.templates.event,
      usingDefault: !eventTemplate,
    });
  }));

  adminRouter.put('/templates', asyncHandler(async (request, response) => {
    const eventTemplate = request.body.eventTemplate;
    if (!eventTemplate || typeof eventTemplate !== 'string') {
      response.status(400).json({ error: 'eventTemplate is required' });
      return;
    }

    await database.setSetting('event_template', eventTemplate);
    response.json({ ok: true });
  }));

  adminRouter.post('/traccar/poll', asyncHandler(async (_request, response) => {
    await eventService.pollTraccar();
    response.json({ ok: true });
  }));

  app.use('/api', adminRouter);

  app.use((request, response) => {
    response.status(404).json({
      error: 'not_found',
      path: request.path,
    });
  });

  app.use((error, _request, response, _next) => {
    logger.error('HTTP request failed', { error });
    response.status(error.status || 500).json({
      error: 'internal_error',
      message: config.env === 'production' ? 'Internal server error' : error.message,
    });
  });

  return app;
}

function validateAdminToken(config) {
  return (request, response, next) => {
    if (!config.adminToken) {
      next();
      return;
    }

    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : request.headers['x-admin-token'];

    if (token !== config.adminToken) {
      response.status(401).json({ error: 'unauthorized' });
      return;
    }

    next();
  };
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function validateWebhookToken(config) {
  return (request, response, next) => {
    if (!config.traccar.webhookToken) {
      next();
      return;
    }

    const token = request.headers['x-traccar-token'] || request.query.token;
    if (token !== config.traccar.webhookToken) {
      response.status(401).json({ error: 'unauthorized' });
      return;
    }

    next();
  };
}

function clampLimit(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 500));
}

module.exports = { createApp };
