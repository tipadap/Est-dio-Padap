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

test('JS/CSS sempre conferidos com o servidor (atualizações aparecem na hora)', async () => {
  for (const f of ['/static/js/editor.js', '/static/js/templates.js', '/static/css/app.css']) {
    const r = await request(app).get(f);
    assert.strictEqual(r.status, 200, f);
    assert.strictEqual(r.headers['cache-control'], 'no-cache', f);
  }
  const page = await request(app).get('/login');
  assert.ok(page.text.includes('app.css?v='), 'CSS com ?v= do deploy');
  // bibliotecas de exportação disponíveis (PowerPoint e PDF)
  assert.strictEqual((await request(app).get('/vendor/pptxgen.bundle.js')).status, 200);
  assert.strictEqual((await request(app).get('/vendor-pdf/jspdf.umd.min.js')).status, 200);
  // scripts com a versão no caminho; imports relativos herdam a versão
  const m = page.text.match(/src="(\/app\/[^"]+\/)shell\.js"/);
  assert.ok(m, 'script com versão no caminho');
  for (const f of ['shell.js', 'render.js', 'templates.js', 'modelos-padap.js']) assert.strictEqual((await request(app).get(m[1] + f)).status, 200, f);
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

test('rascunho: /editor/novo não grava nada até a primeira edição', async () => {
  const antes = (await ana.agent.get('/api/assets')).status;
  assert.strictEqual(antes, 200);
  const count = () => require('../src/db').prepare('SELECT COUNT(*) AS n FROM presentations').get().n;
  const n = count();
  const page = await ana.agent.get('/editor/novo?modelo=resultados');
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /"id":null/);
  assert.match(page.text, /"template":"resultados"/);
  // modelo inválido vira branco; nada é gravado
  const bad = await ana.agent.get('/editor/novo?modelo=%3Cscript%3E');
  assert.match(bad.text, /"template":"branco"/);
  assert.strictEqual(count(), n);
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

test('histórico de versões: cópia a cada 10 min, restaurar e permissão', async () => {
  const h = { 'x-csrf-token': ana.token };
  const { body: c } = await ana.agent.post('/api/presentations').set(h).send({ title: 'Versões', data: slideData('v1') });
  const put = (html) => ana.agent.put(`/api/presentations/${c.id}`).set(h).send({ data: slideData(html) });
  await put('v2'); // guarda v1
  await put('v3'); // menos de 10 min: não guarda de novo
  let list = (await ana.agent.get(`/api/presentations/${c.id}/versions`)).body.versions;
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].slide_count, 1);
  const v = (await ana.agent.get(`/api/presentations/${c.id}/versions/${list[0].id}`)).body;
  assert.strictEqual(v.data.slides[0].elements[0].html, 'v1');
  // outra pessoa não vê nem restaura
  assert.strictEqual((await bia.agent.get(`/api/presentations/${c.id}/versions`)).status, 404);
  assert.strictEqual((await bia.agent.post(`/api/presentations/${c.id}/versions/${list[0].id}/restore`).set('x-csrf-token', bia.token)).status, 404);
  // restaurar volta para v1 e guarda a v3 como "antes de restaurar"
  assert.strictEqual((await ana.agent.post(`/api/presentations/${c.id}/versions/${list[0].id}/restore`).set(h)).status, 200);
  const now = (await ana.agent.get(`/api/presentations/${c.id}`)).body;
  assert.strictEqual(now.data.slides[0].elements[0].html, 'v1');
  list = (await ana.agent.get(`/api/presentations/${c.id}/versions`)).body.versions;
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].reason, 'restore');
  const saved = (await ana.agent.get(`/api/presentations/${c.id}/versions/${list[0].id}`)).body;
  assert.strictEqual(saved.data.slides[0].elements[0].html, 'v3');
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
          { type: 'image', src: '/static/img/modelos-padap/s1-1-foto.webp', maskSrc: '/static/img/modelos-padap/s1-1-recorte.png', x: 0, y: 0, w: 10, h: 10 },
          { type: 'image', src: '/uploads/a.jpg', maskSrc: 'https://evil.example/m.png', x: 0, y: 0, w: 10, h: 10 },
          { type: 'script', x: 0 },
        ],
      },
    ],
  });
  const els = d.slides[0].elements;
  assert.strictEqual(d.slides[0].bg, '#FFFFFF');
  assert.strictEqual(els.length, 5);
  assert.strictEqual(els[3].maskSrc, '/static/img/modelos-padap/s1-1-recorte.png');
  assert.strictEqual(els[4].maskSrc, undefined);
  assert.strictEqual(els[0].src, '');
  assert.strictEqual(els[0].x, 0);
  assert.strictEqual(els[0].y, 6000);
  assert.strictEqual(els[0].foo, undefined);
  assert.strictEqual(els[1].src, '');
  assert.strictEqual(els[2].src, '/uploads/abc123.jpg');
  assert.throws(() => cleanPresentation({ slides: [] }));
});

