'use strict';

const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');

// Em PaaS (Railway) o sistema de arquivos é efêmero: aponte DATA_DIR para um
// volume persistente (ex.: /data) para o banco SQLite e as imagens sobreviverem
// a cada deploy. Sem DATA_DIR, usa-se ./data e ./uploads.
// ATENÇÃO no dev local: o projeto está no OneDrive — defina DATA_DIR fora dele
// (veja .env.example), senão a sincronização pode corromper o banco.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;
const dbDir = DATA_DIR || path.join(ROOT, 'data');
const uploadsDir = DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(ROOT, 'uploads');

const IS_PROD = (process.env.NODE_ENV || 'development') === 'production';

// Confiar no proxy reverso (HTTPS/cookie "secure"/IP real). Ligado por padrão em produção.
const OFF = ['0', 'false', 'no'];
const ON = ['1', 'true', 'yes'];
const trustProxy = OFF.includes(process.env.TRUST_PROXY)
  ? false
  : ON.includes(process.env.TRUST_PROXY)
  ? true
  : IS_PROD;

const config = {
  root: ROOT,
  version: require('../package.json').version,
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  isProd: IS_PROD,
  trustProxy,
  sessionSecret:
    process.env.SESSION_SECRET ||
    (IS_PROD
      ? (() => {
          throw new Error('SESSION_SECRET é obrigatório em produção.');
        })()
      : 'dev-secret-inseguro-somente-local'),
  dataDir: DATA_DIR,
  supportUrl: process.env.SUPPORT_URL || 'mailto:tipadapsg@gmail.com',
  paths: {
    data: dbDir,
    db: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dbDir, 'estudio.db'),
    uploads: uploadsDir,
    views: path.join(__dirname, 'views'),
    public: path.join(__dirname, 'public'),
    vendor: path.join(ROOT, 'node_modules', 'pptxgenjs', 'dist'),
  },
  bcryptRounds: 12,
  minPasswordLength: 8,
  rememberMeDays: 30,
  upload: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  maxPresentationBytes: 4 * 1024 * 1024,
};

module.exports = config;
