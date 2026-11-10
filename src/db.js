'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const { migrate } = require('./migrations');

fs.mkdirSync(config.paths.data, { recursive: true });
fs.mkdirSync(config.paths.uploads, { recursive: true });

const db = new Database(config.paths.db);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Estrutura das tabelas: src/migrations.js (versionada em PRAGMA user_version).
migrate(db, {
  backupDir: path.join(config.paths.data, 'backups'),
  log: process.env.NODE_ENV === 'test' ? () => {} : console.log,
});

module.exports = db;