test('preços: só admin grava, todos leem, valores validados', async () => {
  const body = { rows: [{ produto: 'YaraMila Complex', marca: 'Yara', embalagem: 'Saco 50 kg', preco: '4.250,50', prazo: '30 dias' }, { produto: '', preco: '1' }], market: { ureia: '450', map: 'x', kcl: '332,5', data: '2026-11-10', fonte: '<b>Relatório</b>' } };
  assert.strictEqual((await ana.agent.put('/api/precos').set('x-csrf-token', ana.token).send(body)).status, 403);
  const r = await admin.agent.put('/api/precos').set('x-csrf-token', admin.token).send(body);
  assert.strictEqual(r.status, 200);
  const g = (await ana.agent.get('/api/precos')).body;
  assert.strictEqual(g.rows.length, 1);
  assert.strictEqual(g.rows[0].preco, 4250.5);
  assert.deepStrictEqual([g.market.ureia, g.market.map, g.market.kcl], [450, null, 332.5]);
  assert.strictEqual(g.market.data, '2026-11-10');
  assert.strictEqual(g.ptax, null);
  assert.strictEqual((await ana.agent.get('/admin/precos')).status, 302);
  assert.strictEqual((await admin.agent.get('/admin/precos')).status, 200);
});

test('integração com o Portal: avisa quando não configurada', async () => {
  const env = { ...process.env };
  try {
    delete process.env.PORTAL_URL;
    const r = await ana.agent.get('/api/portal/produtores?q=jo');
    assert.strictEqual(r.status, 503);
    assert.match(r.body.error, /não configurada/);
    assert.strictEqual((await request(app).get('/api/portal/produtores?q=jo')).status, 401);
  } finally {
    process.env = env;
  }
});

