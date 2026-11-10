'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { migrate, MIGRATIONS, LATEST } = require('../src/migrations');

const quiet = { log: () => {} };
const schema = (db) =>
  db
    .prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => `${r.name}: ${(r.sql || '').replace(/\s+/g, ' ')}`)
    .join('\n');

test('migrações: números em sequência, sem repetição', () => {
  MIGRATIONS.forEach((m, i) => assert.strictEqual(m.version, i + 1, `migração na posição ${i} deveria ser a ${i + 1}`));
  assert.strictEqual(LATEST, MIGRATIONS.length);
});

test('migrações: banco novo fica na última versão e rodar de novo não faz nada', () => {
  const db = new Database(':memory:');
  assert.deepStrictEqual(migrate(db, quiet).to, LATEST);
  assert.strictEqual(db.pragma('user_version', { simple: true }), LATEST);
  assert.deepStrictEqual(migrate(db, quiet).applied, []);
});

test('migrações: banco antigo (antes das migrações) é adotado sem perder dados', () => {
  // Monta um banco "versão 0" com a estrutura que existia antes e alguns dados.
  const db = new Database(':memory:');
  migrate(db, quiet);
  db.prepare("INSERT INTO users (email, name, password_hash) VALUES ('a@t.com', 'A', 'x')").run();
  db.prepare("INSERT INTO presentations (owner_id, title, data) VALUES (1, 'P', '{}')").run();
  const before = schema(db);
  db.pragma('user_version = 0');

  const r = migrate(db, quiet);
  assert.strictEqual(r.from, 0);
  assert.strictEqual(r.to, LATEST);
  assert.strictEqual(schema(db), before, 'estrutura não muda');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM presentations').get().n, 1, 'dados preservados');
});

test('migrações: cópia de segurança antes de migrar banco com dados; falha desfaz a migração', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-mig-'));
  const file = path.join(dir, 'estudio.db');
  const db = new Database(file);
  migrate(db, quiet);
  db.prepare("INSERT INTO users (email, name, password_hash) VALUES ('a@t.com', 'A', 'x')").run();

  // Simula uma próxima versão do sistema com uma migração nova.
  const next = { version: LATEST + 1, name: 'teste: coluna nova', up: (d) => d.exec("ALTER TABLE users ADD COLUMN apelido TEXT NOT NULL DEFAULT ''") };
  MIGRATIONS.push(next);
  try {
    const r = migrate(db, { ...quiet, backupDir: path.join(dir, 'backups') });
    assert.deepStrictEqual(r.applied, ['teste: coluna nova']);
    const copia = path.join(dir, 'backups', `antes-migracao-v${LATEST}-para-v${LATEST + 1}.db`);
    assert.ok(fs.existsSync(copia), 'cópia antes da migração');
    const old = new Database(copia, { readonly: true });
    assert.strictEqual(old.pragma('user_version', { simple: true }), LATEST);
    assert.strictEqual(old.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    old.close();
  } finally {
    MIGRATIONS.pop();
  }

  // Migração com erro: nada fica pela metade e a versão não avança.
  const broken = { version: LATEST + 2, name: 'quebrada', up: (d) => { d.exec('CREATE TABLE temporaria (x)'); throw new Error('falhou'); } };
  MIGRATIONS.push(broken);
  try {
    assert.throws(() => migrate(db, quiet), /falhou/);
    assert.strictEqual(db.pragma('user_version', { simple: true }), LATEST + 1);
    assert.ok(!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'temporaria'").get(), 'transação desfeita');
  } finally {
    MIGRATIONS.pop();
  }

  // Banco de uma versão mais nova (ex.: deploy voltado): não mexe.
  assert.deepStrictEqual(migrate(db, quiet).applied, []);
  db.close();
});
