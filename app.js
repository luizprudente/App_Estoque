// ===================== Chaves de Persistência =====================
const PRODUTOS_KEY = 'estoque_produtos';
const NOTAS_KEY = 'estoque_notas';
const PERIODO_KEY = 'estoque_periodo';

/**
 * @typedef {{ id: string, nome: string, estoqueAtual: number, estoqueMinimo: number,
 *   estoqueInicial: number, comprasNotas: number }} Produto
 * @typedef {{ id: string, data: string, arquivoNome: string,
 *   itens: { produtoId: string, nome: string, quantidade: number }[] }} Nota
 */

// ===================== Carregamento e Persistência =====================
function carregarProdutos() {
  try {
    const dados = localStorage.getItem(PRODUTOS_KEY);
    return dados ? JSON.parse(dados) : [];
  } catch {
    return [];
  }
}

/** Garante que produtos salvos por uma versão anterior do app tenham os novos campos. */
function migrarProdutos(lista) {
  let alterado = false;
  lista.forEach((p) => {
    if (typeof p.estoqueInicial !== 'number') {
      p.estoqueInicial = p.estoqueAtual;
      alterado = true;
    }
    if (typeof p.comprasNotas !== 'number') {
      p.comprasNotas = 0;
      alterado = true;
    }
  });
  if (alterado) salvarProdutos(lista);
  return lista;
}

function salvarProdutos(lista) {
  localStorage.setItem(PRODUTOS_KEY, JSON.stringify(lista));
}

function carregarNotas() {
  try {
    const dados = localStorage.getItem(NOTAS_KEY);
    return dados ? JSON.parse(dados) : [];
  } catch {
    return [];
  }
}

function salvarNotas(lista) {
  localStorage.setItem(NOTAS_KEY, JSON.stringify(lista));
}

function carregarPeriodo() {
  try {
    const dados = localStorage.getItem(PERIODO_KEY);
    return dados ? JSON.parse(dados) : { inicio: new Date().toISOString() };
  } catch {
    return { inicio: new Date().toISOString() };
  }
}

function salvarPeriodo(periodo) {
  localStorage.setItem(PERIODO_KEY, JSON.stringify(periodo));
}

let produtos = migrarProdutos(carregarProdutos());
let notas = carregarNotas();
let periodo = carregarPeriodo();
let ultimaListaCompras = [];

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

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
  if (nomeAba === 'entrada') renderizarHistoricoNotas();
  if (nomeAba === 'relatorio') renderizarRelatorio();
}

// ===================== Toast de Feedback =====================
let toastTimeout;
function mostrarToast(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.remove('opacity-0');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('opacity-0'), 2500);
}

// ===================== Cadastro de Produtos =====================
const formProduto = document.getElementById('form-produto');
const inputNome = document.getElementById('input-nome');
const inputAtual = document.getElementById('input-atual');
const inputMinimo = document.getElementById('input-minimo');
const tabelaCadastro = document.getElementById('tabela-cadastro');
const cadastroVazio = document.getElementById('cadastro-vazio');

selecionarConteudoAoFocar(inputAtual);
selecionarConteudoAoFocar(inputMinimo);

formProduto.addEventListener('submit', (e) => {
  e.preventDefault();

  const nome = inputNome.value.trim();
  const estoqueAtual = paraNumero(inputAtual.value);
  const estoqueMinimo = paraNumero(inputMinimo.value);

  if (!nome || Number.isNaN(estoqueAtual) || Number.isNaN(estoqueMinimo) || estoqueAtual < 0 || estoqueMinimo < 0) {
    mostrarToast('Preencha o nome e valores válidos (ex: 4 ou 4,3).');
    return;
  }

  produtos.push({
    id: crypto.randomUUID(),
    nome,
    estoqueAtual,
    estoqueMinimo,
    estoqueInicial: estoqueAtual,
    comprasNotas: 0,
  });

  salvarProdutos(produtos);
  formProduto.reset();
  inputNome.focus();
  renderizarCadastro();
  mostrarToast('Produto adicionado!');
});

