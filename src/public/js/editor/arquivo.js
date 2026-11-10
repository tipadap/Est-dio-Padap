// Editor do Estúdio PADAP — Compartilhar, exportar (PowerPoint/PDF/impressão), salvar como e histórico de versões.
// Parte de editor.js (núcleo): estado, palco e comandos ficam lá.
import { exportPdf } from '../pdf.js';
import { exportPptx } from '../pptx.js';
import { api, fmtDate, mountThumb, toast } from '../render.js';
import { boot, discardPending, ensureSaved, flush, markDirty, pres, setStatus, slides } from '../editor.js';
import { ic, modal } from './ui.js';

// ---- Compartilhar ---------------------------------------------------------

export async function openShare() {
  if (!(await ensureSaved())) return;
  const m = modal('Compartilhar');
  const link = () => (boot.shareToken ? `${location.origin}/v/${boot.shareToken}` : '');
  m.body.innerHTML = `
    <div class="share-row"><input type="checkbox" id="sh-team" class="check"><label for="sh-team" class="txt">
      <strong>Visível para a equipe</strong><span>Todos os usuários do Estúdio veem na Biblioteca (aba “Compartilhadas pela equipe”), podem apresentar e fazer uma cópia. Só você edita.</span></label></div>
    <div class="share-row"><input type="checkbox" id="sh-public"><div class="txt" style="flex:1"><label for="sh-public">
      <strong>Link público de visualização</strong><span>Qualquer pessoa com o link pode assistir à apresentação, sem login (ex.: enviar a um cliente).</span></label>
      <div class="share-link" hidden><input class="text-input" readonly><button class="btn btn-sm" type="button">${ic('copy')} Copiar</button></div></div></div>`;
  const team = m.body.querySelector('#sh-team');
  const pub = m.body.querySelector('#sh-public');
  const linkBox = m.body.querySelector('.share-link');
  const linkInput = linkBox.querySelector('input');
  const draw = () => {
    team.checked = !!boot.teamVisible;
    pub.checked = !!boot.shareToken;
    linkBox.hidden = !boot.shareToken;
    linkInput.value = link();
  };
  const send = async (body) => {
    try {
      const r = await api('POST', `/api/presentations/${pres.id}/share`, body);
      boot.teamVisible = r.team;
      boot.shareToken = r.shareToken;
    } catch (e) {
      toast(e.message, 'error');
    }
    draw();
  };
  team.addEventListener('change', () => send({ team: team.checked }));
  pub.addEventListener('change', () => send({ public: pub.checked }));
  linkBox.querySelector('button').addEventListener('click', async () => {
    await flush();
    try {
      await navigator.clipboard.writeText(link());
      toast('Link copiado.');
    } catch (e) {
      linkInput.select();
    }
  });
  draw();
}

// ---- Exportar / salvar ----------------------------------------------------

export async function doExportPptx() {
  await flush();
  toast('Gerando o arquivo do PowerPoint…');
  try {
    const warnings = await exportPptx(pres.title, slides(), (i, n) => setStatus(`Exportando slide ${i} de ${n}…`));
    setStatus('Todas as alterações foram salvas');
    toast(warnings.length ? `PowerPoint gerado, mas ${warnings.length} imagem(ns) não puderam ser incluídas.` : 'PowerPoint gerado.', warnings.length ? 'error' : '');
  } catch (e) {
    setStatus('Todas as alterações foram salvas');
    toast(e.message, 'error');
  }
}

// ---- Histórico de versões ----------------------------------------------------

export async function openHistory() {
  if (!pres.id) return toast('Esta apresentação ainda não foi salva — não há versões anteriores.');
  await flush();
  const m = modal('Histórico de versões', { wide: true });
  m.body.innerHTML = `<p class="muted" style="margin-top:0">Uma cópia é guardada automaticamente a cada 10 minutos de edição (até as 50 mais recentes). Restaurar não apaga nada: a versão atual também fica guardada.</p>
    <div class="history"><div class="history-list"></div><div class="history-preview"><div class="muted">Escolha uma versão à esquerda.</div></div></div>`;
  const listBox = m.body.querySelector('.history-list');
  const prev = m.body.querySelector('.history-preview');
  let versions = [];
  try {
    versions = (await api('GET', `/api/presentations/${pres.id}/versions`)).versions;
  } catch (err) {
    toast(err.message, 'error');
  }
  if (!versions.length) {
    listBox.innerHTML = '<div class="empty">Ainda não há versões anteriores. Elas aparecem depois de alguns minutos de edição.</div>';
    return undefined;
  }
  for (const v of versions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'history-item';
    b.innerHTML = '<strong></strong><span></span>';
    b.querySelector('strong').textContent = fmtDate(v.created_at);
    b.querySelector('span').textContent = [v.reason === 'restore' ? 'Antes de uma restauração' : null, v.author_name, `${v.slide_count} slide${v.slide_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    b.addEventListener('click', async () => {
      listBox.querySelectorAll('.history-item').forEach((x) => x.classList.toggle('on', x === b));
      prev.innerHTML = '<div class="muted">Carregando…</div>';
      try {
        const full = await api('GET', `/api/presentations/${pres.id}/versions/${v.id}`);
        prev.innerHTML = `<div class="history-head"><strong></strong><button class="btn btn-primary btn-sm" type="button">Restaurar esta versão</button></div><div class="history-thumbs"></div>`;
        prev.querySelector('strong').textContent = `${full.title} — ${fmtDate(full.created_at)}`;
        const thumbs = prev.querySelector('.history-thumbs');
        for (const s of full.data.slides) {
          const t = document.createElement('div');
          thumbs.appendChild(t);
          mountThumb(t, s);
        }
        prev.querySelector('button').addEventListener('click', async () => {
          if (!confirm('Restaurar esta versão? A versão atual será guardada no histórico.')) return;
          try {
            await api('POST', `/api/presentations/${pres.id}/versions/${v.id}/restore`);
            discardPending();
            location.reload();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      } catch (err) {
        prev.innerHTML = '';
        toast(err.message, 'error');
      }
    });
    listBox.appendChild(b);
  }
  return undefined;
}

export async function doExportPdf() {
  await flush();
  toast('Gerando o PDF…');
  try {
    await exportPdf(pres.title, slides(), (i, n) => setStatus(`Gerando PDF: slide ${i} de ${n}…`));
    toast('PDF gerado.');
  } catch (err) {
    toast(err.message, 'error');
  }
  setStatus(pres.id ? 'Todas as alterações foram salvas' : 'Rascunho — será salvo na primeira edição');
}

export async function openPrint(pdf) {
  if (!(await ensureSaved())) return;
  window.open(`/imprimir/${pres.id}?auto=1${pdf ? '&pdf=1' : ''}`, '_blank');
}

export async function saveAs() {
  const title = prompt('Salvar uma cópia com o nome:', `${pres.title} (cópia)`);
  if (!title) return;
  if (!(await ensureSaved())) return;
  try {
    const { id } = await api('POST', `/api/presentations/${pres.id}/copy`, { title, data: pres.data });
    location.href = `/editor/${id}`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function saveNow() {
  markDirty();
  if (await flush()) toast('Apresentação salva.');
}
