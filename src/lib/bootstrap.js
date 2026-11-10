'use strict';

const db = require('../db');
const config = require('../config');
const password = require('./password');

/**
 * Administrador a partir das variáveis de ambiente (deploy no Railway, sem terminal).
 *
 * - Banco sem usuários: cria o admin com ADMIN_EMAIL / ADMIN_PASSWORD.
 * - ADMIN_RESET=1: cria o admin se não existir, ou redefine a senha dele (e o reativa
 *   como administrador). Serve para recuperar o acesso; remova a variável depois.
 *
 * Os logs dizem o que aconteceu, sem nunca mostrar a senha.
 */
const WIPE_KEY = 'users_wiped_with';

function readAdminEnv() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || '';
  if (!email || !pass) return { error: 'ADMIN_EMAIL e/ou ADMIN_PASSWORD não definidos.' };
  if (!email.includes('@')) return { error: 'ADMIN_EMAIL não parece um e-mail válido.' };
  if (pass.length < config.minPasswordLength) {
    return { error: `ADMIN_PASSWORD tem ${pass.length} caracteres; o mínimo é ${config.minPasswordLength}.` };
  }
  return { email, pass };
}

/**
 * ADMIN_WIPE_USERS=<código>: apaga TODOS os usuários (e, por cascata, as apresentações
 * deles), encerra todas as sessões e recria só o administrador das variáveis.
 * Cada código só é usado uma vez (fica registrado em settings), para que a variável
 * esquecida no Railway não apague tudo de novo a cada deploy.
 */
function wipeUsers() {
  const code = String(process.env.ADMIN_WIPE_USERS || '').trim();
  if (!code) return;
  const done = db.prepare('SELECT value FROM settings WHERE key = ?').get(WIPE_KEY);
  if (done && done.value === code) {
    console.log(`[bootstrap] ADMIN_WIPE_USERS "${code}" já foi aplicado antes; nada a fazer. Remova a variável.`);
    return;
  }
  const admin = readAdminEnv();
  if (admin.error) {
    console.warn(`[bootstrap] ADMIN_WIPE_USERS cancelado (nada foi apagado): ${admin.error}`);
    return;
  }
  const before = {
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    pres: db.prepare('SELECT COUNT(*) AS n FROM presentations').get().n,
  };
  db.transaction(() => {
    db.prepare('DELETE FROM users').run(); // apresentações caem junto (ON DELETE CASCADE)
    const hasSessions = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get();
    if (hasSessions) db.prepare('DELETE FROM sessions').run();
    db.prepare(
      `INSERT INTO users (email, name, password_hash, is_admin, is_active, must_change_password)
       VALUES (?, 'Administrador', ?, 1, 1, 0)`
    ).run(admin.email, password.hashSync(admin.pass));
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      WIPE_KEY,
      code
    );
  })();
  console.log(
    `[bootstrap] ADMIN_WIPE_USERS: ${before.users} usuário(s) e ${before.pres} apresentação(ões) apagados; ` +
      `sessões encerradas. Administrador "${admin.email}" recriado. Remova ADMIN_WIPE_USERS e ADMIN_PASSWORD.`
  );
}

module.exports = function bootstrapAdmin() {
  wipeUsers();
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const reset = ['1', 'true', 'sim', 'yes'].includes(String(process.env.ADMIN_RESET || '').trim().toLowerCase());
  console.log(`[bootstrap] Usuários no banco: ${count}.${reset ? ' ADMIN_RESET ativo.' : ''}`);
  if (count > 0 && !reset) return;

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || '';

  if (!email || !pass) {
    console.warn('[bootstrap] ADMIN_EMAIL e/ou ADMIN_PASSWORD não definidos. Nenhum administrador foi criado ou alterado.');
    return;
  }
  if (!email.includes('@')) {
    console.warn('[bootstrap] ADMIN_EMAIL não parece um e-mail válido. Nenhum administrador foi criado ou alterado.');
    return;
  }
  if (pass.length < config.minPasswordLength) {
    console.warn(
      `[bootstrap] ADMIN_PASSWORD tem ${pass.length} caracteres; o mínimo é ${config.minPasswordLength}. ` +
        'Nenhum administrador foi criado ou alterado.'
    );
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare(
      `UPDATE users SET password_hash = ?, is_admin = 1, is_active = 1, must_change_password = 0,
       updated_at = datetime('now') WHERE id = ?`
    ).run(password.hashSync(pass), existing.id);
    console.log(`[bootstrap] Senha do administrador "${email}" redefinida a partir das variáveis de ambiente.`);
  } else {
    db.prepare(
      `INSERT INTO users (email, name, password_hash, is_admin, is_active, must_change_password)
       VALUES (?, 'Administrador', ?, 1, 1, 0)`
    ).run(email, password.hashSync(pass));
    console.log(`[bootstrap] Administrador "${email}" criado a partir das variáveis de ambiente.`);
  }
  if (reset) console.log('[bootstrap] Acesso recuperado. Remova ADMIN_RESET (e ADMIN_PASSWORD) das variáveis.');
};
