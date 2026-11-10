// Editor do Estúdio PADAP — Gráficos, tabelas, preços/indicadores de mercado e dados do produtor (Portal).
// Parte de editor.js (núcleo): estado, palco e comandos ficam lá.
import { BRAND, api, toast, uid } from '../render.js';
import { addElement, clone, commit, curSlide, rerenderEl, selEl } from '../editor.js';
import { ic, modal } from './ui.js';

// ---- Gráficos e tabelas ------------------------------------------------------

const SERIES_COLORS = ['#1DBD2C', '#0F4C4F', '#9BB7BD', '#F2A33A', '#5BC0EB', '#7D3C98'];

function isDarkBg() {
  const bg = (curSlide().bg || '#FFFFFF').replace('#', '');
  return (0.299 * parseInt(bg.slice(0, 2), 16) + 0.587 * parseInt(bg.slice(2, 4), 16) + 0.114 * parseInt(bg.slice(4, 6), 16)) / 255 < 0.5;
}

export function addChart(chartType) {
  const dark = isDarkBg();
  const el = {
    id: uid(), type: 'chart', chartType, x: 360, y: 260, w: 1200, h: 640, title: '',
    categories: ['Safra 23/24', 'Safra 24/25', 'Safra 25/26'],
    series: [
      { name: 'Testemunha', color: dark ? '#9BB7BD' : '#B8C7CB', values: [62, 65, 63] },
      { name: 'Programa PADAP', color: '#1DBD2C', values: [71, 76, 79] },
    ],
    showValues: true, showLegend: true, textColor: dark ? '#FFFFFF' : '#0F252F', gridColor: dark ? '#2C5A5E' : '#D9E2E6',
  };
  addElement(el);
  openChartEditor(el);
}

// ---- Preços e indicadores (Admin > Preços) -----------------------------------

const brl = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

async function priceRows() {
  const d = await api('GET', '/api/precos');
  if (!d.rows.length) {
    toast('A tabela de preços ainda está vazia. Um administrador pode preenchê-la em Preços.', 'error');
    return null;
  }
  return [['Produto', 'Marca', 'Embalagem', 'Preço (R$)', 'Prazo'], ...d.rows.map((r) => [r.produto, r.marca, r.embalagem, brl(r.preco), r.prazo])];
}

export async function addPriceTable() {
  const rows = await priceRows();
  if (!rows) return;
  const h = Math.min(760, 64 * rows.length);
  addElement({
    id: uid(), type: 'table', x: 160, y: 240, w: 1600, h,
    rows, colWidths: [0.3, 0.18, 0.2, 0.18, 0.14], align: ['left', 'left', 'left', 'right', 'center'], header: true, fontSize: 26,
  });
  toast(`Tabela com ${rows.length - 1} produto(s) da tabela de preços.`);
}

export async function addMarketIndicators() {
  const d = await api('GET', '/api/precos');
  const m = d.market || {};
  const linhas = [];
  if (d.ptax) linhas.push(`<b>Dólar (PTAX):</b> R$ ${d.ptax.valor.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} <span style="color:#5A6E76">(${dataBR(d.ptax.data)})</span>`);
  if (m.ureia !== null && m.ureia !== undefined) linhas.push(`<b>Ureia:</b> US$ ${brl(m.ureia)}/t`);
  if (m.map !== null && m.map !== undefined) linhas.push(`<b>MAP:</b> US$ ${brl(m.map)}/t`);
  if (m.kcl !== null && m.kcl !== undefined) linhas.push(`<b>KCl:</b> US$ ${brl(m.kcl)}/t`);
  if (!linhas.length) return toast('Sem indicadores cadastrados ainda (Admin > Preços).', 'error');
  const fonte = [m.fonte, m.data ? `ref. ${dataBR(m.data)}` : ''].filter(Boolean).join(' · ');
  const dark = isDarkBg();
  addElement({
    id: uid(), type: 'text', x: 160, y: 300, w: 900, h: 60 * linhas.length + 60,
    html: linhas.map((l) => `<div>${l}</div>`).join('') + (fonte ? `<div style="font-size:20px;color:${dark ? '#9BB7BD' : '#5A6E76'}">Fonte: ${fonte.replace(/</g, '&lt;')}</div>` : ''),
    placeholder: 'Indicadores', style: { fontFamily: 'Space Grotesk', fontSize: 36, color: dark ? '#FFFFFF' : BRAND.teal, align: 'left', valign: 'top', lineHeight: 1.5, bold: false },
  });
  return undefined;
}