/** Cria um produto rapidamente a partir de um item identificado numa nota (usado na revisão do OCR). */
function criarProdutoRapido(nomeSugerido) {
  const nome = window.prompt('Nome do novo produto:', nomeSugerido || '');
  if (!nome || !nome.trim()) return null;

  const minimoTexto = window.prompt(`Estoque mínimo para "${nome.trim()}":`, '0');
  const estoqueMinimo = paraNumero(minimoTexto) || 0;

  const novoProduto = {
    id: crypto.randomUUID(),
    nome: nome.trim(),
    estoqueAtual: 0,
    estoqueMinimo,
    estoqueInicial: 0,
    comprasNotas: 0,
  };

  produtos.push(novoProduto);
  salvarProdutos(produtos);
  renderizarCadastro();
  return novoProduto.id;
}

function renderizarCadastro() {
  tabelaCadastro.innerHTML = '';
  cadastroVazio.classList.toggle('hidden', produtos.length > 0);

  produtos.forEach((produto) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(produto.nome)}</td>
      <td class="py-2 pr-2">${formatarNumero(produto.estoqueAtual)}</td>
      <td class="py-2 pr-2">${formatarNumero(produto.estoqueMinimo)}</td>
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
        <p class="text-xs text-gray-400">Mínimo: ${formatarNumero(produto.estoqueMinimo)}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-decrementar w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold" data-id="${produto.id}">−</button>
        <input type="text" inputmode="decimal" value="${formatarNumero(produto.estoqueAtual)}"
          data-id="${produto.id}" class="input-contagem w-20 text-center rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        <button class="btn-incrementar w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold" data-id="${produto.id}">+</button>
      </div>
    `;
    listaContagem.appendChild(linha);
  });

  listaContagem.querySelectorAll('.input-contagem').forEach((input) => {
    input.addEventListener('change', () => atualizarEstoqueAtual(input.dataset.id, paraNumero(input.value)));
    selecionarConteudoAoFocar(input);
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
  if (!produto || Number.isNaN(novoValor) || novoValor < 0) {
    mostrarToast('Valor inválido. Use números como 4 ou 4,3.');
    renderizarContagem();
    return;
  }
  produto.estoqueAtual = arredondar2(novoValor);
  salvarProdutos(produtos);
  mostrarToast(`${produto.nome} atualizado.`);
}

function ajustarEstoqueAtual(id, delta) {
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return;
  produto.estoqueAtual = arredondar2(Math.max(0, produto.estoqueAtual + delta));
  salvarProdutos(produtos);
  renderizarContagem();
}

// ===================== Entrada de Estoque por Notas (OCR) =====================
const dropzone = document.getElementById('dropzone');
const inputArquivoNota = document.getElementById('input-arquivo-nota');
const nomeArquivoEl = document.getElementById('nome-arquivo-selecionado');
const btnProcessarNota = document.getElementById('btn-processar-nota');
const secaoRevisaoOcr = document.getElementById('secao-revisao-ocr');
const tabelaRevisaoOcr = document.getElementById('tabela-revisao-ocr');
const textoOcrBrutoEl = document.getElementById('texto-ocr-bruto');
const ocrProgressoContainer = document.getElementById('ocr-progresso-container');
const ocrProgressoBarra = document.getElementById('ocr-progresso-barra');
const ocrProgressoTexto = document.getElementById('ocr-progresso-texto');

let arquivoSelecionado = null;
let itensExtraidos = []; // { descricao, quantidade, produtoId }

dropzone.addEventListener('click', () => inputArquivoNota.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) definirArquivoSelecionado(e.dataTransfer.files[0]);
});
inputArquivoNota.addEventListener('change', () => {
  if (inputArquivoNota.files.length) definirArquivoSelecionado(inputArquivoNota.files[0]);
});

function definirArquivoSelecionado(arquivo) {
  const tiposAceitos = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  if (!tiposAceitos.includes(arquivo.type)) {
    mostrarToast('Formato não suportado. Envie uma imagem (PNG/JPG) ou PDF.');
    return;
  }
  arquivoSelecionado = arquivo;
  nomeArquivoEl.textContent = `Selecionado: ${arquivo.name}`;
  nomeArquivoEl.classList.remove('hidden');
  btnProcessarNota.disabled = false;
}

btnProcessarNota.addEventListener('click', processarArquivoOCR);

/**
 * Executa OCR sobre o arquivo selecionado (imagem via Tesseract.js; PDF renderizado
 * para canvas com pdf.js antes do OCR) e tenta extrair itens + quantidades.
 * Isso roda inteiramente no navegador, sem enviar a nota para nenhum servidor.
 */
async function processarArquivoOCR() {
  if (!arquivoSelecionado) return;

  if (typeof Tesseract === 'undefined') {
    mostrarToast('Biblioteca de OCR não carregada. Verifique sua conexão com a internet.');
    return;
  }

  mostrarProgressoOCR(true);

  try {
    let fonteImagem = arquivoSelecionado;

    if (arquivoSelecionado.type === 'application/pdf') {
      fonteImagem = await renderizarPrimeiraPaginaPDF(arquivoSelecionado);
    }

    const resultado = await Tesseract.recognize(fonteImagem, 'por', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          atualizarProgressoOCR(Math.round(m.progress * 100));
        }
      },
    });

    const textoExtraido = resultado.data.text || '';
    textoOcrBrutoEl.textContent = textoExtraido;

    itensExtraidos = parsearItensDoTexto(textoExtraido).map((item) => ({
      descricao: item.descricao,
      quantidade: item.quantidade,
      produtoId: encontrarProdutoCorrespondente(item.descricao),
    }));

    if (itensExtraidos.length === 0) {
      mostrarToast('Nenhum item identificado automaticamente. Adicione manualmente abaixo.');
    } else {
      mostrarToast(`${itensExtraidos.length} item(ns) identificado(s). Confira antes de confirmar.`);
    }

    renderizarRevisaoOCR();
  } catch (erro) {
    console.error(erro);
    mostrarToast('Erro ao processar o arquivo. Tente novamente ou adicione os itens manualmente.');
  } finally {
    mostrarProgressoOCR(false);
  }
}

/** Renderiza a 1ª página de um PDF em um <canvas>, usado como entrada para o OCR. */
async function renderizarPrimeiraPaginaPDF(arquivo) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js não carregado');
  }
  const bufferArray = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bufferArray }).promise;
  const pagina = await pdf.getPage(1);
  const viewport = pagina.getViewport({ scale: 2 });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const contexto = canvas.getContext('2d');

  await pagina.render({ canvasContext: contexto, viewport }).promise;
  return canvas;
}

function mostrarProgressoOCR(mostrar) {
  ocrProgressoContainer.classList.toggle('hidden', !mostrar);
  btnProcessarNota.disabled = mostrar;
  if (mostrar) atualizarProgressoOCR(0);
}

function atualizarProgressoOCR(percentual) {
  ocrProgressoBarra.style.width = `${percentual}%`;
  ocrProgressoTexto.textContent = `${percentual}%`;
}

/**
 * Heurística básica para reconhecer linhas de cupom fiscal no formato
 * "QTD UN DESCRIÇÃO" ou "DESCRIÇÃO ... QTD UN". Cupons variam muito de layout,
 * por isso o resultado deve sempre ser conferido na tela de revisão.
 */
function parsearItensDoTexto(texto) {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const ignorarLinha = /^(cnpj|cpf|total|subtotal|troco|desconto|forma de pagamento|cupom fiscal|extrato|qtde total|valor|data|hora|item\s)/i;
  // Linha com código do item na frente, ex: "001 2 UN ARROZ TIO JOAO 5KG   25,00   50,00"
  const padraoComCodigo = /^\d+\s+(\d+(?:[.,]\d+)?)\s*(?:un|und|unid|x|cx|pc|kg|lt)\b\.?\s*(.+)/i;
  // Ex: "2 UN ARROZ TIO JOAO 5KG"
  const padraoQtdAntes = /^(\d+(?:[.,]\d+)?)\s*(?:un|und|unid|x|cx|pc|kg|lt)\b\.?\s+(.{3,60})/i;
  // Ex: "ARROZ TIO JOAO 5KG   3 UN"
  const padraoQtdDepois = /^(.{3,60}?)\s+(\d+(?:[.,]\d+)?)\s*(?:un|und|unid|x|cx|pc|kg|lt)\b/i;

  const itens = [];

  linhas.forEach((linha) => {
    if (ignorarLinha.test(linha)) return;

    let match = linha.match(padraoComCodigo);
    if (match) {
      itens.push({ quantidade: normalizarNumero(match[1]), descricao: limparDescricao(match[2]) });
      return;
    }

    match = linha.match(padraoQtdAntes);
    if (match) {
      itens.push({ quantidade: normalizarNumero(match[1]), descricao: limparDescricao(match[2]) });
      return;
    }

    match = linha.match(padraoQtdDepois);
    if (match) {
      itens.push({ quantidade: normalizarNumero(match[2]), descricao: limparDescricao(match[1]) });
    }
  });

  return itens.filter((item) => item.quantidade > 0 && item.descricao.length > 0);
}

function normalizarNumero(str) {
  return parseFloat(String(str).replace(',', '.')) || 0;
}

function limparDescricao(str) {
  return str
    .replace(/\d+[.,]\d{2}\b/g, '') // remove valores em R$, ex: 25,00
    .replace(/\d{6,}/g, '') // remove códigos de barras/produto longos
    .replace(/^\d+\s+/, '') // remove código de item residual no início
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizarTexto(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tenta casar a descrição lida pelo OCR com um produto já cadastrado, por sobreposição de palavras. */
function encontrarProdutoCorrespondente(descricao) {
  const alvoTokens = normalizarTexto(descricao)
    .split(' ')
    .filter((t) => t.length > 2);
  if (alvoTokens.length === 0) return null;

  let melhorId = null;
  let melhorPontuacao = 0;

  produtos.forEach((produto) => {
    const nomeTokens = normalizarTexto(produto.nome)
      .split(' ')
      .filter((t) => t.length > 2);
    if (nomeTokens.length === 0) return;

    const coincidencias = nomeTokens.filter((t) => alvoTokens.includes(t)).length;
    const pontuacao = coincidencias / nomeTokens.length;

    if (pontuacao > melhorPontuacao && pontuacao >= 0.5) {
      melhorPontuacao = pontuacao;
      melhorId = produto.id;
    }
  });

  return melhorId;
}

document.getElementById('btn-adicionar-item-manual').addEventListener('click', () => {
  itensExtraidos.push({ descricao: '', quantidade: 1, produtoId: null });
  renderizarRevisaoOCR();
});

function renderizarRevisaoOCR() {
  tabelaRevisaoOcr.innerHTML = '';
  secaoRevisaoOcr.classList.toggle('hidden', itensExtraidos.length === 0);

  itensExtraidos.forEach((item, index) => {
    const opcoesProdutos = produtos
      .map((p) => `<option value="${p.id}" ${p.id === item.produtoId ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`)
      .join('');

    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0 align-top';
    tr.innerHTML = `
      <td class="py-2 pr-2">${escapeHtml(item.descricao || '(descrição vazia)')}</td>
      <td class="py-2 pr-2">
        <select data-index="${index}" class="select-produto-ocr rounded-lg border-gray-300 border px-2 py-1 text-sm max-w-[200px]">
          <option value="">-- Não mapear --</option>
          ${opcoesProdutos}
          <option value="__novo__">+ Cadastrar novo produto</option>
        </select>
      </td>
      <td class="py-2 pr-2">
        <input type="text" inputmode="decimal" value="${formatarNumero(item.quantidade)}" data-index="${index}"
          class="input-quantidade-ocr w-24 rounded-lg border-gray-300 border px-2 py-1 text-sm" />
      </td>
      <td class="py-2 pr-2 text-right">
        <button data-index="${index}" class="btn-remover-item-ocr text-red-500 hover:text-red-700 text-xs font-medium">Remover</button>
      </td>
    `;
    tabelaRevisaoOcr.appendChild(tr);
  });

  tabelaRevisaoOcr.querySelectorAll('.select-produto-ocr').forEach((select) => {
    select.addEventListener('change', () => {
      const idx = Number(select.dataset.index);
      if (select.value === '__novo__') {
        const novoId = criarProdutoRapido(itensExtraidos[idx].descricao);
        itensExtraidos[idx].produtoId = novoId;
        renderizarRevisaoOCR();
        return;
      }
      itensExtraidos[idx].produtoId = select.value || null;
    });
  });

  tabelaRevisaoOcr.querySelectorAll('.input-quantidade-ocr').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.index);
      itensExtraidos[idx].quantidade = paraNumero(input.value) || 0;
    });
    selecionarConteudoAoFocar(input);
  });

  tabelaRevisaoOcr.querySelectorAll('.btn-remover-item-ocr').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      itensExtraidos.splice(idx, 1);
      renderizarRevisaoOCR();
    });
  });
}

document.getElementById('btn-confirmar-entrada').addEventListener('click', confirmarEntradaEstoque);

/** Soma as quantidades confirmadas ao Estoque Atual e registra a compra para o relatório de consumo. */
function confirmarEntradaEstoque() {
  const itensValidos = itensExtraidos.filter((item) => item.produtoId && item.quantidade > 0);

  if (itensValidos.length === 0) {
    mostrarToast('Selecione um produto e uma quantidade válida para pelo menos um item.');
    return;
  }

  const itensParaHistorico = [];

  itensValidos.forEach((item) => {
    const produto = produtos.find((p) => p.id === item.produtoId);
    if (!produto) return;
    produto.estoqueAtual = arredondar2(produto.estoqueAtual + item.quantidade);
    produto.comprasNotas = arredondar2((produto.comprasNotas || 0) + item.quantidade);
    itensParaHistorico.push({ produtoId: produto.id, nome: produto.nome, quantidade: item.quantidade });
  });

  salvarProdutos(produtos);

  notas.unshift({
    id: crypto.randomUUID(),
    data: new Date().toISOString(),
    arquivoNome: arquivoSelecionado ? arquivoSelecionado.name : 'Entrada manual',
    itens: itensParaHistorico,
  });
  salvarNotas(notas);

  mostrarToast(`Estoque atualizado com ${itensParaHistorico.length} item(ns)!`);

  itensExtraidos = [];
  arquivoSelecionado = null;
  inputArquivoNota.value = '';
  nomeArquivoEl.classList.add('hidden');
  btnProcessarNota.disabled = true;
  textoOcrBrutoEl.textContent = '';

  renderizarRevisaoOCR();
  renderizarCadastro();
  renderizarContagem();
  renderizarHistoricoNotas();
}

function renderizarHistoricoNotas() {
  const corpo = document.getElementById('tabela-historico-notas');
  const vazio = document.getElementById('historico-notas-vazio');
  corpo.innerHTML = '';
  vazio.classList.toggle('hidden', notas.length > 0);

  notas.slice(0, 10).forEach((nota) => {
    const totalUnidades = nota.itens.reduce((soma, i) => soma + i.quantidade, 0);
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2">${new Date(nota.data).toLocaleString('pt-BR')}</td>
      <td class="py-2 pr-2">${escapeHtml(nota.arquivoNome)}</td>
      <td class="py-2 pr-2">${nota.itens.length}</td>
      <td class="py-2 pr-2">${formatarNumero(totalUnidades)}</td>
    `;
    corpo.appendChild(tr);
  });
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
      comprar: arredondar2(p.estoqueMinimo - p.estoqueAtual),
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
      <td class="py-2 pr-2">${formatarNumero(item.estoqueAtual)}</td>
      <td class="py-2 pr-2">${formatarNumero(item.estoqueMinimo)}</td>
      <td class="py-2 pr-2 font-semibold text-red-600">${formatarNumero(item.comprar)}</td>
    `;
    tabelaListaCompras.appendChild(tr);
  });
}

function montarTextoListaCompras() {
  if (ultimaListaCompras.length === 0) return '';
  const linhas = ultimaListaCompras.map(
    (item) => `- ${item.nome}: ${formatarNumero(item.comprar)} un. (atual: ${formatarNumero(item.estoqueAtual)} / mínimo: ${formatarNumero(item.estoqueMinimo)})`
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

// ===================== Relatório de Consumo =====================
document.getElementById('btn-novo-periodo').addEventListener('click', () => {
  const confirmar = confirm(
    'Iniciar um novo período redefine a base de cálculo do consumo: o Estoque Inicial passa a ser o Estoque ' +
    'Atual de hoje e as Compras (Notas) são zeradas. Deseja continuar?'
  );
  if (!confirmar) return;

  produtos.forEach((produto) => {
    produto.estoqueInicial = produto.estoqueAtual;
    produto.comprasNotas = 0;
  });
  salvarProdutos(produtos);

  periodo = { inicio: new Date().toISOString() };
  salvarPeriodo(periodo);

  renderizarRelatorio();
  mostrarToast('Novo período iniciado!');
});

function renderizarRelatorio() {
  document.getElementById('periodo-inicio').textContent = new Date(periodo.inicio).toLocaleDateString('pt-BR');

  const corpo = document.getElementById('tabela-relatorio');
  const vazio = document.getElementById('relatorio-vazio');
  corpo.innerHTML = '';
  vazio.classList.toggle('hidden', produtos.length > 0);

  const linhas = produtos
    .map((p) => ({
      ...p,
      consumo: arredondar2((p.estoqueInicial || 0) + (p.comprasNotas || 0) - p.estoqueAtual),
    }))
    .sort((a, b) => b.consumo - a.consumo);

  const maiorConsumo = Math.max(1, ...linhas.map((l) => Math.abs(l.consumo)));

  linhas.forEach((item) => {
    const larguraBarra = Math.round((Math.abs(item.consumo) / maiorConsumo) * 100);
    const corBarra = item.consumo >= 0 ? 'bg-red-400' : 'bg-emerald-400';
    const corTexto = item.consumo >= 0 ? 'text-red-600' : 'text-emerald-600';

    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(item.nome)}</td>
      <td class="py-2 pr-2">${formatarNumero(item.estoqueInicial || 0)}</td>
      <td class="py-2 pr-2">${formatarNumero(item.comprasNotas || 0)}</td>
      <td class="py-2 pr-2">${formatarNumero(item.estoqueAtual)}</td>
      <td class="py-2 pr-2">
        <div class="flex items-center gap-2">
          <span class="font-semibold ${corTexto} w-10 shrink-0">${formatarNumero(item.consumo)}</span>
          <div class="flex-1 bg-gray-100 rounded h-2 min-w-[60px]">
            <div class="${corBarra} h-2 rounded" style="width:${larguraBarra}%"></div>
          </div>
        </div>
      </td>
    `;
    corpo.appendChild(tr);
  });
}

// ===================== Utilitário =====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Converte texto digitado pelo usuário (aceita vírgula ou ponto como separador decimal) em número. */
function paraNumero(valor) {
  if (typeof valor === 'number') return valor;
  const numero = parseFloat(String(valor).trim().replace(',', '.'));
  return numero;
}

/** Evita erros de ponto flutuante (ex: 0.1 + 0.2) arredondando para 2 casas decimais. */
function arredondar2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Formata um número para exibição no padrão brasileiro (vírgula decimal), ex: 4.3 -> "4,3". */
function formatarNumero(valor) {
  return arredondar2(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Seleciona todo o conteúdo do campo ao focar, para digitar por cima sem precisar apagar antes (útil no celular). */
function selecionarConteudoAoFocar(input) {
  input.addEventListener('focus', () => input.select());
}

// ===================== Inicialização =====================
renderizarCadastro();
renderizarContagem();
renderizarHistoricoNotas();
renderizarRelatorio();
