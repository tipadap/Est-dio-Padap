'use strict';

const db = require('../db');
const config = require('../config');
const password = require('./password');

/**
 * Cria o administrador inicial a partir de ADMIN_EMAIL / ADMIN_PASSWORD quando o
 * banco ainda não tem nenhum usuário (deploy no Railway, sem terminal).
 */
module.exports = function bootstrapAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const email = (process.env.ADMIN_EMAIL || '').trim();
  const pass = process.env.ADMIN_PASSWORD || '';

  if (!email || !pass) {
    console.warn(
      '[bootstrap] Banco sem usuários e ADMIN_EMAIL/ADMIN_PASSWORD não definidos. ' +
        'Defina essas variáveis (ou rode "npm run create-admin") para poder acessar o Estúdio.'
    );
    return;
  }
  if (!email.includes('@') || pass.length < config.minPasswordLength) {
    console.warn(
      `[bootstrap] ADMIN_EMAIL inválido ou ADMIN_PASSWORD com menos de ${config.minPasswordLength} caracteres. Admin não criado.`
    );
    return;
  }

  db.prepare(
    `INSERT INTO users (email, name, password_hash, is_admin, is_active, must_change_password)
     VALUES (?, 'Administrador', ?, 1, 1, 0)`
  ).run(email, password.hashSync(pass));

  console.log(`[bootstrap] Administrador inicial "${email}" criado a partir das variáveis de ambiente.`);
};
