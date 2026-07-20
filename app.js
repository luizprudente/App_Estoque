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

  if (nomeAba === 'cadastro') renderizarCadastro();
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

let produtoEmEdicaoId = null;

function renderizarCadastro() {
  tabelaCadastro.innerHTML = '';
  cadastroVazio.classList.toggle('hidden', produtos.length > 0);

  produtos.forEach((produto) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';

    if (produto.id === produtoEmEdicaoId) {
      tr.innerHTML = `
        <td class="py-2 pr-2">
          <input type="text" value="${escapeHtml(produto.nome)}" data-campo="nome"
            class="input-edicao-cadastro w-full rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2">
          <input type="text" inputmode="decimal" value="${formatarNumero(produto.estoqueAtual)}" data-campo="atual"
            class="input-edicao-cadastro w-24 rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2">
          <input type="text" inputmode="decimal" value="${formatarNumero(produto.estoqueMinimo)}" data-campo="minimo"
            class="input-edicao-cadastro w-24 rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2 text-right whitespace-nowrap">
          <button class="text-green-600 hover:text-green-800 text-xs font-medium mr-2" data-salvar="${produto.id}">Salvar</button>
          <button class="text-gray-500 hover:text-gray-700 text-xs font-medium" data-cancelar>Cancelar</button>
        </td>
      `;
      tabelaCadastro.appendChild(tr);
      return;
    }

    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(produto.nome)}</td>
      <td class="py-2 pr-2">${formatarNumero(produto.estoqueAtual)}</td>
      <td class="py-2 pr-2">${formatarNumero(produto.estoqueMinimo)}</td>
      <td class="py-2 pr-2 text-right whitespace-nowrap">
        <button class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2" data-editar="${produto.id}">
          Editar
        </button>
        <button class="text-red-500 hover:text-red-700 text-xs font-medium" data-excluir="${produto.id}">
          Excluir
        </button>
      </td>
    `;
    tabelaCadastro.appendChild(tr);
  });

  tabelaCadastro.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      produtoEmEdicaoId = btn.dataset.editar;
      renderizarCadastro();
    });
  });

  tabelaCadastro.querySelectorAll('[data-cancelar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      produtoEmEdicaoId = null;
      renderizarCadastro();
    });
  });

  tabelaCadastro.querySelectorAll('[data-salvar]').forEach((btn) => {
    btn.addEventListener('click', () => salvarEdicaoProduto(btn.dataset.salvar));
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

function salvarEdicaoProduto(id) {
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return;

  const linha = tabelaCadastro.querySelector(`[data-salvar="${id}"]`).closest('tr');
  const nome = linha.querySelector('[data-campo="nome"]').value.trim();
  const estoqueAtual = paraNumero(linha.querySelector('[data-campo="atual"]').value);
  const estoqueMinimo = paraNumero(linha.querySelector('[data-campo="minimo"]').value);

  if (!nome || Number.isNaN(estoqueAtual) || Number.isNaN(estoqueMinimo) || estoqueAtual < 0 || estoqueMinimo < 0) {
    mostrarToast('Preencha o nome e valores válidos (ex: 4 ou 4,3).');
    return;
  }

  produto.nome = nome;
  produto.estoqueAtual = arredondar2(estoqueAtual);
  produto.estoqueMinimo = arredondar2(estoqueMinimo);

  salvarProdutos(produtos);
  produtoEmEdicaoId = null;
  renderizarCadastro();
  renderizarContagem();
  mostrarToast('Produto atualizado!');
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
  renderizarCadastro();
  mostrarToast(`${produto.nome} atualizado.`);
}

function ajustarEstoqueAtual(id, delta) {
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return;
  produto.estoqueAtual = arredondar2(Math.max(0, produto.estoqueAtual + delta));
  salvarProdutos(produtos);
  renderizarContagem();
  renderizarCadastro();
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
const ocrProgressoMensagem = document.getElementById('ocr-progresso-mensagem');
const linkModeloPlanilha = document.getElementById('link-modelo-planilha');

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

const TIPOS_IMAGEM_PDF = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const TIPOS_PLANILHA = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const EXTENSOES_PLANILHA = ['.csv', '.xlsx', '.xls'];

function ehArquivoPlanilha(arquivo) {
  const nome = arquivo.name.toLowerCase();
  return TIPOS_PLANILHA.includes(arquivo.type) || EXTENSOES_PLANILHA.some((ext) => nome.endsWith(ext));
}

function definirArquivoSelecionado(arquivo) {
  if (!TIPOS_IMAGEM_PDF.includes(arquivo.type) && !ehArquivoPlanilha(arquivo)) {
    mostrarToast('Formato não suportado. Envie uma imagem (PNG/JPG), PDF ou planilha (XLSX/XLS/CSV).');
    return;
  }
  arquivoSelecionado = arquivo;
  nomeArquivoEl.textContent = `Selecionado: ${arquivo.name}`;
  nomeArquivoEl.classList.remove('hidden');
  btnProcessarNota.disabled = false;
}

btnProcessarNota.addEventListener('click', () => {
  if (!arquivoSelecionado) return;
  if (ehArquivoPlanilha(arquivoSelecionado)) {
    processarArquivoPlanilha(arquivoSelecionado);
  } else {
    processarArquivoOCR();
  }
});

if (linkModeloPlanilha) {
  linkModeloPlanilha.addEventListener('click', (e) => {
    e.preventDefault();
    const conteudo = 'Produto,Quantidade\nArroz 5kg,10\nFeijao 1kg,5\n';
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-lista-compras.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

const MAX_PAGINAS_PDF = 5; // limite de seguranca p/ nao travar o navegador em PDFs muito longos

/**
 * Executa OCR sobre o arquivo selecionado (imagem via Tesseract.js; PDF com todas as
 * páginas — até MAX_PAGINAS_PDF — renderizadas para canvas com pdf.js antes do OCR)
 * e tenta extrair itens + quantidades. Roda inteiramente no navegador, sem enviar a
 * nota para nenhum servidor. Cada imagem passa por um pré-processamento (escala de
 * cinza + contraste) que reduz bastante os erros de leitura em fotos de cupom.
 */
async function processarArquivoOCR() {
  if (!arquivoSelecionado) return;

  if (typeof Tesseract === 'undefined') {
    mostrarToast('Biblioteca de OCR não carregada. Verifique sua conexão com a internet.');
    return;
  }

  mostrarProgressoOCR(true, 'Lendo nota, aguarde…');

  try {
    const fontesImagem =
      arquivoSelecionado.type === 'application/pdf'
        ? await renderizarPaginasPDF(arquivoSelecionado)
        : [arquivoSelecionado];

    let textoCompleto = '';

    for (let i = 0; i < fontesImagem.length; i++) {
      const imagemPreparada = await prepararImagemParaOCR(fontesImagem[i]).catch(() => fontesImagem[i]);

      const resultado = await Tesseract.recognize(imagemPreparada, 'por', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            atualizarProgressoOCR(Math.round(((i + m.progress) / fontesImagem.length) * 100));
          }
        },
      });

      textoCompleto += (textoCompleto ? '\n' : '') + (resultado.data.text || '');
    }

    textoOcrBrutoEl.textContent = textoCompleto;

    itensExtraidos = parsearItensDoTexto(textoCompleto).map((item) => ({
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

/** Renderiza cada página de um PDF (até MAX_PAGINAS_PDF) em um <canvas>, usado como entrada para o OCR. */
async function renderizarPaginasPDF(arquivo) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js não carregado');
  }
  const bufferArray = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bufferArray }).promise;
  const totalPaginas = Math.min(pdf.numPages, MAX_PAGINAS_PDF);
  const canvases = [];

  for (let i = 1; i <= totalPaginas; i++) {
    const pagina = await pdf.getPage(i);
    const viewport = pagina.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const contexto = canvas.getContext('2d');

    await pagina.render({ canvasContext: contexto, viewport }).promise;
    canvases.push(canvas);
  }

  return canvases;
}

/**
 * Converte a imagem para escala de cinza e aumenta o contraste antes do OCR.
 * Fotos de cupom (papel térmico, iluminação ruim) ganham bastante precisão com isso.
 * Também amplia imagens pequenas, já que o Tesseract lê melhor em resolução maior.
 */
async function prepararImagemParaOCR(fonte) {
  const bitmap = await createImageBitmap(fonte);
  const larguraMinima = 1600;
  const escala = bitmap.width < larguraMinima ? Math.min(3, larguraMinima / bitmap.width) : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = dados.data;
  const contraste = 1.6;

  for (let i = 0; i < pixels.length; i += 4) {
    const cinza = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const valor = Math.max(0, Math.min(255, (cinza - 128) * contraste + 128));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = valor;
  }

  ctx.putImageData(dados, 0, 0);
  return canvas;
}

function mostrarProgressoOCR(mostrar, mensagem) {
  ocrProgressoContainer.classList.toggle('hidden', !mostrar);
  btnProcessarNota.disabled = mostrar;
  if (mostrar) {
    atualizarProgressoOCR(0);
    if (mensagem) ocrProgressoMensagem.textContent = mensagem;
  }
}

function atualizarProgressoOCR(percentual) {
  ocrProgressoBarra.style.width = `${percentual}%`;
  ocrProgressoTexto.textContent = `${percentual}%`;
}

/**
 * Lê uma planilha (.xlsx, .xls ou .csv — inclusive exportada do Google Sheets) usando
 * SheetJS e extrai itens do mesmo jeito que a leitura de cupom: produto + quantidade,
 * prontos para a mesma tela de revisão antes de somar ao estoque.
 */
async function processarArquivoPlanilha(arquivo) {
  if (typeof XLSX === 'undefined') {
    mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.');
    return;
  }

  mostrarProgressoOCR(true, 'Lendo planilha, aguarde…');

  try {
    const bufferArray = await arquivo.arrayBuffer();
    const pasta = XLSX.read(bufferArray, { type: 'array' });
    const planilha = pasta.Sheets[pasta.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: '' });

    const { colProduto, colQuantidade, linhaInicial } = detectarColunasPlanilha(linhas);

    itensExtraidos = linhas
      .slice(linhaInicial)
      .map((linha) => ({
        descricao: String(linha[colProduto] ?? '').trim(),
        quantidade: paraNumero(linha[colQuantidade]) || 0,
      }))
      .filter((item) => item.descricao && item.quantidade > 0)
      .map((item) => ({ ...item, produtoId: encontrarProdutoCorrespondente(item.descricao) }));

    const totalLinhasLidas = Math.max(0, linhas.length - linhaInicial);
    textoOcrBrutoEl.textContent =
      `Planilha "${arquivo.name}": ${itensExtraidos.length} item(ns) reconhecido(s) de ${totalLinhasLidas} linha(s) lida(s).\n` +
      `Coluna do produto: ${colProduto + 1}ª · Coluna da quantidade: ${colQuantidade + 1}ª` +
      (linhaInicial > 0 ? ' · 1ª linha tratada como cabeçalho' : '');

    if (itensExtraidos.length === 0) {
      mostrarToast('Nenhuma linha válida encontrada. Confira as colunas de Produto e Quantidade na planilha.');
    } else {
      mostrarToast(`${itensExtraidos.length} item(ns) lido(s) da planilha. Confira antes de confirmar.`);
    }

    renderizarRevisaoOCR();
  } catch (erro) {
    console.error(erro);
    mostrarToast('Erro ao ler a planilha. Verifique se o arquivo é um .xlsx, .xls ou .csv válido.');
  } finally {
    mostrarProgressoOCR(false);
  }
}

/**
 * Descobre em quais colunas estão o produto e a quantidade, procurando um cabeçalho
 * reconhecível nas 3 primeiras linhas (ex: "Produto"/"Item" e "Quantidade"/"Qtd").
 * Se não achar cabeçalho, assume produto na 1ª coluna e quantidade na 2ª, pulando a
 * primeira linha apenas se ela não parecer conter um número (sinal de que é cabeçalho).
 */
function detectarColunasPlanilha(linhas) {
  const palavrasProduto = ['produto', 'item', 'descricao', 'nome', 'mercadoria'];
  const palavrasQuantidade = ['quantidade', 'qtd', 'qtde', 'quant', 'comprar', 'unidades'];

  for (let i = 0; i < Math.min(3, linhas.length); i++) {
    const linha = (linhas[i] || []).map((celula) => normalizarTexto(String(celula ?? '')));
    const colProduto = linha.findIndex((c) => palavrasProduto.some((p) => c.includes(p)));
    const colQuantidade = linha.findIndex((c) => palavrasQuantidade.some((p) => c.includes(p)));
    if (colProduto !== -1 && colQuantidade !== -1) {
      return { colProduto, colQuantidade, linhaInicial: i + 1 };
    }
  }

  const primeiraLinha = linhas[0] || [];
  const segundaCelulaEhNumero = !Number.isNaN(paraNumero(primeiraLinha[1])) && primeiraLinha[1] !== '' && primeiraLinha[1] !== undefined;
  return { colProduto: 0, colQuantidade: 1, linhaInicial: segundaCelulaEhNumero ? 0 : 1 };
}

// Palavras/trechos de linhas de cabeçalho, totais e rodapé que nunca são um item comprado.
// Não é ancorado ao início da linha de propósito: ruído do OCR (aspas tipográficas, barras
// verticais de coluna, etc.) costuma sobrar antes da palavra-chave, o que quebraria um "^".
const ignorarLinha =
  /(cnpj|cpf|\bie\b|total|subtotal|troco|desconto|forma de pagamento|cupom fiscal|documento auxiliar|nota fiscal|consumidor|endere[cç]o|telefone|item\s*.{0,3}cod|valor a pagar|valor total|valor pago|qtd\.?\s*total|autoriza|via cliente|bandeira|parcela|tributos|incidentes|lei federal|estadual|ibpt|fonte|consulte|chave de acesso|card\s|rede:|loja|pdv|seq[:=]|nfc-e|protocolo)/i;

/**
 * Heurística básica para reconhecer itens de cupom fiscal. Tenta duas estratégias:
 *
 * 1) Item em DUAS linhas (padrão da Nota Fiscal de Consumidor Eletrônica — NFC-e —
 *    usado pela grande maioria dos supermercados/varejo no Brasil): a descrição fica
 *    numa linha e a quantidade em uma linha própria logo abaixo, ex:
 *      "002 7896030521362 REQ TIROLEZ 1,5kg"
 *      "2,000 Un x 48,49          96,98"
 *
 * 2) Item em UMA linha só (formato mais simples, ex: "2 UN ARROZ 5KG" ou
 *    "ARROZ 5KG   2 UN"), usado como reforço para o que sobrar.
 *
 * Cupons variam muito de layout e o OCR erra caracteres, então o resultado deve
 * sempre ser conferido na tela de revisão antes de confirmar a entrada no estoque.
 */
function parsearItensDoTexto(texto) {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const usada = new Array(linhas.length).fill(false);
  const itens = [];

  // Linha "só quantidade", ex: "4,014 Kg x 45,90 184,24" ou "2,000 Un «x 48,49 96,98"
  // (o "«" e afins são ruído comum do OCR antes do "x"). Aceita até ~15 caracteres de
  // ruído antes do número (código de barras cortado, barras de coluna, etc.).
  const padraoLinhaQtd = /^.{0,15}?(\d{1,3}[.,]\d{2,3})\s*([A-Za-zÀ-ÿ]{1,4})/;

  // Passo 1: item em duas linhas — descrição na linha anterior + quantidade na linha seguinte.
  linhas.forEach((linha, i) => {
    if (i === 0 || usada[i] || ignorarLinha.test(linha)) return;

    const matchQtd = linha.match(padraoLinhaQtd);
    if (!matchQtd) return;

    const linhaAnterior = linhas[i - 1];
    if (usada[i - 1] || ignorarLinha.test(linhaAnterior)) return;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(linhaAnterior)) return; // precisa ter texto, não só números

    itens.push({ quantidade: normalizarNumero(matchQtd[1]), descricao: limparDescricao(linhaAnterior) });
    usada[i - 1] = true;
    usada[i] = true;
  });

  // Linha com código do item na frente, ex: "001 2 UN ARROZ TIO JOAO 5KG   25,00   50,00"
  const padraoComCodigo = /^\d+\s+(\d+(?:[.,]\d+)?)\s*(?:un|und|unid|x|cx|pc|kg|lt)\b\.?\s*(.+)/i;
  // Ex: "2 UN ARROZ TIO JOAO 5KG"
  const padraoQtdAntes = /^(\d+(?:[.,]\d+)?)\s*(?:un|und|unid|x|cx|pc|kg|lt)\b\.?\s+(.{3,60})/i;
  // Ex: "ARROZ TIO JOAO 5KG   3 UN"
  const padraoQtdDepois = /^(.{3,60}?)\s+(\d+(?:[.,]\d+)?)\s*(?:un|und|unid|x|cx|pc|kg|lt)\b/i;

  // Passo 2: linhas que sobraram (não usadas no passo 1), tenta os padrões de linha única.
  linhas.forEach((linha, i) => {
    if (usada[i] || ignorarLinha.test(linha)) return;

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
    .replace(/^[|[\]"'“”.\s]*\d+(?:\s+\d+)?\s+/, '') // remove código do item + código de barras/interno no início
    .replace(/\d+[.,]\d{2}\b/g, '') // remove valores em R$, ex: 25,00
    .replace(/\d{6,}/g, '') // remove códigos de barras/produto longos residuais
    .replace(/[|[\]"'“”]/g, ' ') // remove ruído de OCR (colunas, aspas tipográficas)
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
