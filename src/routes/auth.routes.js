'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const settings = require('../lib/settings');
const users = require('../lib/users');
const password = require('../lib/password');
const csrf = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const mail = require('../lib/mail');
const resets = require('../lib/resets');
const db = require('../db');

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

// ---- Recuperação de senha por e-mail (ativa quando o SMTP está configurado) ----

const mailOn = () => mail.isConfigured() && (!config.isProd || !!process.env.APP_URL);

router.get('/esqueci-senha', (req, res) => {
  res.render('esqueci', { title: 'Esqueci minha senha', mailOn: mailOn(), sent: false, error: null });
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('esqueci', { title: 'Esqueci minha senha', mailOn: mailOn(), sent: false, error: 'Muitas tentativas. Aguarde alguns minutos.' }),
});

router.post('/esqueci-senha', forgotLimiter, csrf.verify, async (req, res) => {
  if (!mailOn()) return res.redirect('/esqueci-senha');
  const email = String(req.body.email || '').trim();
  const user = email ? users.getAuthRecordByEmail(email) : null;
  if (user && user.is_active) {
    try {
      const token = resets.create(user.id);
      // APP_URL evita links montados a partir do cabeçalho Host da requisição
      const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const link = `${base}/redefinir-senha?token=${token}`;
      await mail.send({
        to: user.email,
        subject: 'Estúdio PADAP — criar nova senha',
        text: `Olá, ${user.name || ''}!\n\nRecebemos um pedido para criar uma nova senha no Estúdio PADAP.\nUse o link abaixo (válido por ${resets.TTL_MIN} minutos):\n\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.`,
        html: `<p>Olá, ${(user.name || '').replace(/</g, '&lt;')}!</p><p>Recebemos um pedido para criar uma nova senha no <b>Estúdio PADAP</b>.</p><p><a href="${link}" style="background:#14A321;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Criar nova senha</a></p><p style="color:#5A6E76">O link vale por ${resets.TTL_MIN} minutos. Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>`,
      });
    } catch (err) {
      console.error('[senha] falha ao enviar e-mail de redefinição:', err.message);
    }
  }
  // mesma resposta exista ou não o e-mail (não revela quem tem conta)
  return res.render('esqueci', { title: 'Esqueci minha senha', mailOn: true, sent: true, error: null });
});

function renderReset(res, token, error, status = 200) {
  res.status(status).render('redefinir', { title: 'Criar nova senha', token, error, minLength: config.minPasswordLength });
}

router.get('/redefinir-senha', (req, res) => {
  const token = String(req.query.token || '');
  if (!resets.check(token)) {
    return res.status(400).render('error', { title: 'Link inválido ou expirado', message: 'Peça um novo link em "Esqueci minha senha".' });
  }
  return renderReset(res, token, null);
});

router.post('/redefinir-senha', forgotLimiter, csrf.verify, async (req, res, next) => {
  const token = String(req.body.token || '');
  const rec = resets.check(token);
  if (!rec) return res.status(400).render('error', { title: 'Link inválido ou expirado', message: 'Peça um novo link em "Esqueci minha senha".' });
  const pass = String(req.body.next || '');
  if (pass.length < config.minPasswordLength) return renderReset(res, token, `A senha precisa ter ao menos ${config.minPasswordLength} caracteres.`, 400);
  if (pass !== String(req.body.confirm || '')) return renderReset(res, token, 'A confirmação não confere com a nova senha.', 400);
  try {
    users.setPassword(rec.user_id, await password.hash(pass), false);
    resets.consume(rec.id);
    // derruba sessões abertas dessa pessoa (quem estava logado em outro lugar sai)
    db.prepare("DELETE FROM sessions WHERE sess LIKE ?").run(`%"userId":${rec.user_id},%`);
    db.prepare("DELETE FROM sessions WHERE sess LIKE ?").run(`%"userId":${rec.user_id}}%`);
    req.flash('success', 'Senha criada. Entre com a nova senha.');
    return res.redirect('/login');
  } catch (err) {
    return next(err);
  }
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
