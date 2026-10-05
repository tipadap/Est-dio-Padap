'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const settings = require('../lib/settings');
const users = require('../lib/users');
const password = require('../lib/password');
const csrf = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DUMMY_HASH = '$2a$12$0000000000000000000000000000000000000000000000000000';

function renderLogin(res, { email = '', error = null, status = 200 } = {}) {
  res.status(status).render('login', {
    title: 'Entrar',
    values: { email },
    error,
    loginBg: settings.get('login_bg'),
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${(req.body && req.body.email) || ''}`.toLowerCase(),
  handler: (req, res) =>
    renderLogin(res, {
      email: (req.body && req.body.email) || '',
      error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      status: 429,
    }),
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  return renderLogin(res);
});

router.post('/login', loginLimiter, csrf.verify, async (req, res, next) => {
  const email = String(req.body.email || '').trim();
  const pass = String(req.body.password || '');
  const fail = (msg, status = 401) => renderLogin(res, { email, error: msg, status });

  if (!email || !pass) return fail('Informe e-mail e senha.', 400);

  try {
    const record = users.getAuthRecordByEmail(email);
    // Mesmo sem usuário roda um compare, para não vazar tempo de resposta.
    const ok = await password.verify(pass, record ? record.password_hash : DUMMY_HASH);
    if (!record || !ok) return fail('E-mail ou senha inválidos.');
    if (!record.is_active) return fail('Este acesso está inativo. Fale com o administrador.', 403);

    const remember = req.body.remember === 'on';
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = record.id;
      // "Lembrar-me": cookie persistente; senão, cookie de sessão (some ao fechar o navegador).
      req.session.cookie.maxAge = remember ? config.rememberMeDays * 24 * 60 * 60 * 1000 : null;
      if (record.must_change_password) return res.redirect('/conta/senha');
      const returnTo = req.session.returnTo;
      delete req.session.returnTo;
      return res.redirect(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/esqueci-senha', (req, res) => {
  res.render('esqueci', { title: 'Esqueci minha senha' });
});

router.post('/logout', csrf.verify, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('estudio.sid');
    res.redirect('/login');
  });
});

router.get('/conta/senha', requireAuth, (req, res) => {
  res.render('conta/senha', { title: 'Trocar senha', error: null, active: 'conta' });
});

router.post('/conta/senha', requireAuth, csrf.verify, async (req, res, next) => {
  const { current = '', next: nextPass = '', confirm = '' } = req.body;
  const fail = (msg) => res.status(400).render('conta/senha', { title: 'Trocar senha', error: msg, active: 'conta' });
  try {
    const ok = await password.verify(current, users.getPasswordHash(req.user.id));
    if (!ok) return fail('A senha atual está incorreta.');
    if (nextPass.length < config.minPasswordLength) {
      return fail(`A nova senha precisa ter ao menos ${config.minPasswordLength} caracteres.`);
    }
    if (nextPass !== confirm) return fail('A confirmação não confere com a nova senha.');
    if (nextPass === current) return fail('A nova senha deve ser diferente da atual.');
    users.setPassword(req.user.id, await password.hash(nextPass), false);
    req.flash('success', 'Senha alterada com sucesso.');
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
