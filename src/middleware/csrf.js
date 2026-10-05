'use strict';

const crypto = require('crypto');

/**
 * CSRF via token de sincronização por sessão.
 * provideToken — garante o token na sessão e o expõe em res.locals.csrfToken.
 * verify       — exige _csrf (corpo) ou header x-csrf-token. Rodar DEPOIS do parser/multer.
 */
function provideToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verify(req, res, next) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (sent && sent === req.session.csrfToken) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: 'Sessão expirada. Recarregue a página.' });
  }
  return res.status(403).render('error', {
    title: 'Sessão expirada',
    message: 'Formulário inválido ou sessão expirada. Recarregue a página e tente novamente.',
  });
}

module.exports = { provideToken, verify };