// ---- Dados do produtor (Portal do Produtor) ---------------------------------

export function openProducerPicker() {
  const m = modal('Dados do produtor (Portal do Produtor)', { wide: true });
  m.body.innerHTML = `<p class="muted" style="margin-top:0">Busque o produtor e escolha a propriedade: o bloco entra no slide com cliente, fazenda, município e área.</p>
    <input class="text-input" type="search" placeholder="Nome do produtor…" style="max-width:360px;margin-bottom:12px">
    <div class="producers"><div class="muted">Digite ao menos 2 letras.</div></div>`;
  const input = m.body.querySelector('input');
  const box = m.body.querySelector('.producers');
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let timer;
  const search = async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      box.innerHTML = '<div class="muted">Digite ao menos 2 letras.</div>';
      return;
    }
    box.innerHTML = '<div class="muted">Buscando…</div>';
    try {
      const { produtores } = await api('GET', `/api/portal/produtores?q=${encodeURIComponent(q)}`);
      box.replaceChildren();
      if (!produtores.length) box.innerHTML = '<div class="empty">Nenhum produtor encontrado.</div>';
      for (const p of produtores) {
        const card = document.createElement('div');
        card.className = 'producer';
        card.innerHTML = `<strong>${esc(p.nome)}</strong>`;
        const props = p.propriedades.length ? p.propriedades : [{ nome: '', municipio: '', uf: '', area_ha: null }];
        for (const pr of props) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-sm';
          b.textContent = pr.nome ? `${pr.nome} — ${[pr.municipio, pr.uf].filter(Boolean).join('/')}${pr.area_ha ? ` · ${pr.area_ha.toLocaleString('pt-BR')} ha` : ''}` : 'Usar só o nome (sem propriedade cadastrada)';
          b.addEventListener('click', () => {
            m.close();
            insertProducer(p, pr);
          });
          card.appendChild(b);
        }
        box.appendChild(card);
      }
    } catch (err) {
      box.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 300);
  });
  input.focus();
}

function insertProducer(p, pr) {
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const dark = isDarkBg();
  const label = dark ? '#9BEA9F' : '#2E8A43';
  const linhas = [['Cliente', p.nome]];
  if (pr.nome) linhas.push(['Fazenda', pr.nome]);
  const local = [pr.municipio, pr.uf].filter(Boolean).join(' (') + (pr.municipio && pr.uf ? ')' : '');
  if (local) linhas.push(['Local', local]);
  if (pr.area_ha) linhas.push(['Área', `${pr.area_ha.toLocaleString('pt-BR')} ha`]);
  addElement({
    id: uid(), type: 'text', x: 160, y: 300, w: 900, h: 110 * linhas.length,
    html: linhas.map(([k, v]) => `<div><span style="font-size:20px;color:${label};font-weight:bold">${k.toUpperCase()}</span></div><div>${esc(v)}</div>`).join(''),
    placeholder: 'Dados do produtor',
    style: { fontFamily: 'Space Grotesk', fontSize: 38, color: dark ? '#FFFFFF' : BRAND.teal, align: 'left', valign: 'top', lineHeight: 1.3, bold: false },
  });
}

export function addTable() {
  addElement({
    id: uid(), type: 'table', x: 160, y: 300, w: 1600, h: 420,
    rows: [['Produto', 'Marca', 'Embalagem', 'Preço (R$)'], ['', '', '', ''], ['', '', '', ''], ['', '', '', '']],
    colWidths: [0.34, 0.22, 0.24, 0.2], align: ['left', 'left', 'left', 'right'], header: true, fontSize: 26,
  });
  openTableEditor(selEl());
}

