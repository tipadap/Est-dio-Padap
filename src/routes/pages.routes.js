'use strict';

const express = require('express');
const presentations = require('../lib/presentations');
const settings = require('../lib/settings');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function notFound(res) {
  return res.status(404).render('error', {
    title: 'Apresentação não encontrada',
    message: 'Ela pode ter sido excluída, ou você não tem acesso a ela.',
  });
}

function loadPres(req, res, mode) {
  const pres = presentations.get(Number(req.params.id));
  const allowed = mode === 'edit' ? presentations.canEdit(req.user, pres) : presentations.canView(req.user, pres);
  if (!allowed) {
    notFound(res);
    return null;
  }
  return pres;
}

const viewData = (pres) => ({ id: pres.id, title: pres.title, data: JSON.parse(pres.data) });

router.get('/', requireAuth, (req, res) => {
  const s = settings.all();
  const templatePhotos = {};
  for (const id of settings.TEMPLATE_IDS) if (s[`tpl:${id}`]) templatePhotos[id] = s[`tpl:${id}`];
  res.render('home', {
    title: 'Página Inicial',
    active: 'home',
    homeBanner: s.home_banner || null,
    boot: { templatePhotos, recent: presentations.listMine(req.user.id).slice(0, 4) },
  });
});

router.get('/biblioteca', requireAuth, (req, res) => {
  res.render('biblioteca', {
    title: 'Biblioteca',
    active: 'biblioteca',
    boot: { mine: presentations.listMine(req.user.id), team: presentations.listTeam(req.user.id) },
  });
});

router.get('/editor/:id', requireAuth, (req, res) => {
  const pres = presentations.get(Number(req.params.id));
  if (!presentations.canView(req.user, pres)) return notFound(res);
  // Quem só pode ver (apresentação da equipe) vai para o modo de apresentação.
  if (!presentations.canEdit(req.user, pres)) return res.redirect(`/apresentar/${pres.id}`);
  return res.render('editor', {
    title: pres.title,
    boot: {
      ...viewData(pres),
      teamVisible: !!pres.team_visible,
      shareToken: pres.share_token,
      isAdmin: !!req.user.is_admin,
    },
  });
});

router.get('/apresentar/:id', requireAuth, (req, res) => {
  const pres = loadPres(req, res, 'view');
  if (!pres) return undefined;
  return res.render('apresentar', {
    title: pres.title,
    boot: { ...viewData(pres), canCopy: true, canEdit: presentations.canEdit(req.user, pres) },
  });
});

router.get('/imprimir/:id', requireAuth, (req, res) => {
  const pres = loadPres(req, res, 'view');
  if (!pres) return undefined;
  return res.render('imprimir', { title: pres.title, boot: viewData(pres) });
});

// Link público de visualização (Compartilhar > link). Não exige login.
router.get('/v/:token', (req, res) => {
  const pres = presentations.getByToken(req.params.token);
  if (!pres) return notFound(res);
  return res.render('apresentar', { title: pres.title, boot: { ...viewData(pres), canCopy: false, canEdit: false } });
});

module.exports = router;
