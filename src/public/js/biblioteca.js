import { readBoot } from './render.js';
import { presCard } from './lib-card.js';

const boot = readBoot();
const grid = document.getElementById('grid');
const search = document.getElementById('search');
let tab = 'mine';

function draw() {
  const q = search.value.trim().toLowerCase();
  const list = (boot[tab] || []).filter((p) => !q || p.title.toLowerCase().includes(q));
  grid.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.style.gridColumn = '1 / -1';
    empty.textContent = q
      ? 'Nenhuma apresentação encontrada.'
      : tab === 'mine'
      ? 'Você ainda não tem apresentações. Comece por um modelo pronto na Página Inicial.'
      : 'Nenhuma apresentação foi compartilhada com a equipe ainda.';
    grid.appendChild(empty);
    return;
  }
  list.forEach((p) => grid.appendChild(presCard(p, { team: tab === 'team', onChange: draw })));
}

document.querySelectorAll('.tab').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
    tab = b.dataset.tab;
    draw();
  })
);
search.addEventListener('input', draw);
draw();
