'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = tmp;

const request = require('supertest');
const app = require('../src/server');
const users = require('../src/lib/users');
const password = require('../src/lib/password');
const { cleanPresentation } = require('../src/lib/sanitize');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const slideData = (html = 'Olá') => ({
  version: 1,
  theme: 'branco',
  slides: [
    {
      id: 's1',
      bg: '#FFFFFF',
      elements: [{ id: 'e1', type: 'text', x: 10, y: 10, w: 500, h: 100, html, style: { fontSize: 40 } }],
    },
  ],
});

async function login(email, pass) {
  const agent = request.agent(app);
  const page = await agent.get('/login');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const res = await agent.post('/login').type('form').send({ _csrf: csrf, email, password: pass });
  assert.strictEqual(res.status, 302, 'login deve redirecionar');
  const home = await agent.get('/').redirects(2);
  const token = home.text.match(/name="csrf-token" content="([^"]+)"/)[1];
  return { agent, token };
}

let admin;
let ana;
let bia;

before(async () => {
  users.create({ email: 'admin@t.com', name: 'Admin', passwordHash: await password.hash('senha-admin'), isAdmin: true, mustChange: false });
  users.create({ email: 'ana@t.com', name: 'Ana', passwordHash: await password.hash('senha-ana1'), mustChange: false });
  users.create({ email: 'bia@t.com', name: 'Bia', passwordHash: await password.hash('senha-bia1'), mustChange: false });
  admin = await login('admin@t.com', 'senha-admin');
  ana = await login('ana@t.com', 'senha-ana1');
  bia = await login('bia@t.com', 'senha-bia1');
});

test('páginas exigem login', async () => {
  const res = await request(app).get('/biblioteca');
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /\/login/);
  const api = await request(app).get('/api/assets');
  assert.strictEqual(api.status, 401);
});

test('senha errada não entra', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/login');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const res = await agent.post('/login').type('form').send({ _csrf: csrf, email: 'ana@t.com', password: 'errada' });
  assert.strictEqual(res.status, 401);
  assert.match(res.text, /E-mail ou senha inválidos/);
});

test('API rejeita escrita sem token CSRF', async () => {
  const res = await ana.agent.post('/api/presentations').send({ title: 'X', data: slideData() });
  assert.strictEqual(res.status, 403);
});

test('criar, salvar e reabrir apresentação', async () => {
  const c = await ana.agent.post('/api/presentations').set('x-csrf-token', ana.token).send({ title: 'Minha', data: slideData() });
  assert.strictEqual(c.status, 201);
  const id = c.body.id;
  const s = await ana.agent.put(`/api/presentations/${id}`).set('x-csrf-token', ana.token).send({ title: 'Renomeada', data: slideData('Novo <b>texto</b>') });
  assert.strictEqual(s.status, 200);
  const g = await ana.agent.get(`/api/presentations/${id}`);
  assert.strictEqual(g.body.title, 'Renomeada');
  assert.strictEqual(g.body.data.slides[0].elements[0].html, 'Novo <b>texto</b>');
  const ed = await ana.agent.get(`/editor/${id}`);
  assert.strictEqual(ed.status, 200);
});

