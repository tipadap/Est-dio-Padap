// Modo apresentação: tela cheia, setas/espaço para navegar, Esc para sair.
import { ICONS } from '/js/icons.js';
import { renderSlide, W, H } from './render.js';

const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${ICONS[n]}</svg>`;

/**
 * Abre o visualizador.
 * opts: { start, fullscreen, onExit, extraButtons: [{label, icon, onClick}], standalone }
 */
export function present(slides, opts = {}) {
  let i = Math.min(Math.max(opts.start || 0, 0), slides.length - 1);
  let showNotes = false;
  const root = document.createElement('div');
  root.className = 'viewer';
  root.innerHTML = `
    <div class="vstage"><div class="vframe"></div><div class="progress"></div></div>
    <div class="vbar">
      <img src="/static/img/padap-logo-branco.png" alt="PADAP">
      <span class="grow"></span>
      <button type="button" data-a="prev" aria-label="Slide anterior">${ic('chevronLeft')}</button>
      <span class="counter"></span>
      <button type="button" data-a="next" aria-label="Próximo slide">${ic('chevronRight')}</button>
      <span class="grow"></span>
      <span class="extra"></span>
      <button type="button" data-a="notes" title="Anotações (N)">${ic('notes')}</button>
      <button type="button" data-a="fs" title="Tela cheia (F)">${ic('maximize')}</button>
      ${opts.standalone ? '' : `<button type="button" data-a="exit">${ic('x')} Sair</button>`}
    </div>`;
  document.body.appendChild(root);
  const frame = root.querySelector('.vframe');
  const vstage = root.querySelector('.vstage');
  const counter = root.querySelector('.counter');
  const progress = root.querySelector('.progress');
  let notesPop = null;

  for (const b of opts.extraButtons || []) {
    const btn = document.createElement(b.href ? 'a' : 'button');
    if (b.href) btn.href = b.href;
    else btn.type = 'button';
    btn.innerHTML = `${ic(b.icon)} ${b.label}`;
    if (b.onClick) btn.addEventListener('click', b.onClick);
    root.querySelector('.extra').appendChild(btn);
  }

  function fit() {
    const r = vstage.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H);
    frame.style.width = `${W * s}px`;
    frame.style.height = `${H * s}px`;
    const sl = frame.firstChild;
    if (sl) sl.style.transform = `scale(${s})`;
  }

  function show() {
    const node = renderSlide(slides[i]);
    node.classList.add('enter');
    frame.replaceChildren(node);
    fit();
    counter.textContent = `${i + 1} / ${slides.length}`;
    progress.style.width = `${((i + 1) / slides.length) * 100}%`;
    if (notesPop) notesPop.remove();
    notesPop = null;
    if (showNotes && slides[i].notes) {
      notesPop = document.createElement('div');
      notesPop.className = 'notes-pop';
      notesPop.textContent = slides[i].notes;
      vstage.appendChild(notesPop);
    }
  }

  const go = (d) => {
    const n = Math.min(Math.max(i + d, 0), slides.length - 1);
    if (n !== i) {
      i = n;
      show();
    }
  };

  function exit() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fit);
    document.removeEventListener('fullscreenchange', onFs);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    root.remove();
    if (opts.onExit) opts.onExit(i);
  }

  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.().catch(() => {});
  }
  // Ao sair da tela cheia pelo Esc do navegador, sai também da apresentação (no editor).
  let wasFs = false;
  function onFs() {
    if (document.fullscreenElement) wasFs = true;
    else if (wasFs && !opts.standalone) exit();
    setTimeout(fit, 50);
  }

  function onKey(e) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) go(-1);
    else if (e.key === 'Home') go(-slides.length);
    else if (e.key === 'End') go(slides.length);
    else if (e.key === 'Escape' && !opts.standalone) exit();
    else if (e.key === 'f' || e.key === 'F') toggleFs();
    else if (e.key === 'n' || e.key === 'N') {
      showNotes = !showNotes;
      show();
    } else return;
    e.preventDefault();
  }

  root.querySelector('.vbar').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'prev') go(-1);
    if (a === 'next') go(1);
    if (a === 'exit') exit();
    if (a === 'fs') toggleFs();
    if (a === 'notes') {
      showNotes = !showNotes;
      show();
    }
  });
  vstage.addEventListener('click', (e) => {
    const r = vstage.getBoundingClientRect();
    go(e.clientX < r.left + r.width * 0.25 ? -1 : 1);
  });

  // Esconde a barra e o cursor depois de alguns segundos sem mexer o mouse.
  let idle;
  root.addEventListener('mousemove', () => {
    root.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => root.classList.add('idle'), 2500);
  });

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', onFs);
  if (opts.fullscreen) root.requestFullscreen?.().catch(() => {});
  show();
  return { exit };
}
