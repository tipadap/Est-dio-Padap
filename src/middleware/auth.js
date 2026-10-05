'use strict';

const users = require('../lib/users');

const wantsJson = (req) => req.originalUrl.startsWith('/api/');

/** Carrega o usuário da sessão em req.user / res.locals.currentUser. */
function loadUser(req, res, next) {
  res.locals.currentUser = null;
  const id = req.session && req.session.userId;
  if (id) {
    const user = users.getById(id);
    if (user && user.is_active) {
      req.user = user;
      res.locals.currentUser = user;
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (req.user.must_change_password && req.path !== '/conta/senha' && req.path !== '/logout') {
    if (wantsJson(req)) return res.status(403).json({ error: 'Troque sua senha antes de continuar.' });
    return res.redirect('/conta/senha');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    if (wantsJson(req)) return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    req.flash('error', 'Acesso restrito a administradores.');
    return res.redirect('/');
  }
  return next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
