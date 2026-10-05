'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(config.paths.data, { recursive: true });
fs.mkdirSync(config.paths.uploads, { recursive: true });

const db = new Database(config.paths.db);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name                  TEXT NOT NULL DEFAULT '',
    password_hash         TEXT NOT NULL,
    is_admin              INTEGER NOT NULL DEFAULT 0,
    is_active             INTEGER NOT NULL DEFAULT 1,
    must_change_password  INTEGER NOT NULL DEFAULT 1,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- data = JSON com os slides (ver src/lib/sanitize.js para o formato).
  CREATE TABLE IF NOT EXISTS presentations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    data          TEXT NOT NULL,
    team_visible  INTEGER NOT NULL DEFAULT 0,
    share_token   TEXT UNIQUE,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_presentations_owner ON presentations(owner_id);

  -- category: banco (banco de imagens), portfolio (produtos), user (enviadas pelo usuário).
  CREATE TABLE IF NOT EXISTS assets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category       TEXT NOT NULL CHECK (category IN ('banco', 'portfolio', 'user')),
    owner_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    filename       TEXT NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);

  -- Preferências do sistema (imagem do login, banner, foto padrão de cada modelo).
  CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
`);

module.exports = db;
