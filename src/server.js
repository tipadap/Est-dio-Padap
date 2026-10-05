'use strict';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const flash = require('connect-flash');
const SqliteStore = require('better-sqlite3-session-store')(session);

const config = require('./config');
const db = require('./db');
const bootstrapAdmin = require('./lib/bootstrap');
const csrf = require('./middleware/csrf');
const { loadUser } = require('./middleware/auth');
const { ICONS, icon } = require('./lib/icons');

if (config.env !== 'test') bootstrapAdmin();

const app = express();

app.set('view engine', 'ejs');
app.set('views', config.paths.views);
app.set('trust proxy', config.trustProxy ? 1 : false);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Estilos inline são necessários: cada elemento do slide é posicionado via style.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
  })
);

app.use(express.urlencoded({ extended: true }));
const cache = { maxAge: config.isProd ? '7d' : 0 };
app.use('/static', express.static(config.paths.public, cache));
app.use('/vendor', express.static(config.paths.vendor, cache));
app.use('/uploads', express.static(config.paths.uploads, cache));

// Mesmo conjunto de ícones das views, como módulo ES para o navegador.
const iconsModule = `export const ICONS = ${JSON.stringify(ICONS)};\n`;
app.get('/js/icons.js', (req, res) => res.type('application/javascript').send(iconsModule));

app.use(
  session({
    name: 'estudio.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 12 * 60 * 60 * 1000 },
  })
);

app.use(flash());
app.use(csrf.provideToken);
app.use(loadUser);

app.use((req, res, next) => {
  res.locals.title = 'Estúdio PADAP';
  res.locals.active = '';
  res.locals.version = config.version;
  res.locals.icon = icon;
  res.locals.supportUrl = config.supportUrl;
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  // JSON embutido na página (<script type="application/json">), seguro contra "</script>".
  res.locals.json = (v) => JSON.stringify(v).replace(/</g, String.fromCharCode(92) + 'u003c');
  next();
});

app.use('/', require('./routes/auth.routes'));
app.use('/', require('./routes/pages.routes'));
app.use('/api', require('./routes/api.routes'));
app.use('/admin', require('./routes/admin.routes'));

app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: 'Não encontrado.' });
  return res.status(404).render('error', { title: 'Página não encontrada', message: 'A página que você procura não existe.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'A apresentação ficou grande demais para salvar.' });
  console.error(err);
  if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: 'Erro inesperado no servidor.' });
  return res.status(500).render('error', {
    title: 'Erro',
    message: config.isProd ? 'Ocorreu um erro inesperado. Tente novamente.' : String(err && err.stack ? err.stack : err),
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Estúdio PADAP rodando na porta ${config.port} (${config.env})`);
    console.log(`  trustProxy=${config.trustProxy}  cookieSecure=${config.isProd}  dataDir=${config.dataDir || '(local ./data)'}`);
  });
}

module.exports = app;