test('HTML perigoso é removido ao salvar (XSS)', async () => {
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script><span style="color:#ff0000;position:fixed">ok</span><a href="javascript:x">l</a>';
  const c = await ana.agent.post('/api/presentations').set('x-csrf-token', ana.token).send({ title: '<b>t</b>', data: slideData(evil) });
  const g = await ana.agent.get(`/api/presentations/${c.body.id}`);
  const html = g.body.data.slides[0].elements[0].html;
  assert.doesNotMatch(html, /onerror|<script|<img|javascript:|position/i);
  assert.match(html, /color:#ff0000/);
  // O título com "</script>" não pode quebrar o JSON embutido na página.
  await ana.agent.put(`/api/presentations/${c.body.id}`).set('x-csrf-token', ana.token).send({ title: '</script><script>alert(1)</script>' });
  const page = await ana.agent.get(`/editor/${c.body.id}`);
  assert.doesNotMatch(page.text, /<\/script><script>alert/);
});

test('sanitização descarta campos e imagens externas', () => {
  const d = cleanPresentation({
    slides: [
      {
        bg: 'url(x)',
        elements: [
          { type: 'image', src: 'https://evil.example/x.png', x: 'a', y: 1e9, w: 10, h: 10, foo: 1 },
          { type: 'image', src: '/uploads/../../etc/passwd.png', x: 0, y: 0, w: 10, h: 10 },
          { type: 'image', src: '/uploads/abc123.jpg', x: 0, y: 0, w: 10, h: 10, mask: 'leaf' },
          { type: 'script', x: 0 },
        ],
      },
    ],
  });
  const els = d.slides[0].elements;
  assert.strictEqual(d.slides[0].bg, '#FFFFFF');
  assert.strictEqual(els.length, 3);
  assert.strictEqual(els[0].src, '');
  assert.strictEqual(els[0].x, 0);
  assert.strictEqual(els[0].y, 6000);
  assert.strictEqual(els[0].foo, undefined);
  assert.strictEqual(els[1].src, '');
  assert.strictEqual(els[2].src, '/uploads/abc123.jpg');
  assert.throws(() => cleanPresentation({ slides: [] }));
});

test('outra pessoa não vê nem edita; equipe vê; link público funciona', async () => {
  const c = await ana.agent.post('/api/presentations').set('x-csrf-token', ana.token).send({ title: 'Privada', data: slideData() });
  const id = c.body.id;
  assert.strictEqual((await bia.agent.get(`/api/presentations/${id}`)).status, 404);
  assert.strictEqual((await bia.agent.put(`/api/presentations/${id}`).set('x-csrf-token', bia.token).send({ title: 'hack' })).status, 404);
  assert.strictEqual((await bia.agent.delete(`/api/presentations/${id}`).set('x-csrf-token', bia.token)).status, 404);
  assert.strictEqual((await bia.agent.post(`/api/presentations/${id}/share`).set('x-csrf-token', bia.token).send({ public: true })).status, 404);

  const sh = await ana.agent.post(`/api/presentations/${id}/share`).set('x-csrf-token', ana.token).send({ team: true, public: true });
  assert.strictEqual(sh.body.team, true);
  assert.ok(sh.body.shareToken);

  // Equipe: vê, apresenta e copia, mas não edita.
  assert.strictEqual((await bia.agent.get(`/api/presentations/${id}`)).status, 200);
  assert.strictEqual((await bia.agent.get(`/editor/${id}`)).status, 302);
  assert.strictEqual((await bia.agent.put(`/api/presentations/${id}`).set('x-csrf-token', bia.token).send({ title: 'hack' })).status, 404);
  const copy = await bia.agent.post(`/api/presentations/${id}/copy`).set('x-csrf-token', bia.token).send({});
  assert.strictEqual(copy.status, 201);
  assert.strictEqual((await bia.agent.get(`/editor/${copy.body.id}`)).status, 200);

  // Link público sem login.
  const pub = await request(app).get(`/v/${sh.body.shareToken}`);
  assert.strictEqual(pub.status, 200);
  assert.match(pub.text, /Privada/);
  assert.strictEqual((await request(app).get('/v/token-invalido')).status, 404);

  // Desligar o link invalida o token antigo.
  await ana.agent.post(`/api/presentations/${id}/share`).set('x-csrf-token', ana.token).send({ public: false });
  assert.strictEqual((await request(app).get(`/v/${sh.body.shareToken}`)).status, 404);

  // Admin pode editar qualquer uma.
  assert.strictEqual((await admin.agent.put(`/api/presentations/${id}`).set('x-csrf-token', admin.token).send({ title: 'Admin editou' })).status, 200);
});

test('imagens: só admin envia ao Banco; usuário envia às próprias', async () => {
  const no = await ana.agent.post('/api/assets').set('x-csrf-token', ana.token).field('category', 'banco').attach('image', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  assert.strictEqual(no.status, 403);
  const files = fs.readdirSync(path.join(tmp, 'uploads'));
  assert.strictEqual(files.length, 0, 'arquivo rejeitado deve ser apagado');

  const mine = await ana.agent.post('/api/assets').set('x-csrf-token', ana.token).field('category', 'user').attach('image', PNG_1PX, { filename: 'minha.png', contentType: 'image/png' });
  assert.strictEqual(mine.status, 201);
  assert.match(mine.body.asset.url, /^\/uploads\/[a-f0-9]+\.png$/);
  // Bia não vê nem apaga a imagem da Ana.
  const biaList = await bia.agent.get('/api/assets?category=user');
  assert.strictEqual(biaList.body.assets.length, 0);
  assert.strictEqual((await bia.agent.delete(`/api/assets/${mine.body.asset.id}`).set('x-csrf-token', bia.token)).status, 404);

  const banco = await admin.agent.post('/api/assets').set('x-csrf-token', admin.token).field('category', 'banco').attach('image', PNG_1PX, { filename: 'lavoura.png', contentType: 'image/png' });
  assert.strictEqual(banco.status, 201);
  assert.strictEqual((await ana.agent.get('/api/assets?category=banco')).body.assets.length, 1);

  const bad = await admin.agent.post('/api/assets').set('x-csrf-token', admin.token).field('category', 'banco').attach('image', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
  assert.strictEqual(bad.status, 400);

  // Configurações: só admin, e só com imagem do banco/portfólio.
  assert.strictEqual((await ana.agent.post('/api/settings').set('x-csrf-token', ana.token).send({ key: 'login_bg', value: banco.body.asset.url })).status, 403);
  assert.strictEqual((await admin.agent.post('/api/settings').set('x-csrf-token', admin.token).send({ key: 'login_bg', value: '/uploads/nao-existe.png' })).status, 400);
  assert.strictEqual((await admin.agent.post('/api/settings').set('x-csrf-token', admin.token).send({ key: 'login_bg', value: banco.body.asset.url })).status, 200);
  const loginPage = await request(app).get('/login');
  assert.ok(loginPage.text.includes(banco.body.asset.url));
  // Apagar a imagem limpa a configuração.
  await admin.agent.delete(`/api/assets/${banco.body.asset.id}`).set('x-csrf-token', admin.token);
  assert.ok(!(await request(app).get('/login')).text.includes(banco.body.asset.url));
});

test('Portfólio 2026 embutido aparece no Portfólio e os arquivos existem', async () => {
  const res = await ana.agent.get('/api/assets?category=portfolio');
  const builtin = res.body.assets.filter((a) => a.builtin);
  assert.ok(builtin.filter((a) => a.kind === 'produto').length >= 40, 'produtos do portfólio');
  const yara = builtin.find((a) => a.name === 'YaraBasa');
  assert.strictEqual(yara.brand, 'Yara');
  assert.match(yara.description, /7 nutrientes/);
  for (const a of builtin) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'public', a.url.replace('/static/', ''))), a.url);
  }
  // Imagem do portfólio pode ser usada num slide e como capa de modelo.
  const d = cleanPresentation({ slides: [{ elements: [{ type: 'image', src: yara.url, x: 0, y: 0, w: 10, h: 10 }] }] });
  assert.strictEqual(d.slides[0].elements[0].src, yara.url);
  const s = await admin.agent.post('/api/settings').set('x-csrf-token', admin.token).send({ key: 'tpl:mercado', value: yara.url });
  assert.strictEqual(s.status, 200);
  // Não aparece no Banco de imagens nem pode ser apagado como upload.
  assert.ok(!(await ana.agent.get('/api/assets?category=banco')).body.assets.some((a) => a.builtin));
});

test('admin cria usuário com senha temporária e troca obrigatória', async () => {
  const page = await admin.agent.get('/admin/usuarios/novo');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const res = await admin.agent.post('/admin/usuarios/novo').type('form').send({ _csrf: csrf, name: 'Caio', email: 'caio@t.com' });
  assert.strictEqual(res.status, 302);
  const list = await admin.agent.get('/admin/usuarios');
  const temp = list.text.match(/class="temp-pass">([^<]+)</)[1];
  const caio = await login('caio@t.com', temp).catch(() => null);
  // O login redireciona para a troca de senha; páginas e API ficam bloqueadas até trocar.
  assert.ok(caio);
  const api = await caio.agent.get('/api/assets');
  assert.strictEqual(api.status, 403);
  assert.strictEqual((await ana.agent.get('/admin/usuarios')).status, 302);
});