test('gráfico e tabela: dados validados', () => {
  const d = cleanPresentation({
    slides: [{
      elements: [
        { type: 'chart', chartType: 'pizza', x: 0, y: 0, w: 800, h: 400, categories: ['A', 'B', '<b>C</b>'],
          series: [{ name: 'S1', color: 'red', values: [1, '2', 'x'] }, { name: 'S2', color: '#123456', values: [5] }] },
        { type: 'table', x: 0, y: 0, w: 800, h: 300, rows: [['a', 'b', 'c'], ['1'], 'lixo'], align: ['right', 'meio'], fontSize: 999 },
      ],
    }],
  });
  const [c, tb] = d.slides[0].elements;
  assert.strictEqual(c.chartType, 'bar');
  assert.deepStrictEqual(c.categories, ['A', 'B', '<b>C</b>']);
  assert.deepStrictEqual(c.series[0].values, [1, 2, 0]);
  assert.strictEqual(c.series[0].color, '#1DBD2C');
  assert.deepStrictEqual(c.series[1].values, [5, 0, 0]);
  assert.deepStrictEqual(tb.rows, [['a', 'b', 'c'], ['1', '', ''], ['', '', '']]);
  assert.deepStrictEqual(tb.align, ['right', 'left', 'left']);
  assert.strictEqual(tb.fontSize, 120);
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

test('ADMIN_RESET recupera o acesso do administrador pelas variáveis de ambiente', async () => {
  const bootstrap = require('../src/lib/bootstrap');
  const env = { ...process.env };
  try {
    // Senha curta: não cria nem altera nada.
    Object.assign(process.env, { ADMIN_RESET: '1', ADMIN_EMAIL: 'Chefe@T.com', ADMIN_PASSWORD: 'curta' });
    bootstrap();
    assert.strictEqual(users.getAuthRecordByEmail('chefe@t.com'), undefined);
    // Cria o administrador que não existia.
    process.env.ADMIN_PASSWORD = 'senha-nova-1';
    bootstrap();
    const novo = users.getAuthRecordByEmail('chefe@t.com');
    assert.ok(novo && novo.is_admin && novo.is_active);
    await login('chefe@t.com', 'senha-nova-1');
    // Redefine a senha de quem já existe (e reativa).
    users.setActive(novo.id, false);
    process.env.ADMIN_PASSWORD = 'senha-nova-2';
    bootstrap();
    await login('chefe@t.com', 'senha-nova-2');
    // Sem ADMIN_RESET e com usuários no banco: não mexe em nada.
    delete process.env.ADMIN_RESET;
    process.env.ADMIN_PASSWORD = 'senha-nova-3';
    bootstrap();
    await login('chefe@t.com', 'senha-nova-2');
  } finally {
    process.env = env;
  }
});

test('recuperação de senha por e-mail (link de uso único, 1 h)', async () => {
  const mail = require('../src/lib/mail');
  const env = { ...process.env };
  try {
    // sem SMTP: tela antiga ("peça ao administrador"), POST não envia nada
    delete process.env.SMTP_HOST;
    let page = await request(app).get('/esqueci-senha');
    assert.match(page.text, /Peça ao administrador/);
    Object.assign(process.env, { SMTP_HOST: 'smtp.teste', SMTP_USER: 'u', SMTP_PASS: 'p', APP_URL: 'https://estudio.teste' });
    users.create({ email: 'dora@t.com', name: 'Dora', passwordHash: await password.hash('senha-dora1'), mustChange: false });
    const agent = request.agent(app);
    page = await agent.get('/esqueci-senha');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    mail.outbox.length = 0;
    // e-mail inexistente: mesma resposta, nada enviado
    let r = await agent.post('/esqueci-senha').type('form').send({ _csrf: csrf, email: 'ninguem@t.com' });
    assert.match(r.text, /Se este e-mail estiver cadastrado/);
    assert.strictEqual(mail.outbox.length, 0);
    r = await agent.post('/esqueci-senha').type('form').send({ _csrf: csrf, email: 'DORA@t.com' });
    assert.match(r.text, /Se este e-mail estiver cadastrado/);
    assert.strictEqual(mail.outbox.length, 1);
    assert.strictEqual(mail.outbox[0].to, 'dora@t.com');
    const link = mail.outbox[0].text.match(/https:\/\/estudio\.teste\/redefinir-senha\?token=([\w-]+)/);
    assert.ok(link, 'link usa APP_URL');
    const token = link[1];
    assert.strictEqual((await agent.get('/redefinir-senha?token=errado')).status, 400);
    assert.strictEqual((await agent.get(`/redefinir-senha?token=${token}`)).status, 200);
    r = await agent.post('/redefinir-senha').type('form').send({ _csrf: csrf, token, next: 'curta', confirm: 'curta' });
    assert.strictEqual(r.status, 400);
    r = await agent.post('/redefinir-senha').type('form').send({ _csrf: csrf, token, next: 'nova-senha-dora', confirm: 'nova-senha-dora' });
    assert.strictEqual(r.status, 302);
    await login('dora@t.com', 'nova-senha-dora');
    // link não pode ser usado de novo
    assert.strictEqual((await agent.get(`/redefinir-senha?token=${token}`)).status, 400);
  } finally {
    process.env = env;
  }
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

// Deve ser o último teste: apaga todos os usuários do banco de testes.
test('ADMIN_WIPE_USERS apaga todos e recria só o admin, uma vez por código', async () => {
  const bootstrap = require('../src/lib/bootstrap');
  const db = require('../src/db');
  const env = { ...process.env };
  try {
    delete process.env.ADMIN_RESET;
    const presBefore = db.prepare('SELECT COUNT(*) AS n FROM presentations').get().n;
    assert.ok(presBefore > 0 && users.list().length > 2);

    // Variáveis inválidas: cancela e não apaga nada.
    Object.assign(process.env, { ADMIN_WIPE_USERS: 'APAGAR-1', ADMIN_EMAIL: 'novo@t.com', ADMIN_PASSWORD: '123' });
    bootstrap();
    assert.ok(users.list().length > 2);

    // Válido: só sobra o novo admin; apresentações e sessões somem.
    process.env.ADMIN_PASSWORD = 'senha-do-novo';
    bootstrap();
    const all = users.list();
    assert.deepStrictEqual(all.map((u) => u.email), ['novo@t.com']);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM presentations').get().n, 0);
    assert.strictEqual((await ana.agent.get('/api/assets')).status, 401, 'sessão antiga encerrada');
    await login('novo@t.com', 'senha-do-novo');

    // Variável esquecida (mesmo código): não apaga de novo.
    users.create({ email: 'equipe@t.com', name: 'Equipe', passwordHash: await password.hash('senha-equipe'), mustChange: false });
    bootstrap();
    assert.ok(users.getAuthRecordByEmail('equipe@t.com'));
  } finally {
    process.env = env;
  }
});
