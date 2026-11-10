'use strict';

// Dólar PTAX (venda) do Banco Central — API pública Olinda, sem chave.
// Guarda em memória por 3 h; se o BCB estiver fora, devolve o último valor conhecido (ou null).
const URL_BASE =
  'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)';
const TTL = 3 * 60 * 60 * 1000;

let cache = null; // { at, value: { valor, data, variacao } }

const mdY = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;

async function fetchPtax(now = new Date()) {
  const ini = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const url =
    `${URL_BASE}?@dataInicial='${mdY(ini)}'&@dataFinalCotacao='${mdY(now)}'` +
    '&$top=100&$format=json&$select=cotacaoVenda,dataHoraCotacao';
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BCB respondeu ${res.status}`);
  const rows = (await res.json()).value || [];
  if (!rows.length) throw new Error('BCB sem cotações no período');
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  return {
    valor: Number(last.cotacaoVenda),
    data: String(last.dataHoraCotacao).slice(0, 10), // AAAA-MM-DD
    variacao: prev ? (Number(last.cotacaoVenda) / Number(prev.cotacaoVenda) - 1) * 100 : null,
    fonte: 'Banco Central do Brasil (PTAX venda)',
  };
}

async function getPtax() {
  if (process.env.NODE_ENV === 'test') return null; // testes não dependem da internet
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  try {
    cache = { at: Date.now(), value: await fetchPtax() };
  } catch (err) {
    console.warn(`[ptax] não foi possível atualizar: ${err.message}`);
    if (cache) cache.at = Date.now() - TTL + 10 * 60 * 1000; // tenta de novo em 10 min
  }
  return cache ? cache.value : null;
}

module.exports = { getPtax, fetchPtax };
