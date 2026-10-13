'use strict';
// Utilidades compartilhadas pelas páginas

// Chama a API e devolve o JSON; lança Error com a mensagem do servidor
async function api(caminho, opcoes = {}) {
  const init = { method: opcoes.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opcoes.corpo !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opcoes.corpo);
  }
  let res;
  try {
    res = await fetch(caminho, init);
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(dados.erro || 'Algo deu errado. Tente de novo.');
    e.status = res.status;
    throw e;
  }
  return dados;
}

// Escapa texto para usar dentro de HTML
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Máscara (14) 99999-8888 enquanto digita
function mascaraCelular(input) {
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    input.value = v;
  });
}

function formatarCelular(d) {
  d = String(d || '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
}

function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';
}

function dataCurta(aaaammdd) {
  return aaaammdd ? aaaammdd.split('-').reverse().join('/') : '';
}

const CORES = { vermelho: '#c62c2c', preto: '#241c17', verde: '#2f7d3a' };
const corDe = (c) => CORES[c] || c || '#241c17';

const ICONES = { roleta: '🎡', raspadinha: '🪙', caixa: '🎁' };
const NOMES_TIPO = { roleta: 'Roleta', raspadinha: 'Raspadinha', caixa: 'Caixa surpresa' };
