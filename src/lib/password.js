'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');

/**
 * Gera o hash bcrypt (lento, com salt) de uma senha em texto puro.
 * O hash é o único valor guardado no banco — a senha nunca é persistida.
 */
function hash(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/** Versão síncrona — usada só no bootstrap do admin inicial, antes do servidor subir. */
function hashSync(plain) {
  return bcrypt.hashSync(plain, config.bcryptRounds);
}

/**
 * Confere uma senha digitada contra o hash guardado.
 * Recebido pelo servidor via HTTPS; comparação em tempo constante feita pelo bcrypt.
 */
function verify(plain, storedHash) {
  if (!storedHash) return Promise.resolve(false);
  return bcrypt.compare(plain, storedHash);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Senha temporária para o primeiro acesso (o usuário é obrigado a trocar). */
function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

module.exports = { hash, hashSync, verify, generateTempPassword };
