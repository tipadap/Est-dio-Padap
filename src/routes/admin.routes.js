'use strict';

const express = require('express');
const users = require('../lib/users');
const assets = require('../lib/assets');
const settings = require('../lib/settings');
const password = require('../lib/password');
const csrf = require('../middleware/csrf');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Usuários --------------------------------------------------------------

router.get('/usuarios', (req, res) => {
  res.render('admin/usuarios', { title: 'Usuários', active: 'usuarios', list: users.list(), tempPassword: req.flash('temp')[0] || null });
});

function renderForm(res, { user = null, values, error = null, status = 200 }) {
  res.status(status).render('admin/usuario-form', { title: user ? 'Editar usuário' : 'Novo usuário', active: 'usuarios', user, values, error });
}

function readForm(req) {
  return {
    name: String(req.body.name || '').trim().slice(0, 120),
    email: String(req.body.email || '').trim().toLowerCase().slice(0, 160),
    isAdmin: req.body.is_admin === 'on',
  };
}

function validate(values, exceptId = 0) {
  if (!values.name) return 'Informe o nome.';
  if (!EMAIL.test(values.email)) return 'Informe um e-mail válido.';
  if (users.emailTaken(values.email, exceptId)) return 'Já existe um usuário com este e-mail.';
  return null;
}

router.get('/usuarios/novo', (req, res) => renderForm(res, { values: { name: '', email: '', isAdmin: false } }));

router.post('/usuarios/novo', csrf.verify, async (req, res, next) => {
  const values = readForm(req);
  const error = validate(values);
  if (error) return renderForm(res, { values, error, status: 400 });
  try {
    const temp = password.generateTempPassword();
    users.create({ ...values, passwordHash: await password.hash(temp), mustChange: true });
    req.flash('success', `Usuário ${values.email} criado.`);
    req.flash('temp', `${values.email}|${temp}`);
    return res.redirect('/admin/usuarios');
  } catch (err) {
    return next(err);
  }
});

function loadTarget(req, res) {
  const user = users.getById(Number(req.params.id));
  if (!user) {
    req.flash('error', 'Usuário não encontrado.');
    res.redirect('/admin/usuarios');
    return null;
  }
  return user;
}

router.get('/usuarios/:id', (req, res) => {
  const user = loadTarget(req, res);
  if (!user) return undefined;
  return renderForm(res, { user, values: { name: user.name, email: user.email, isAdmin: !!user.is_admin } });
});

router.post('/usuarios/:id', csrf.verify, (req, res) => {
  const user = loadTarget(req, res);
  if (!user) return undefined;
  const values = readForm(req);
  const error =
    validate(values, user.id) ||
    (user.id === req.user.id && !values.isAdmin ? 'Você não pode remover seu próprio acesso de administrador.' : null);
  if (error) return renderForm(res, { user, values, error, status: 400 });
  users.update(user.id, values);
  req.flash('success', 'Usuário atualizado.');
  return res.redirect('/admin/usuarios');
});

router.post('/usuarios/:id/ativo', csrf.verify, (req, res) => {
  const user = loadTarget(req, res);
  if (!user) return undefined;
  const activate = !user.is_active;
  if (!activate && user.id === req.user.id) {
    req.flash('error', 'Você não pode inativar a si mesmo.');
  } else if (!activate && user.is_admin && users.countActiveAdmins() <= 1) {
    req.flash('error', 'Precisa existir ao menos um administrador ativo.');
  } else {
    users.setActive(user.id, activate);
    req.flash('success', activate ? 'Usuário reativado.' : 'Usuário inativado.');
  }
  return res.redirect('/admin/usuarios');
});

router.post('/usuarios/:id/senha', csrf.verify, async (req, res, next) => {
  const user = loadTarget(req, res);
  if (!user) return undefined;
  try {
    const temp = password.generateTempPassword();
    users.setPassword(user.id, await password.hash(temp), true);
    req.flash('success', `Senha de ${user.email} redefinida.`);
    req.flash('temp', `${user.email}|${temp}`);
    return res.redirect('/admin/usuarios');
  } catch (err) {
    return next(err);
  }
});

// ---- Imagens (Banco, Portfólio e imagens do sistema) -----------------------

router.get('/imagens', (req, res) => {
  res.render('admin/imagens', {
    title: 'Imagens',
    active: 'imagens',
    boot: {
      banco: assets.list('banco'),
      portfolio: assets.list('portfolio'),
      settings: settings.all(),
      templateIds: settings.TEMPLATE_IDS,
    },
  });
});

module.exports = router;
