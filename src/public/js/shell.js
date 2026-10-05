// Comportamentos comuns: menu lateral no celular, mostrar senha, confirmação de formulários.
import { ICONS } from '/js/icons.js';

document.querySelector('[data-toggle-menu]')?.addEventListener('click', () => {
  document.getElementById('shell').classList.toggle('open');
});

document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.togglePassword);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    btn.innerHTML = `<svg class="i" viewBox="0 0 24 24">${show ? ICONS.eye : ICONS.eyeOff}</svg>`;
  });
});

document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!window.confirm(form.dataset.confirm)) e.preventDefault();
  });
});
