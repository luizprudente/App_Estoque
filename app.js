// ===================== Estado e Persistência =====================
const STORAGE_KEY = 'estoque_produtos';

/** @typedef {{ id: string, nome: string, estoqueAtual: number, estoqueMinimo: number }} Produto */

/** @returns {Produto[]} */
function carregarProdutos() {
  try {
    const dados = localStorage.getItem(STORAGE_KEY);
    return dados ? JSON.parse(dados) : [];
  } catch {
    return [];
  }
}

/** @param {Produto[]} produtos */
function salvarProdutos(produtos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(produtos));
}

let produtos = carregarProdutos();
let ultimaListaCompras = [];

// ===================== Navegação por Abas =====================
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => ativarAba(btn.dataset.tab));
});

function ativarAba(nomeAba) {
  tabButtons.forEach((btn) => {
    const ativo = btn.dataset.tab === nomeAba;
    btn.classList.toggle('bg-blue-600', ativo);
    btn.classList.toggle('text-white', ativo);
    btn.classList.toggle('bg-white', !ativo);
    btn.classList.toggle('text-gray-700', !ativo);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `tab-${nomeAba}`);
  });
  if (nomeAba === 'contagem') renderizarContagem();
}

// ===================== Toast de Feedback =====================
let toastTimeout;
function mostrarToast(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.remove('opacity-0');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('opacity-0'), 2000);
}

// ===================== Cadastro de Produtos =====================
const formProduto = document.getElementById('form-produto');
const inputNome = document.getElementById('input-nome');
const inputAtual = document.getElementById('input-atual');
const inputMinimo = document.getElementById('input-minimo');
const tabelaCadastro = document.getElementById('tabela-cadastro');
const cadastroVazio = document.getElementById('cadastro-vazio');

formProduto.addEventListener('submit', (e) => {
  e.preventDefault();

  const nome = inputNome.value.trim();
  const estoqueAtual = Number(inputAtual.value);
  const estoqueMinimo = Number(inputMinimo.value);

  if (!nome || estoqueAtual < 0 || estoqueMinimo < 0) return;

  produtos.push({
    id: crypto.randomUUID(),
    nome,
    estoqueAtual,
    estoqueMinimo,
  });

  salvarProdutos(produtos);
  formProduto.reset();
  inputNome.focus();
  renderizarCadastro();
  mostrarToast('Produto adicionado!');
});

