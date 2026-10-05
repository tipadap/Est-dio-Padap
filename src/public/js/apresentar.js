// Página de apresentação (equipe ou link público).
import { readBoot, api, toast } from './render.js';
import { present } from './present.js';

const boot = readBoot();
document.title = `${boot.title} · Estúdio PADAP`;
const extraButtons = [];
if (boot.canEdit) extraButtons.push({ label: 'Editar', icon: 'edit', href: `/editor/${boot.id}` });
if (boot.canCopy) {
  extraButtons.push({
    label: 'Fazer uma cópia',
    icon: 'copy',
    onClick: async () => {
      try {
        const { id } = await api('POST', `/api/presentations/${boot.id}/copy`, {});
        location.href = `/editor/${id}`;
      } catch (e) {
        toast(e.message, 'error');
      }
    },
  });
}
present(boot.data.slides, { standalone: true, extraButtons });
