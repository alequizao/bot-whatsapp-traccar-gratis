'use strict';

const fs = require('fs/promises');
const path = require('path');

class BackupService {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.timer = null;
  }

  start() {
    if (this.timer) return;

    this.run().catch((error) => {
      this.logger.warn('Initial auth backup failed', { error });
    });

    this.timer = setInterval(() => {
      this.run().catch((error) => {
        this.logger.warn('Scheduled auth backup failed', { error });
      });
    }, this.config.backupIntervalMs);

    this.logger.info('Auth backup scheduler started', {
      intervalMs: this.config.backupIntervalMs,
    });
  }

  async run() {
    const authExists = await this.exists(this.config.authDir);
    if (!authExists) return;

    await fs.mkdir(this.config.backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const target = path.join(this.config.backupDir, `auth-${stamp}`);

    await fs.cp(this.config.authDir, target, { recursive: true });
    await this.prune();
    this.logger.info('Auth session backup created', { target });
  }

  async prune() {
    const entries = await fs.readdir(this.config.backupDir, { withFileTypes: true });
    const backups = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('auth-'))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    const oldBackups = backups.slice(this.config.backupRetention);
    for (const backup of oldBackups) {
      await fs.rm(path.join(this.config.backupDir, backup), { recursive: true, force: true });
      this.logger.info('Old auth backup removed', { backup });
    }
  }

  async exists(target) {
    try {
      await fs.access(target);
      return true;
    } catch (_error) {
      return false;
    }
  }
}

module.exports = { BackupService };
