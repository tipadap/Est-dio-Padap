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
module.exports = function bootstrapAdmin() {
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
