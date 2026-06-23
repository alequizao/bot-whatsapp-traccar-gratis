'use strict';

const { normalizePhoneNumber } = require('../utils/phone');
const { renderTemplate, stateLabels } = require('../utils/template');
const { createHash } = require('../utils/hash');

class EventService {
  constructor({ config, logger, database, traccar, messageQueue }) {
    this.config = config;
    this.logger = logger;
    this.database = database;
    this.traccar = traccar;
    this.messageQueue = messageQueue;
    this.deviceCache = new Map();
    this.lastPositionNotification = new Map();
    this.monitorTimer = null;
  }

  startMonitor() {
    if (!this.config.traccar.pollEnabled || this.monitorTimer) return;

    this.monitorTimer = setInterval(() => {
      this.pollTraccar().catch((error) => {
        this.logger.error('Traccar monitor failed', { error });
      });
    }, this.config.traccar.pollIntervalMs);

    this.logger.info('Traccar monitor started', {
      intervalMs: this.config.traccar.pollIntervalMs,
    });
  }

  async pollTraccar() {
    const devices = await this.traccar.getDevices();

    for (const device of devices) {
      const position = await this.traccar.getLatestPosition(device.id);
      if (!position) continue;

      const currentState = this.extractState(device, position);
      const positionKey = this.extractPositionKey(position);
      const previousSnapshot = this.deviceCache.get(String(device.id));
      const previousState = previousSnapshot?.state;

      this.deviceCache.set(String(device.id), {
        state: currentState,
        positionKey,
      });

      if (!previousSnapshot) {
        this.logger.info('Device baseline captured', {
          deviceId: device.id,
          deviceName: device.name,
          notifyOnStartup: this.config.traccar.notifyOnStartup,
        });

        if (this.config.traccar.notifyOnStartup) {
          await this.handleEvent({
            source: 'poll',
            type: 'startup-state',
            device,
            position,
            previousState: null,
            currentState,
            raw: { device, position, currentState },
          });
        }

        continue;
      }

      if (this.hasStateChanged(previousState, currentState)) {
        await this.handleEvent({
          source: 'poll',
          type: 'state-change',
          device,
          position,
          previousState,
          currentState,
          raw: { device, position, previousState, currentState },
        });

        continue;
      }

      if (this.shouldNotifyPositionChange(device.id, previousSnapshot.positionKey, positionKey)) {
        await this.handleEvent({
          source: 'poll',
          type: 'position-change',
          device,
          position,
          previousState,
          currentState,
          raw: { device, position, previousState, currentState },
        });
      }
    }
  }

  async handleWebhook(payload) {
    const event = payload.event || payload;
    const position = payload.position || {};
    let device = payload.device || null;

    const deviceId = event.deviceId || position.deviceId || device?.id;
    if (!device && deviceId) {
      device = await this.traccar.getDevice(deviceId);
    }

    if (!device) {
      device = {
        id: deviceId || 'unknown',
        name: payload.deviceName || event.deviceName || `Device ${deviceId || 'unknown'}`,
        phone: payload.phone || event.phone,
        attributes: payload.attributes || event.attributes || {},
      };
    }

    const currentState = this.extractState(device, position);

    return this.handleEvent({
      source: 'webhook',
      type: event.type || payload.type || 'traccar-event',
      eventId: event.id || payload.id,
      device,
      position,
      previousState: null,
      currentState,
      raw: payload,
    });
  }

  async handleEvent(event) {
    const phone = normalizePhoneNumber(
      event.device.phone ||
      event.device.contact ||
      event.device.attributes?.phone ||
      event.device.attributes?.whatsapp
    );

    if (!phone) {
      this.logger.warn('Skipping event without device phone', {
        deviceId: event.device.id,
        deviceName: event.device.name,
      });
      return { queued: false, reason: 'missing-phone' };
    }

    const hash = this.buildEventHash(event);
    const inserted = await this.database.recordEvent({
      hash,
      source: event.source,
      eventId: event.eventId,
      deviceId: event.device.id,
      type: event.type,
      payload: event.raw,
    });

    if (!inserted) {
      this.logger.info('Duplicate event ignored', { hash, deviceId: event.device.id });
      return { queued: false, reason: 'duplicate' };
    }

    const body = await this.renderEventMessage(event);
    const messageId = await this.messageQueue.enqueue({
      phone,
      body,
      metadata: {
        eventHash: hash,
        source: event.source,
        deviceId: event.device.id,
        type: event.type,
      },
    });

    return { queued: true, messageId };
  }

  extractState(device, position) {
    return {
      status: device.status || 'unknown',
      ignition: position.attributes?.ignition ?? device.attributes?.ignition ?? null,
      motion: position.attributes?.motion ?? device.attributes?.motion ?? null,
    };
  }

  hasStateChanged(previousState, currentState) {
    return (
      previousState.status !== currentState.status ||
      previousState.ignition !== currentState.ignition ||
      previousState.motion !== currentState.motion
    );
  }

  extractPositionKey(position) {
    return String(position.id || position.fixTime || position.deviceTime || position.serverTime || '');
  }

  shouldNotifyPositionChange(deviceId, previousPositionKey, currentPositionKey) {
    if (!this.config.traccar.notifyPositionChanges) return false;
    if (!currentPositionKey || previousPositionKey === currentPositionKey) return false;

    const key = String(deviceId);
    const lastSentAt = this.lastPositionNotification.get(key) || 0;
    const elapsed = Date.now() - lastSentAt;
    if (elapsed < this.config.traccar.positionMinIntervalMs) return false;

    this.lastPositionNotification.set(key, Date.now());
    return true;
  }

  buildEventHash(event) {
    if (event.eventId) {
      return createHash({
        source: event.source,
        eventId: event.eventId,
        deviceId: event.device.id,
        type: event.type,
      });
    }

    return createHash({
      source: event.source,
      deviceId: event.device.id,
      type: event.type,
      status: event.currentState.status,
      ignition: event.currentState.ignition,
      motion: event.currentState.motion,
      fixTime: event.position.fixTime || event.position.deviceTime || event.position.serverTime,
      latitude: event.position.latitude,
      longitude: event.position.longitude,
    });
  }

  async renderEventMessage(event) {
    const savedTemplate = await this.database.getSetting('event_template');
    const template = savedTemplate || this.config.templates.event;
    const latitude = event.position.latitude || '';
    const longitude = event.position.longitude || '';
    const labels = stateLabels(event.currentState);

    return renderTemplate(template, {
      device: event.device,
      state: {
        ...event.currentState,
        ...labels,
      },
      previousState: event.previousState || {},
      event: {
        type: event.type,
        source: event.source,
        date: new Date().toLocaleString('pt-BR'),
      },
      position: {
        ...event.position,
        latitude,
        longitude,
        address: event.position.address || 'Endereco nao disponivel',
        mapsLink: latitude && longitude ? `https://www.google.com/maps?q=${latitude},${longitude}` : 'N/D',
      },
    });
  }
}

module.exports = { EventService };