function cellInput(value, onInput, attrs = '') {
  const i = document.createElement('input');
  i.className = 'text-input';
  i.value = value;
  if (attrs) i.setAttribute('inputmode', attrs);
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

export function openChartEditor(el) {
  const work = clone(el);
  const m = modal('Dados do gráfico', { wide: true });
  m.body.innerHTML = `<div class="data-opts">
      <label>Tipo <select class="text-input" data-o="type"><option value="bar">Barras</option><option value="line">Linhas</option></select></label>
      <label style="flex:1">Título <input class="text-input" data-o="title" placeholder="(opcional)"></label>
      <label class="check"><input type="checkbox" data-o="values"> Mostrar valores</label>
      <label class="check"><input type="checkbox" data-o="legend"> Mostrar legenda</label>
    </div>
    <div class="data-grid-wrap"><table class="data-grid"></table></div>
    <div class="data-actions">
      <button class="btn btn-sm" type="button" data-a="addCat">+ Categoria (linha)</button>
      <button class="btn btn-sm" type="button" data-a="addSer">+ Série (coluna)</button>
      <span style="flex:1"></span>
      <button class="btn btn-sm" type="button" data-a="cancel">Cancelar</button>
      <button class="btn btn-sm btn-primary" type="button" data-a="ok">Aplicar</button>
    </div>`;
  const q = (s) => m.body.querySelector(s);
  q('[data-o=type]').value = work.chartType;
  q('[data-o=title]').value = work.title || '';
  q('[data-o=values]').checked = work.showValues !== false;
  q('[data-o=legend]').checked = work.showLegend !== false;
  const grid = q('.data-grid');
  const draw = () => {
    grid.replaceChildren();
    const head = grid.insertRow();
    head.insertCell().textContent = 'Categoria';
    work.series.forEach((s, si) => {
      const td = head.insertCell();
      const wrap = document.createElement('div');
      wrap.className = 'ser-head';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = s.color;
      color.addEventListener('input', () => (s.color = color.value.toUpperCase()));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover série';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (work.series.length > 1) work.series.splice(si, 1);
        draw();
      });
      wrap.append(color, cellInput(s.name, (v) => (s.name = v)), del);
      td.appendChild(wrap);
    });
    work.categories.forEach((c, ci) => {
      const tr = grid.insertRow();
      const td0 = tr.insertCell();
      const wrap = document.createElement('div');
      wrap.className = 'ser-head';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover categoria';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (work.categories.length > 1) {
          work.categories.splice(ci, 1);
          work.series.forEach((s) => s.values.splice(ci, 1));
        }
        draw();
      });
      wrap.append(cellInput(c, (v) => (work.categories[ci] = v)), del);
      td0.appendChild(wrap);
      work.series.forEach((s) => {
        tr.insertCell().appendChild(cellInput(String(s.values[ci] ?? 0).replace('.', ','), (v) => (s.values[ci] = Number(v.replace(/\./g, '').replace(',', '.')) || 0), 'decimal'));
      });
    });
  };
  draw();
  m.body.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'addCat') {
      work.categories.push(`Item ${work.categories.length + 1}`);
      work.series.forEach((s) => s.values.push(0));
      draw();
    } else if (a === 'addSer') {
      work.series.push({ name: `Série ${work.series.length + 1}`, color: SERIES_COLORS[work.series.length % SERIES_COLORS.length], values: work.categories.map(() => 0) });
      draw();
    } else if (a === 'cancel') m.close();
    else if (a === 'ok') {
      Object.assign(el, work, {
        chartType: q('[data-o=type]').value,
        title: q('[data-o=title]').value.trim(),
        showValues: q('[data-o=values]').checked,
        showLegend: q('[data-o=legend]').checked,
      });
      rerenderEl(el);
      commit();
      m.close();
    }
  });
}

