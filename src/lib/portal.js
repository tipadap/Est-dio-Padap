'use strict';

// Busca de produtores e propriedades no Portal do Produtor (somente leitura).
// Configuração (Railway): PORTAL_URL (ex.: https://portal.padapagronegocios.com.br) e
// PORTAL_API_TOKEN (a mesma chave definida como ESTUDIO_API_TOKEN no Portal).
function isConfigured() {
  return !!(process.env.PORTAL_URL && process.env.PORTAL_API_TOKEN);
}

async function searchProducers(q) {
  const url = `${process.env.PORTAL_URL.replace(/\/$/, '')}/api/integracao/produtores?q=${encodeURIComponent(String(q || '').slice(0, 60))}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${process.env.PORTAL_API_TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new Error('O Portal recusou a chave de integração (confira PORTAL_API_TOKEN).');
  if (res.status === 404) throw new Error('A integração está desligada no Portal (falta ESTUDIO_API_TOKEN lá).');
  if (!res.ok) throw new Error(`O Portal respondeu com erro ${res.status}.`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

module.exports = { isConfigured, searchProducers };
