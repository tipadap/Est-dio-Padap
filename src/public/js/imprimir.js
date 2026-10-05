// Página de impressão / PDF: um slide por página (16:9).
import { readBoot, renderSlide } from './render.js';

const boot = readBoot();
const params = new URLSearchParams(location.search);
const pages = document.getElementById('pages');

if (params.get('pdf')) {
  document.title = boot.title; // vira o nome sugerido do arquivo PDF
  document.getElementById('help-title').textContent = 'Exportar PDF';
  document.getElementById('help-text').textContent =
    'Na janela que abrir, escolha o destino “Salvar como PDF”. Em “Mais definições”, deixe margens em “Nenhuma” e ative “Gráficos de plano de fundo”.';
}

for (const s of boot.data.slides) {
  const page = document.createElement('div');
  page.className = 'page-slide';
  page.appendChild(renderSlide(s));
  pages.appendChild(page);
}

async function ready() {
  await document.fonts?.ready;
  await Promise.all(
    [...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })))
  );
}

document.getElementById('print-btn').addEventListener('click', () => window.print());
if (params.get('auto')) ready().then(() => setTimeout(() => window.print(), 300));