function renderizarCadastro() {
  tabelaCadastro.innerHTML = '';
  cadastroVazio.classList.toggle('hidden', produtos.length > 0);

  produtos.forEach((produto) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(produto.nome)}</td>
      <td class="py-2 pr-2">${produto.estoqueAtual}</td>
      <td class="py-2 pr-2">${produto.estoqueMinimo}</td>
      <td class="py-2 pr-2 text-right">
        <button class="text-red-500 hover:text-red-700 text-xs font-medium" data-excluir="${produto.id}">
          Excluir
        </button>
      </td>
    `;
    tabelaCadastro.appendChild(tr);
  });

  tabelaCadastro.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.excluir;
      if (!confirm('Excluir este produto?')) return;
      produtos = produtos.filter((p) => p.id !== id);
      salvarProdutos(produtos);
      renderizarCadastro();
      mostrarToast('Produto excluído.');
    });
  });
}

// ===================== Contagem do Dia =====================
const listaContagem = document.getElementById('lista-contagem');
const contagemVazio = document.getElementById('contagem-vazio');
const dataContagem = document.getElementById('data-contagem');

function renderizarContagem() {
  dataContagem.textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  listaContagem.innerHTML = '';
  contagemVazio.classList.toggle('hidden', produtos.length > 0);

  produtos.forEach((produto) => {
    const linha = document.createElement('div');
    linha.className = 'py-3 flex items-center justify-between gap-3 flex-wrap';
    linha.innerHTML = `
      <div>
        <p class="font-medium">${escapeHtml(produto.nome)}</p>
        <p class="text-xs text-gray-400">Mínimo: ${produto.estoqueMinimo}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-decrementar w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold" data-id="${produto.id}">−</button>
        <input type="number" min="0" step="1" value="${produto.estoqueAtual}"
          data-id="${produto.id}" class="input-contagem w-20 text-center rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        <button class="btn-incrementar w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold" data-id="${produto.id}">+</button>
      </div>
    `;
    listaContagem.appendChild(linha);
  });

  listaContagem.querySelectorAll('.input-contagem').forEach((input) => {
    input.addEventListener('change', () => atualizarEstoqueAtual(input.dataset.id, Number(input.value)));
  });
  listaContagem.querySelectorAll('.btn-incrementar').forEach((btn) => {
    btn.addEventListener('click', () => ajustarEstoqueAtual(btn.dataset.id, 1));
  });
  listaContagem.querySelectorAll('.btn-decrementar').forEach((btn) => {
    btn.addEventListener('click', () => ajustarEstoqueAtual(btn.dataset.id, -1));
  });
}

function atualizarEstoqueAtual(id, novoValor) {
  const produto = produtos.find((p) => p.id === id);
  if (!produto || Number.isNaN(novoValor) || novoValor < 0) return;
  produto.estoqueAtual = novoValor;
  salvarProdutos(produtos);
  mostrarToast(`${produto.nome} atualizado.`);
}

function ajustarEstoqueAtual(id, delta) {
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return;
  produto.estoqueAtual = Math.max(0, produto.estoqueAtual + delta);
  salvarProdutos(produtos);
  renderizarContagem();
}

// ===================== Lista de Compras =====================
const btnGerarLista = document.getElementById('btn-gerar-lista');
const tabelaListaCompras = document.getElementById('tabela-lista-compras');
const listaVazia = document.getElementById('lista-vazia');
const listaComprasAcoes = document.getElementById('lista-compras-acoes');
const btnExportarTexto = document.getElementById('btn-exportar-texto');
const btnWhatsapp = document.getElementById('btn-whatsapp');

btnGerarLista.addEventListener('click', gerarListaCompras);

function gerarListaCompras() {
  ultimaListaCompras = produtos
    .filter((p) => p.estoqueAtual < p.estoqueMinimo)
    .map((p) => ({
      ...p,
      comprar: p.estoqueMinimo - p.estoqueAtual,
    }));

  renderizarListaCompras();
  mostrarToast('Lista de compras gerada!');
}

function renderizarListaCompras() {
  tabelaListaCompras.innerHTML = '';
  const temItens = ultimaListaCompras.length > 0;

  listaVazia.classList.toggle('hidden', temItens);
  listaComprasAcoes.classList.toggle('hidden', !temItens);

  ultimaListaCompras.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(item.nome)}</td>
      <td class="py-2 pr-2">${item.estoqueAtual}</td>
      <td class="py-2 pr-2">${item.estoqueMinimo}</td>
      <td class="py-2 pr-2 font-semibold text-red-600">${item.comprar}</td>
    `;
    tabelaListaCompras.appendChild(tr);
  });
}

function montarTextoListaCompras() {
  if (ultimaListaCompras.length === 0) return '';
  const linhas = ultimaListaCompras.map(
    (item) => `- ${item.nome}: ${item.comprar} un. (atual: ${item.estoqueAtual} / mínimo: ${item.estoqueMinimo})`
  );
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  return `🛒 Lista de Compras - ${dataHoje}\n\n${linhas.join('\n')}`;
}

btnExportarTexto.addEventListener('click', async () => {
  const texto = montarTextoListaCompras();
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    mostrarToast('Lista copiada para a área de transferência!');
  } catch {
    // Fallback caso a API de clipboard não esteja disponível
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    mostrarToast('Lista copiada para a área de transferência!');
  }
});

btnWhatsapp.addEventListener('click', () => {
  const texto = montarTextoListaCompras();
  if (!texto) return;
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
});

// ===================== Utilitário =====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===================== Inicialização =====================
renderizarCadastro();
renderizarContagem();
