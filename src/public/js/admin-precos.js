// Admin > Preços: tabela de preços + indicadores de mercado (+ PTAX automático).
import { api, toast } from './render.js';

const $ = (s) => document.querySelector(s);
const tbody = $('#linhas');
const brl = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
let rows = [];

function cell(value, key, r, attrs = {}) {
  const td = document.createElement('td');
  const i = document.createElement('input');
  i.className = 'text-input';
  i.value = value ?? '';
  Object.assign(i, attrs);
  i.addEventListener('input', () => (r[key] = i.value));
  td.appendChild(i);
  return td;
}

function draw() {
  tbody.replaceChildren();
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Nenhum produto ainda. Clique em “+ Produto”.</td></tr>';
    return;
  }
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.append(
      cell(r.produto, 'produto', r, { placeholder: 'Nome do produto' }),
      cell(r.marca, 'marca', r),
      cell(r.embalagem, 'embalagem', r, { placeholder: 'ex.: Saco 50 kg' }),
      cell(typeof r.preco === 'number' ? brl(r.preco) : r.preco, 'preco', r, { inputMode: 'decimal', placeholder: '0,00' }),
      cell(r.prazo, 'prazo', r, { placeholder: 'ex.: 30 dias' })
    );
    tr.querySelector('input').setAttribute('list', 'produtos');
    // escolher um produto do Portfólio preenche a marca
    tr.querySelector('input').addEventListener('change', (ev) => {
      const opt = [...$('#produtos').options].find((o) => o.value === ev.target.value);
      if (opt && !r.marca) {
        r.marca = opt.dataset.marca;
        draw();
      }
    });
    const td = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-sm btn-danger';
    del.textContent = 'Remover';
    del.addEventListener('click', () => {
      rows.splice(i, 1);
      draw();
    });
    td.appendChild(del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
}

async function load() {
  const d = await api('GET', '/api/precos');
  rows = d.rows.map((r) => ({ ...r }));
  for (const k of ['ureia', 'map', 'kcl']) $(`#${k}`).value = d.market[k] === null ? '' : brl(d.market[k]).replace(',00', '');
  $('#data').value = d.market.data || '';
  $('#fonte').value = d.market.fonte || '';
  $('#ptax').innerHTML = d.ptax
    ? `<strong>R$ ${d.ptax.valor.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</strong> <span class="muted">em ${d.ptax.data.split('-').reverse().join('/')}${d.ptax.variacao !== null ? ` · ${d.ptax.variacao >= 0 ? '+' : ''}${d.ptax.variacao.toFixed(2).replace('.', ',')}% no dia` : ''}</span>`
    : '<span class="muted">Banco Central indisponível no momento.</span>';
  $('#atualizado').textContent = d.atualizado ? `Última atualização: ${new Date(d.atualizado.em).toLocaleString('pt-BR')} por ${d.atualizado.por}` : '';
  draw();
  // sugestões de produtos a partir do Portfólio 2026
  const pf = (await api('GET', '/api/assets?category=portfolio')).assets.filter((a) => a.kind === 'produto');
  $('#produtos').replaceChildren(...pf.map((a) => Object.assign(new Option(a.name), { dataset: { marca: a.brand } })));
  [...$('#produtos').options].forEach((o, i) => (o.dataset.marca = pf[i].brand));
}

$('#add').addEventListener('click', () => {
  rows.push({ produto: '', marca: '', embalagem: '', preco: '', prazo: '30 dias' });
  draw();
  tbody.querySelector('tr:last-child input')?.focus();
});

$('#salvar').addEventListener('click', async () => {
  try {
    await api('PUT', '/api/precos', {
      rows,
      market: { ureia: $('#ureia').value, map: $('#map').value, kcl: $('#kcl').value, data: $('#data').value, fonte: $('#fonte').value },
    });
    toast('Preços salvos.');
    load();
  } catch (e) {
    toast(e.message, 'error');
  }
});

load().catch((e) => toast(e.message, 'error'));
