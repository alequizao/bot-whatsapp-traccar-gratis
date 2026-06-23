'use strict';

const axios = require('axios');

class TraccarService {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.client = axios.create({
      baseURL: config.traccar.baseUrl,
      timeout: 10000,
    });

    this.client.interceptors.request.use((request) => {
      if (this.config.traccar.user || this.config.traccar.pass) {
        request.headers.Authorization = `Basic ${Buffer
          .from(`${this.config.traccar.user}:${this.config.traccar.pass}`)
          .toString('base64')}`;
      }
      return request;
    });
  }

  isConfigured() {
    return Boolean(this.config.traccar.baseUrl);
  }

  async getDevices() {
    if (!this.isConfigured()) return [];
    const { data } = await this.client.get('/api/devices');
    return Array.isArray(data) ? data : [];
  }

  async getDevice(deviceId) {
    if (!this.isConfigured()) return null;
    const devices = await this.getDevices();
    return devices.find((device) => String(device.id) === String(deviceId)) || null;
  }

  async getLatestPosition(deviceId) {
    if (!this.isConfigured()) return null;
    const { data } = await this.client.get('/api/positions', {
      params: { deviceId, limit: 1 },
    });
    return Array.isArray(data) && data.length ? data[0] : null;
  }

  async health() {
    if (!this.isConfigured()) {
      return { ok: false, configured: false };
    }

    await this.client.get('/api/session');
    return { ok: true, configured: true };
  }
}

module.exports = { TraccarService };
