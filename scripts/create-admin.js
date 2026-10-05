'use strict';

// Uso: npm run create-admin -- email@empresa.com "Nome" senha
const users = require('../src/lib/users');
const password = require('../src/lib/password');
const config = require('../src/config');

(async () => {
  const [email, name, pass] = process.argv.slice(2);
  if (!email || !name || !pass || pass.length < config.minPasswordLength) {
    console.error(`Uso: npm run create-admin -- email "Nome" senha (mín. ${config.minPasswordLength} caracteres)`);
    process.exit(1);
  }
  if (users.emailTaken(email)) {
    console.error('Já existe um usuário com esse e-mail.');
    process.exit(1);
  }
  users.create({ email, name, passwordHash: await password.hash(pass), isAdmin: true, mustChange: false });
  console.log(`Administrador ${email} criado.`);
})();