export function openTableEditor(el) {
  const work = clone(el);
  const m = modal('Dados da tabela', { wide: true });
  m.body.innerHTML = `<div class="data-opts">
      <label class="check"><input type="checkbox" data-o="header"> 1ª linha é cabeçalho</label>
      <label>Tamanho do texto <input class="text-input" data-o="fs" type="number" min="8" max="120" style="width:90px"></label>
    </div>
    <div class="data-grid-wrap"><table class="data-grid"></table></div>
    <div class="data-actions">
      <button class="btn btn-sm" type="button" data-a="addRow">+ Linha</button>
      <button class="btn btn-sm" type="button" data-a="addCol">+ Coluna</button>
      <button class="btn btn-sm" type="button" data-a="prices">Preencher com a tabela de preços</button>
      <span style="flex:1"></span>
      <button class="btn btn-sm" type="button" data-a="cancel">Cancelar</button>
      <button class="btn btn-sm btn-primary" type="button" data-a="ok">Aplicar</button>
    </div>`;
  const q = (s) => m.body.querySelector(s);
  q('[data-o=header]').checked = work.header !== false;
  q('[data-o=fs]').value = work.fontSize || 24;
  const grid = q('.data-grid');
  const cols = () => Math.max(1, ...work.rows.map((r) => r.length));
  const draw = () => {
    grid.replaceChildren();
    const n = cols();
    work.align = Array.from({ length: n }, (_, i) => (work.align && work.align[i]) || 'left');
    const ctrl = grid.insertRow();
    for (let c = 0; c < n; c++) {
      const td = ctrl.insertCell();
      const wrap = document.createElement('div');
      wrap.className = 'ser-head';
      const sel = document.createElement('select');
      sel.className = 'text-input';
      sel.title = 'Alinhamento da coluna';
      [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']].forEach(([v, t]) => sel.add(new Option(t, v)));
      sel.value = work.align[c];
      sel.addEventListener('change', () => (work.align[c] = sel.value));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover coluna';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (n > 1) {
          work.rows.forEach((r) => r.splice(c, 1));
          work.align.splice(c, 1);
          if (work.colWidths) {
            work.colWidths.splice(c, 1);
            const t = work.colWidths.reduce((a, b) => a + b, 0);
            work.colWidths = work.colWidths.map((w) => w / t);
          }
        }
        draw();
      });
      wrap.append(sel, del);
      td.appendChild(wrap);
    }
    ctrl.insertCell();
    work.rows.forEach((r, ri) => {
      const tr = grid.insertRow();
      for (let c = 0; c < n; c++) tr.insertCell().appendChild(cellInput(r[c] ?? '', (v) => (r[c] = v)));
      const td = tr.insertCell();
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover linha';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (work.rows.length > 1) work.rows.splice(ri, 1);
        draw();
      });
      td.appendChild(del);
    });
  };
  draw();
  m.body.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'addRow') {
      work.rows.push(Array(cols()).fill(''));
      draw();
    } else if (a === 'prices') {
      priceRows().then((rows) => {
        if (!rows) return;
        work.rows = rows;
        work.colWidths = [0.3, 0.18, 0.2, 0.18, 0.14];
        work.align = ['left', 'left', 'left', 'right', 'center'];
        draw();
      });
    } else if (a === 'addCol') {
      work.rows.forEach((r) => r.push(''));
      if (work.colWidths) {
        const n = work.colWidths.length + 1;
        work.colWidths = [...work.colWidths.map((w) => (w * (n - 1)) / n), 1 / n];
      }
      draw();
    } else if (a === 'cancel') m.close();
    else if (a === 'ok') {
      // cresce/encolhe a altura junto com o número de linhas
      const rowH = el.h / Math.max(1, el.rows.length);
      Object.assign(el, work, { header: q('[data-o=header]').checked, fontSize: Number(q('[data-o=fs]').value) || 24 });
      el.h = Math.round(rowH * el.rows.length);
      rerenderEl(el);
      commit();
      m.close();
    }
  });
}
