'use strict';

const express = require('express');
const config = require('../config');
const presentations = require('../lib/presentations');
const assets = require('../lib/assets');
const portfolio = require('../lib/portfolio');
const settings = require('../lib/settings');
const { cleanPresentation, cleanTitle } = require('../lib/sanitize');
const { handleImage, discardUpload } = require('../lib/upload');
const csrf = require('../middleware/csrf');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(express.json({ limit: config.maxPresentationBytes }));

const bad = (res, msg, status = 400) => res.status(status).json({ error: msg });

function editable(req, res) {
  const pres = presentations.get(Number(req.params.id));
  if (!presentations.canEdit(req.user, pres)) {
    bad(res, 'Apresentação não encontrada.', 404);
    return null;
  }
  return pres;
}

// ---- Apresentações ---------------------------------------------------------

router.post('/presentations', csrf.verify, (req, res) => {
  try {
    const data = cleanPresentation(req.body.data);
    const id = presentations.create(req.user.id, cleanTitle(req.body.title), data);
    return res.status(201).json({ id });
  } catch (err) {
    return bad(res, err.message);
  }
});

router.get('/presentations/:id', (req, res) => {
  const pres = presentations.get(Number(req.params.id));
  if (!presentations.canView(req.user, pres)) return bad(res, 'Apresentação não encontrada.', 404);
  return res.json({ id: pres.id, title: pres.title, data: JSON.parse(pres.data), updatedAt: pres.updated_at });
});

// Salvar (autosave do editor): título e/ou slides.
router.put('/presentations/:id', csrf.verify, (req, res) => {
  const pres = editable(req, res);
  if (!pres) return undefined;
  try {
    const patch = {};
    if (req.body.title !== undefined) patch.title = cleanTitle(req.body.title);
    if (req.body.data !== undefined) patch.data = cleanPresentation(req.body.data);
    presentations.save(pres.id, patch);
    return res.json({ ok: true, updatedAt: presentations.get(pres.id).updated_at });
  } catch (err) {
    return bad(res, err.message);
  }
});

// Salvar como / duplicar. Qualquer um que possa VER pode fazer uma cópia própria.
router.post('/presentations/:id/copy', csrf.verify, (req, res) => {
  const pres = presentations.get(Number(req.params.id));
  if (!presentations.canView(req.user, pres)) return bad(res, 'Apresentação não encontrada.', 404);
  try {
    const data = req.body.data !== undefined ? cleanPresentation(req.body.data) : JSON.parse(pres.data);
    const title = cleanTitle(req.body.title || `${pres.title} (cópia)`);
    return res.status(201).json({ id: presentations.create(req.user.id, title, data) });
  } catch (err) {
    return bad(res, err.message);
  }
});

// Compartilhar: visível para a equipe e/ou link público.
router.post('/presentations/:id/share', csrf.verify, (req, res) => {
  const pres = editable(req, res);
  if (!pres) return undefined;
  if (req.body.team !== undefined) presentations.setTeamVisible(pres.id, !!req.body.team);
  let token = pres.share_token;
  if (req.body.public !== undefined) {
    const want = !!req.body.public;
    if (want && !token) token = presentations.setPublic(pres.id, true);
    if (!want && token) token = presentations.setPublic(pres.id, false);
  }
  const fresh = presentations.get(pres.id);
  return res.json({ team: !!fresh.team_visible, shareToken: token || null });
});

router.delete('/presentations/:id', csrf.verify, (req, res) => {
  const pres = editable(req, res);
  if (!pres) return undefined;
  presentations.remove(pres.id);
  return res.json({ ok: true });
});

// ---- Imagens ---------------------------------------------------------------

const CATEGORIES = ['banco', 'portfolio', 'user'];

router.get('/assets', (req, res) => {
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : 'banco';
  const list = assets.list(category, req.user.id);
  // Portfólio: imagens enviadas pelo admin + o Portfólio 2026 embutido no sistema.
  res.json({ assets: category === 'portfolio' ? list.concat(portfolio.list()) : list });
});

// Banco e Portfólio: só admin. "user": qualquer usuário (imagens próprias).
// O multer grava o arquivo antes da checagem de CSRF: se ela falhar, apaga o arquivo.
function verifyUpload(req, res, next) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (sent && sent === req.session.csrfToken) return next();
  discardUpload(req.file);
  return bad(res, 'Sessão expirada. Recarregue a página.', 403);
}

router.post('/assets', handleImage, verifyUpload, (req, res) => {
  if (!req.file) return bad(res, 'Selecione uma imagem.');
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'user';
  if (category !== 'user' && !req.user.is_admin) {
    discardUpload(req.file);
    return bad(res, 'Somente administradores enviam imagens ao Banco e ao Portfólio.', 403);
  }
  const title = String(req.body.title || req.file.originalname || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .slice(0, 120);
  const asset = assets.create({ category, ownerId: req.user.id, filename: req.file.filename, title });
  return res.status(201).json({ asset });
});

function ownAsset(req, res) {
  const asset = assets.get(Number(req.params.id));
  const mine = asset && asset.category === 'user' && asset.owner_id === req.user.id;
  if (!asset || !(mine || req.user.is_admin)) {
    bad(res, 'Imagem não encontrada.', 404);
    return null;
  }
  return asset;
}

router.patch('/assets/:id', csrf.verify, (req, res) => {
  const asset = ownAsset(req, res);
  if (!asset) return undefined;
  assets.rename(asset.id, String(req.body.title || '').slice(0, 120));
  return res.json({ ok: true });
});

router.delete('/assets/:id', csrf.verify, (req, res) => {
  const asset = ownAsset(req, res);
  if (!asset) return undefined;
  settings.clearValue(asset.url);
  assets.remove(asset);
  return res.json({ ok: true });
});

// Preferências (admin): imagem do login, banner da página inicial, foto de cada modelo.
router.post('/settings', requireAdmin, csrf.verify, (req, res) => {
  const { key, value } = req.body || {};
  if (!settings.KEYS.includes(key)) return bad(res, 'Configuração desconhecida.');
  if (value) {
    const ok =
      typeof value === 'string' &&
      (portfolio.hasUrl(value) ||
        (value.startsWith('/uploads/') && assets.list('banco').concat(assets.list('portfolio')).some((a) => a.url === value)));
    if (!ok) return bad(res, 'Escolha uma imagem do Banco de imagens ou do Portfólio.');
  }
  settings.set(key, value || null);
  return res.json({ ok: true, settings: settings.all() });
});

module.exports = router;
