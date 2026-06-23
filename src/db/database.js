'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { config } = require('../config');

class Database {
  constructor(filename) {
    this.filename = filename;
    this.db = null;
  }

  async connect() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });

    this.db = await new Promise((resolve, reject) => {
      const instance = new sqlite3.Database(this.filename, (error) => {
        if (error) reject(error);
        else resolve(instance);
      });
    });

    await this.run('PRAGMA journal_mode = WAL');
    await this.run('PRAGMA foreign_keys = ON');
    await this.migrate();
  }

  async migrate() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        event_id TEXT,
        device_id TEXT,
        type TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT,
        jid TEXT,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        metadata TEXT,
        next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sent_at TEXT
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await this.run('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, next_attempt_at)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => {
        if (error) reject(error);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows);
      });
    });
  }

  async recordEvent(event) {
    const result = await this.run(
      'INSERT OR IGNORE INTO events (hash, source, event_id, device_id, type, payload) VALUES (?, ?, ?, ?, ?, ?)',
      [
        event.hash,
        event.source,
        event.eventId || null,
        event.deviceId ? String(event.deviceId) : null,
        event.type || null,
        JSON.stringify(event.payload || {}),
      ]
    );

    return result.changes === 1;
  }

  async enqueueMessage(message) {
    const result = await this.run(
      'INSERT INTO messages (phone, jid, body, metadata) VALUES (?, ?, ?, ?)',
      [
        message.phone || null,
        message.jid || null,
        message.body,
        JSON.stringify(message.metadata || {}),
      ]
    );

    return result.lastID;
  }

  async getPendingMessages(limit, maxAttempts) {
    return this.all(
      `
        SELECT *
        FROM messages
        WHERE status IN ('pending', 'failed')
          AND attempts < ?
          AND datetime(next_attempt_at) <= datetime('now')
        ORDER BY id ASC
        LIMIT ?
      `,
      [maxAttempts, limit]
    );
  }

  async resetProcessingMessages() {
    await this.run(
      "UPDATE messages SET status = 'pending', updated_at = datetime('now') WHERE status = 'processing'"
    );
  }

  async markMessageProcessing(id) {
    await this.run(
      "UPDATE messages SET status = 'processing', updated_at = datetime('now') WHERE id = ?",
      [id]
    );
  }

  async markMessageSent(id, jid) {
    await this.run(
      `
        UPDATE messages
        SET status = 'sent',
            jid = COALESCE(?, jid),
            sent_at = datetime('now'),
            updated_at = datetime('now'),
            last_error = NULL
        WHERE id = ?
      `,
      [jid || null, id]
    );
  }

  async markMessageFailed(id, error, delaySeconds) {
    await this.run(
      `
        UPDATE messages
        SET status = 'failed',
            attempts = attempts + 1,
            last_error = ?,
            next_attempt_at = datetime('now', ?),
            updated_at = datetime('now')
        WHERE id = ?
      `,
      [String(error).slice(0, 1000), `+${delaySeconds} seconds`, id]
    );
  }

  async getSetting(key) {
    const row = await this.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  async setSetting(key, value) {
    await this.run(
      `
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `,
      [key, value]
    );
  }

  async health() {
    await this.get('SELECT 1 AS ok');
    return { ok: true };
  }

  async close() {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      this.db.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.db = null;
  }
}

const database = new Database(config.databaseFile);

module.exports = { Database, database };
