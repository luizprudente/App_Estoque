// ===================== Chaves de Persistência =====================
const PRODUTOS_KEY = 'estoque_produtos';
const NOTAS_KEY = 'estoque_notas';
const PERIODO_KEY = 'estoque_periodo';
const FORNECEDORES_KEY = 'estoque_fornecedores';

/**
 * @typedef {{ id: string, nome: string, estoqueAtual: number, estoqueMinimo: number,
 *   estoqueInicial: number, comprasNotas: number, fornecedorIds: string[], marcas: string[] }} Produto
 * @typedef {{ id: string, data: string, arquivoNome: string,
 *   itens: { produtoId: string, nome: string, quantidade: number }[] }} Nota
 * @typedef {{ id: string, nome: string, contato: string, observacao: string }} Fornecedor
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
    if (!Array.isArray(p.fornecedorIds)) {
      p.fornecedorIds = [];
      alterado = true;
    }
    if (!Array.isArray(p.marcas)) {
      p.marcas = [];
      alterado = true;
    }
  });
  if (alterado) salvarProdutos(lista);
  return lista;
}

function salvarProdutos(lista) {
  localStorage.setItem(PRODUTOS_KEY, JSON.stringify(lista));
}

function carregarFornecedores() {
  try {
    const dados = localStorage.getItem(FORNECEDORES_KEY);
    return dados ? JSON.parse(dados) : [];
  } catch {
    return [];
  }
}

function salvarFornecedores(lista) {
  localStorage.setItem(FORNECEDORES_KEY, JSON.stringify(lista));
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
let fornecedores = carregarFornecedores();
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
  if (nomeAba === 'fornecedores') renderizarFornecedores();
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
const checklistFornecedoresNovoProduto = document.getElementById('checklist-fornecedores-novo-produto');
const inputMarcas = document.getElementById('input-marcas');
const datalistMarcas = document.getElementById('lista-marcas-conhecidas');

selecionarConteudoAoFocar(inputAtual);
selecionarConteudoAoFocar(inputMinimo);

/** Converte "Marca A, Marca B" em ['Marca A', 'Marca B'], sem duplicatas nem vazios. */
function parseMarcas(valor) {
  const marcas = String(valor || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set(marcas)];
}

/** Atualiza as sugestões de autocomplete com todas as marcas já usadas em algum produto. */
function atualizarDatalistMarcas() {
  if (!datalistMarcas) return;
  const todasMarcas = new Set();
  produtos.forEach((p) => (p.marcas || []).forEach((m) => todasMarcas.add(m)));
  datalistMarcas.innerHTML = [...todasMarcas]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((m) => `<option value="${escapeHtml(m)}"></option>`)
    .join('');
}

/** Preenche um container com uma checkbox por fornecedor cadastrado. */
function renderizarChecklistFornecedores(container, idsSelecionados) {
  if (!container) return;
  if (fornecedores.length === 0) {
    container.innerHTML = '<p class="text-xs text-gray-400">Nenhum fornecedor cadastrado ainda. Cadastre na aba "Fornecedores".</p>';
    return;
  }
  container.innerHTML = fornecedores
    .map(
      (f) => `
      <label class="flex items-center gap-2 text-sm py-1">
        <input type="checkbox" value="${f.id}" class="checkbox-fornecedor" ${idsSelecionados.includes(f.id) ? 'checked' : ''} />
        <span>${escapeHtml(f.nome)}</span>
      </label>
    `
    )
    .join('');
}

function obterFornecedoresSelecionados(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('.checkbox-fornecedor:checked')).map((cb) => cb.value);
}

formProduto.addEventListener('submit', (e) => {
  e.preventDefault();

  const nome = inputNome.value.trim();
  const estoqueAtual = paraNumero(inputAtual.value);
  const estoqueMinimo = paraNumero(inputMinimo.value);

  if (!nome || Number.isNaN(estoqueAtual) || Number.isNaN(estoqueMinimo) || estoqueAtual < 0 || estoqueMinimo < 0) {
    mostrarToast('Preencha o nome e valores válidos (ex: 4 ou 4,3).');
    return;
  }

  const fornecedorIds = obterFornecedoresSelecionados(checklistFornecedoresNovoProduto);
  const marcas = parseMarcas(inputMarcas.value);

  produtos.push({
    id: crypto.randomUUID(),
    nome,
    estoqueAtual,
    estoqueMinimo,
    estoqueInicial: estoqueAtual,
    comprasNotas: 0,
    fornecedorIds,
    marcas,
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
    fornecedorIds: [],
    marcas: [],
  };

  produtos.push(novoProduto);
  salvarProdutos(produtos);
  renderizarCadastro();
  return novoProduto.id;
}

let produtoEmEdicaoId = null;

function renderizarCadastro() {
  renderizarChecklistFornecedores(checklistFornecedoresNovoProduto, []);
  atualizarDatalistMarcas();

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
        <td class="py-2 pr-2">
          <div id="checklist-edicao-fornecedores" class="border border-gray-200 rounded-lg p-2 max-h-24 overflow-y-auto max-w-[180px]"></div>
        </td>
        <td class="py-2 pr-2">
          <input type="text" list="lista-marcas-conhecidas" value="${escapeHtml((produto.marcas || []).join(', '))}" data-campo="marcas"
            placeholder="Marca A, Marca B"
            class="input-edicao-cadastro w-40 rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2 text-right whitespace-nowrap">
          <button class="text-green-600 hover:text-green-800 text-xs font-medium mr-2" data-salvar="${produto.id}">Salvar</button>
          <button class="text-gray-500 hover:text-gray-700 text-xs font-medium" data-cancelar>Cancelar</button>
        </td>
      `;
      tabelaCadastro.appendChild(tr);
      renderizarChecklistFornecedores(document.getElementById('checklist-edicao-fornecedores'), produto.fornecedorIds || []);
      return;
    }

    const nomesFornecedores = (produto.fornecedorIds || [])
      .map((id) => fornecedores.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => escapeHtml(f.nome))
      .join(', ');

    const marcasTexto = (produto.marcas || []).map(escapeHtml).join(', ');

    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(produto.nome)}</td>
      <td class="py-2 pr-2">${formatarNumero(produto.estoqueAtual)}</td>
      <td class="py-2 pr-2">${formatarNumero(produto.estoqueMinimo)}</td>
      <td class="py-2 pr-2 text-gray-500">${nomesFornecedores || '—'}</td>
      <td class="py-2 pr-2 text-gray-500">${marcasTexto || '—'}</td>
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
  produto.fornecedorIds = obterFornecedoresSelecionados(document.getElementById('checklist-edicao-fornecedores'));
  produto.marcas = parseMarcas(linha.querySelector('[data-campo="marcas"]').value);

  salvarProdutos(produtos);
  produtoEmEdicaoId = null;
  renderizarCadastro();
  renderizarContagem();
  mostrarToast('Produto atualizado!');
}

// ===================== Importar/Atualizar Produtos via Planilha =====================
// Diferente das planilhas de "Contagem" e "Entrada de Estoque" (que exigem produtos já
// cadastrados), esta CRIA produtos novos e ATUALIZA os existentes (casando pelo nome).
const dropzoneImportProdutos = document.getElementById('dropzone-import-produtos');
const inputArquivoImportProdutos = document.getElementById('input-arquivo-import-produtos');
const nomeArquivoImportProdutosEl = document.getElementById('nome-arquivo-import-produtos');
const btnProcessarImportProdutos = document.getElementById('btn-processar-import-produtos');
const secaoRevisaoImportProdutos = document.getElementById('secao-revisao-import-produtos');
const tabelaRevisaoImportProdutos = document.getElementById('tabela-revisao-import-produtos');
const linkModeloImportProdutos = document.getElementById('link-modelo-import-produtos');

let arquivoImportProdutosSelecionado = null;
let itensImportProdutos = []; // { nome, produtoExistenteId, estoqueAtual, estoqueMinimo, fornecedoresNomes, marcas }

dropzoneImportProdutos.addEventListener('click', () => inputArquivoImportProdutos.click());
dropzoneImportProdutos.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzoneImportProdutos.classList.add('dragover');
});
dropzoneImportProdutos.addEventListener('dragleave', () => dropzoneImportProdutos.classList.remove('dragover'));
dropzoneImportProdutos.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzoneImportProdutos.classList.remove('dragover');
  if (e.dataTransfer.files.length) definirArquivoImportProdutosSelecionado(e.dataTransfer.files[0]);
});
inputArquivoImportProdutos.addEventListener('change', () => {
  if (inputArquivoImportProdutos.files.length) definirArquivoImportProdutosSelecionado(inputArquivoImportProdutos.files[0]);
});

function definirArquivoImportProdutosSelecionado(arquivo) {
  if (!ehArquivoPlanilha(arquivo)) {
    mostrarToast('Formato não suportado. Envie uma planilha (XLSX/XLS/CSV).');
    return;
  }
  arquivoImportProdutosSelecionado = arquivo;
  nomeArquivoImportProdutosEl.textContent = `Selecionado: ${arquivo.name}`;
  nomeArquivoImportProdutosEl.classList.remove('hidden');
  btnProcessarImportProdutos.disabled = false;
}

btnProcessarImportProdutos.addEventListener('click', processarImportacaoProdutos);

async function processarImportacaoProdutos() {
  if (!arquivoImportProdutosSelecionado) return;

  if (typeof XLSX === 'undefined') {
    mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.');
    return;
  }

  btnProcessarImportProdutos.disabled = true;

  try {
    const bufferArray = await arquivoImportProdutosSelecionado.arrayBuffer();
    const pasta = XLSX.read(bufferArray, { type: 'array' });
    const planilha = selecionarAbaPlanilha(pasta, 'produto');
    const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: '' });

    if (linhas.length === 0) {
      mostrarToast('Planilha vazia.');
      return;
    }

    const cabecalho = linhas[0];
    const colNome = encontrarColuna(cabecalho, ['nome', 'produto', 'item', 'descricao']);
    const colAtual = encontrarColuna(cabecalho, ['estoque atual', 'atual']);
    const colMinimo = encontrarColuna(cabecalho, ['estoque minimo', 'minimo']);
    const colFornecedores = encontrarColuna(cabecalho, ['fornecedor']);
    const colMarcas = encontrarColuna(cabecalho, ['marca']);

    if (colNome === -1) {
      mostrarToast('Não encontrei uma coluna "Nome" na planilha. Confira o cabeçalho na 1ª linha.');
      return;
    }

    itensImportProdutos = linhas
      .slice(1)
      .map((linha) => {
        const nome = String(linha[colNome] ?? '').trim();
        if (!nome) return null;

        const produtoExistente = produtos.find((p) => normalizarTexto(p.nome) === normalizarTexto(nome));
        const fornecedoresTexto = colFornecedores !== -1 ? String(linha[colFornecedores] ?? '').trim() : '';
        const marcasTexto = colMarcas !== -1 ? String(linha[colMarcas] ?? '').trim() : '';

        return {
          nome,
          produtoExistenteId: produtoExistente ? produtoExistente.id : null,
          estoqueAtual: colAtual !== -1 ? paraNumeroOuNull(linha[colAtual]) : null,
          estoqueMinimo: colMinimo !== -1 ? paraNumeroOuNull(linha[colMinimo]) : null,
          fornecedoresNomes: fornecedoresTexto
            ? fornecedoresTexto.split(',').map((s) => s.trim()).filter(Boolean)
            : null,
          marcas: marcasTexto ? parseMarcas(marcasTexto) : null,
        };
      })
      .filter(Boolean);

    if (itensImportProdutos.length === 0) {
      mostrarToast('Nenhuma linha válida encontrada (confira a coluna Nome).');
    } else {
      mostrarToast(`${itensImportProdutos.length} linha(s) lida(s). Confira antes de importar.`);
    }

    renderizarRevisaoImportProdutos();
  } catch (erro) {
    console.error(erro);
    mostrarToast('Erro ao ler a planilha. Verifique se o arquivo é um .xlsx, .xls ou .csv válido.');
  } finally {
    btnProcessarImportProdutos.disabled = false;
  }
}

function renderizarRevisaoImportProdutos() {
  tabelaRevisaoImportProdutos.innerHTML = '';
  secaoRevisaoImportProdutos.classList.toggle('hidden', itensImportProdutos.length === 0);

  itensImportProdutos.forEach((item) => {
    const acao = item.produtoExistenteId ? 'Atualizar' : 'Novo';
    const corAcao = item.produtoExistenteId ? 'text-blue-600' : 'text-green-600';

    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(item.nome)}</td>
      <td class="py-2 pr-2 font-semibold ${corAcao}">${acao}</td>
      <td class="py-2 pr-2">${item.estoqueAtual === null ? '—' : formatarNumero(item.estoqueAtual)}</td>
      <td class="py-2 pr-2">${item.estoqueMinimo === null ? '—' : formatarNumero(item.estoqueMinimo)}</td>
      <td class="py-2 pr-2 text-gray-500">${item.fornecedoresNomes === null ? '—' : escapeHtml(item.fornecedoresNomes.join(', '))}</td>
      <td class="py-2 pr-2 text-gray-500">${item.marcas === null ? '—' : escapeHtml(item.marcas.join(', '))}</td>
    `;
    tabelaRevisaoImportProdutos.appendChild(tr);
  });
}

document.getElementById('btn-confirmar-import-produtos').addEventListener('click', confirmarImportacaoProdutos);

/** Cria produtos novos e atualiza os existentes (casados pelo nome); campos em branco na planilha não são tocados. */
function confirmarImportacaoProdutos() {
  if (itensImportProdutos.length === 0) return;

  let criados = 0;
  let atualizados = 0;
  let fornecedoresCriados = 0;

  itensImportProdutos.forEach((item) => {
    let fornecedorIds = null;
    if (item.fornecedoresNomes !== null) {
      fornecedorIds = item.fornecedoresNomes.map((nomeFornecedor) => {
        let fornecedor = fornecedores.find((f) => normalizarTexto(f.nome) === normalizarTexto(nomeFornecedor));
        if (!fornecedor) {
          fornecedor = { id: crypto.randomUUID(), nome: nomeFornecedor, contato: '', observacao: '' };
          fornecedores.push(fornecedor);
          fornecedoresCriados++;
        }
        return fornecedor.id;
      });
    }

    if (item.produtoExistenteId) {
      const produto = produtos.find((p) => p.id === item.produtoExistenteId);
      if (item.estoqueAtual !== null) produto.estoqueAtual = arredondar2(item.estoqueAtual);
      if (item.estoqueMinimo !== null) produto.estoqueMinimo = arredondar2(item.estoqueMinimo);
      if (fornecedorIds !== null) produto.fornecedorIds = fornecedorIds;
      if (item.marcas !== null) produto.marcas = item.marcas;
      atualizados++;
    } else {
      const estoqueAtual = item.estoqueAtual === null ? 0 : arredondar2(item.estoqueAtual);
      produtos.push({
        id: crypto.randomUUID(),
        nome: item.nome,
        estoqueAtual,
        estoqueMinimo: item.estoqueMinimo === null ? 0 : arredondar2(item.estoqueMinimo),
        estoqueInicial: estoqueAtual,
        comprasNotas: 0,
        fornecedorIds: fornecedorIds || [],
        marcas: item.marcas || [],
      });
      criados++;
    }
  });

  salvarProdutos(produtos);
  if (fornecedoresCriados > 0) salvarFornecedores(fornecedores);

  const sufixoFornecedores = fornecedoresCriados > 0 ? `, ${fornecedoresCriados} fornecedor(es) novo(s)` : '';
  mostrarToast(`Importação concluída: ${criados} produto(s) novo(s), ${atualizados} atualizado(s)${sufixoFornecedores}.`);

  itensImportProdutos = [];
  arquivoImportProdutosSelecionado = null;
  inputArquivoImportProdutos.value = '';
  nomeArquivoImportProdutosEl.classList.add('hidden');
  btnProcessarImportProdutos.disabled = true;

  renderizarRevisaoImportProdutos();
  renderizarCadastro();
  renderizarContagem();
  renderizarFornecedores();
}

if (linkModeloImportProdutos) {
  linkModeloImportProdutos.addEventListener('click', (e) => {
    e.preventDefault();
    const abaProdutos = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Estoque Atual', 'Estoque Mínimo', 'Fornecedores', 'Marcas'],
      ['Arroz 5kg', 10, 5, 'Distribuidora Central', ''],
      ['Queijo Mussarela', 2, 10, 'Distribuidora Central, Atacadão Sul', 'Tirolez, Polenghi'],
    ]);
    const abaFornecedores = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Contato', 'Observação'],
      ['Distribuidora Central', '(11) 99999-0001', 'Bom preço em grãos'],
      ['Atacadão Sul', '(11) 99999-0002', ''],
    ]);
    const pasta = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pasta, abaProdutos, 'Produtos');
    XLSX.utils.book_append_sheet(pasta, abaFornecedores, 'Fornecedores');
    XLSX.writeFile(pasta, 'modelo-importacao-produtos-fornecedores.xlsx');
  });
}

// ===================== Fornecedores =====================
const formFornecedor = document.getElementById('form-fornecedor');
const inputFornecedorNome = document.getElementById('input-fornecedor-nome');
const inputFornecedorContato = document.getElementById('input-fornecedor-contato');
const inputFornecedorObs = document.getElementById('input-fornecedor-obs');
const tabelaFornecedores = document.getElementById('tabela-fornecedores');
const fornecedoresVazio = document.getElementById('fornecedores-vazio');

let fornecedorEmEdicaoId = null;

formFornecedor.addEventListener('submit', (e) => {
  e.preventDefault();

  const nome = inputFornecedorNome.value.trim();
  if (!nome) {
    mostrarToast('Preencha o nome do fornecedor.');
    return;
  }

  fornecedores.push({
    id: crypto.randomUUID(),
    nome,
    contato: inputFornecedorContato.value.trim(),
    observacao: inputFornecedorObs.value.trim(),
  });

  salvarFornecedores(fornecedores);
  formFornecedor.reset();
  inputFornecedorNome.focus();
  renderizarFornecedores();
  mostrarToast('Fornecedor adicionado!');
});

function renderizarFornecedores() {
  tabelaFornecedores.innerHTML = '';
  fornecedoresVazio.classList.toggle('hidden', fornecedores.length > 0);

  fornecedores.forEach((fornecedor) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';

    if (fornecedor.id === fornecedorEmEdicaoId) {
      tr.innerHTML = `
        <td class="py-2 pr-2">
          <input type="text" value="${escapeHtml(fornecedor.nome)}" data-campo="nome"
            class="input-edicao-fornecedor w-full rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2">
          <input type="text" value="${escapeHtml(fornecedor.contato)}" data-campo="contato"
            class="input-edicao-fornecedor w-full rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2">
          <input type="text" value="${escapeHtml(fornecedor.observacao)}" data-campo="observacao"
            class="input-edicao-fornecedor w-full rounded-lg border-gray-300 border px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </td>
        <td class="py-2 pr-2 text-right whitespace-nowrap">
          <button class="text-green-600 hover:text-green-800 text-xs font-medium mr-2" data-salvar-fornecedor="${fornecedor.id}">Salvar</button>
          <button class="text-gray-500 hover:text-gray-700 text-xs font-medium" data-cancelar-fornecedor>Cancelar</button>
        </td>
      `;
      tabelaFornecedores.appendChild(tr);
      return;
    }

    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(fornecedor.nome)}</td>
      <td class="py-2 pr-2 text-gray-500">${escapeHtml(fornecedor.contato) || '—'}</td>
      <td class="py-2 pr-2 text-gray-500">${escapeHtml(fornecedor.observacao) || '—'}</td>
      <td class="py-2 pr-2 text-right whitespace-nowrap">
        <button class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2" data-editar-fornecedor="${fornecedor.id}">
          Editar
        </button>
        <button class="text-red-500 hover:text-red-700 text-xs font-medium" data-excluir-fornecedor="${fornecedor.id}">
          Excluir
        </button>
      </td>
    `;
    tabelaFornecedores.appendChild(tr);
  });

  tabelaFornecedores.querySelectorAll('[data-editar-fornecedor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fornecedorEmEdicaoId = btn.dataset.editarFornecedor;
      renderizarFornecedores();
    });
  });

  tabelaFornecedores.querySelectorAll('[data-cancelar-fornecedor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fornecedorEmEdicaoId = null;
      renderizarFornecedores();
    });
  });

  tabelaFornecedores.querySelectorAll('[data-salvar-fornecedor]').forEach((btn) => {
    btn.addEventListener('click', () => salvarEdicaoFornecedor(btn.dataset.salvarFornecedor));
  });

  tabelaFornecedores.querySelectorAll('[data-excluir-fornecedor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.excluirFornecedor;
      if (!confirm('Excluir este fornecedor? Ele também será removido dos produtos vinculados.')) return;

      fornecedores = fornecedores.filter((f) => f.id !== id);
      salvarFornecedores(fornecedores);

      // Remove a referência órfã dos produtos que tinham esse fornecedor selecionado.
      let produtosAlterados = false;
      produtos.forEach((produto) => {
        if (produto.fornecedorIds && produto.fornecedorIds.includes(id)) {
          produto.fornecedorIds = produto.fornecedorIds.filter((fid) => fid !== id);
          produtosAlterados = true;
        }
      });
      if (produtosAlterados) salvarProdutos(produtos);

      renderizarFornecedores();
      renderizarCadastro();
      mostrarToast('Fornecedor excluído.');
    });
  });
}

function salvarEdicaoFornecedor(id) {
  const fornecedor = fornecedores.find((f) => f.id === id);
  if (!fornecedor) return;

  const linha = tabelaFornecedores.querySelector(`[data-salvar-fornecedor="${id}"]`).closest('tr');
  const nome = linha.querySelector('[data-campo="nome"]').value.trim();
  const contato = linha.querySelector('[data-campo="contato"]').value.trim();
  const observacao = linha.querySelector('[data-campo="observacao"]').value.trim();

  if (!nome) {
    mostrarToast('Preencha o nome do fornecedor.');
    return;
  }

  fornecedor.nome = nome;
  fornecedor.contato = contato;
  fornecedor.observacao = observacao;

  salvarFornecedores(fornecedores);
  fornecedorEmEdicaoId = null;
  renderizarFornecedores();
  renderizarCadastro();
  mostrarToast('Fornecedor atualizado!');
}

// ===================== Importar/Atualizar Fornecedores via Planilha =====================
const dropzoneImportFornecedores = document.getElementById('dropzone-import-fornecedores');
const inputArquivoImportFornecedores = document.getElementById('input-arquivo-import-fornecedores');
const nomeArquivoImportFornecedoresEl = document.getElementById('nome-arquivo-import-fornecedores');
const btnProcessarImportFornecedores = document.getElementById('btn-processar-import-fornecedores');
const secaoRevisaoImportFornecedores = document.getElementById('secao-revisao-import-fornecedores');
const tabelaRevisaoImportFornecedores = document.getElementById('tabela-revisao-import-fornecedores');

let arquivoImportFornecedoresSelecionado = null;
let itensImportFornecedores = []; // { nome, fornecedorExistenteId, contato, observacao }

dropzoneImportFornecedores.addEventListener('click', () => inputArquivoImportFornecedores.click());
dropzoneImportFornecedores.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzoneImportFornecedores.classList.add('dragover');
});
dropzoneImportFornecedores.addEventListener('dragleave', () => dropzoneImportFornecedores.classList.remove('dragover'));
dropzoneImportFornecedores.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzoneImportFornecedores.classList.remove('dragover');
  if (e.dataTransfer.files.length) definirArquivoImportFornecedoresSelecionado(e.dataTransfer.files[0]);
});
inputArquivoImportFornecedores.addEventListener('change', () => {
  if (inputArquivoImportFornecedores.files.length) {
    definirArquivoImportFornecedoresSelecionado(inputArquivoImportFornecedores.files[0]);
  }
});

function definirArquivoImportFornecedoresSelecionado(arquivo) {
  if (!ehArquivoPlanilha(arquivo)) {
    mostrarToast('Formato não suportado. Envie uma planilha (XLSX/XLS/CSV).');
    return;
  }
  arquivoImportFornecedoresSelecionado = arquivo;
  nomeArquivoImportFornecedoresEl.textContent = `Selecionado: ${arquivo.name}`;
  nomeArquivoImportFornecedoresEl.classList.remove('hidden');
  btnProcessarImportFornecedores.disabled = false;
}

btnProcessarImportFornecedores.addEventListener('click', processarImportacaoFornecedores);

async function processarImportacaoFornecedores() {
  if (!arquivoImportFornecedoresSelecionado) return;

  if (typeof XLSX === 'undefined') {
    mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.');
    return;
  }

  btnProcessarImportFornecedores.disabled = true;

  try {
    const bufferArray = await arquivoImportFornecedoresSelecionado.arrayBuffer();
    const pasta = XLSX.read(bufferArray, { type: 'array' });
    const planilha = selecionarAbaPlanilha(pasta, 'fornecedor');
    const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: '' });

    if (linhas.length === 0) {
      mostrarToast('Planilha vazia.');
      return;
    }

    const cabecalho = linhas[0];
    const colNome = encontrarColuna(cabecalho, ['nome', 'fornecedor']);
    const colContato = encontrarColuna(cabecalho, ['contato', 'telefone', 'whatsapp', 'email', 'e-mail']);
    const colObs = encontrarColuna(cabecalho, ['observacao', 'obs', 'nota']);

    if (colNome === -1) {
      mostrarToast('Não encontrei uma coluna "Nome" na planilha. Confira o cabeçalho na 1ª linha.');
      return;
    }

    itensImportFornecedores = linhas
      .slice(1)
      .map((linha) => {
        const nome = String(linha[colNome] ?? '').trim();
        if (!nome) return null;

        const fornecedorExistente = fornecedores.find((f) => normalizarTexto(f.nome) === normalizarTexto(nome));
        const contatoTexto = colContato !== -1 ? String(linha[colContato] ?? '').trim() : '';
        const obsTexto = colObs !== -1 ? String(linha[colObs] ?? '').trim() : '';

        return {
          nome,
          fornecedorExistenteId: fornecedorExistente ? fornecedorExistente.id : null,
          contato: contatoTexto || null,
          observacao: obsTexto || null,
        };
      })
      .filter(Boolean);

    if (itensImportFornecedores.length === 0) {
      mostrarToast('Nenhuma linha válida encontrada (confira a coluna Nome).');
    } else {
      mostrarToast(`${itensImportFornecedores.length} linha(s) lida(s). Confira antes de importar.`);
    }

    renderizarRevisaoImportFornecedores();
  } catch (erro) {
    console.error(erro);
    mostrarToast('Erro ao ler a planilha. Verifique se o arquivo é um .xlsx, .xls ou .csv válido.');
  } finally {
    btnProcessarImportFornecedores.disabled = false;
  }
}

function renderizarRevisaoImportFornecedores() {
  tabelaRevisaoImportFornecedores.innerHTML = '';
  secaoRevisaoImportFornecedores.classList.toggle('hidden', itensImportFornecedores.length === 0);

  itensImportFornecedores.forEach((item) => {
    const acao = item.fornecedorExistenteId ? 'Atualizar' : 'Novo';
    const corAcao = item.fornecedorExistenteId ? 'text-blue-600' : 'text-green-600';

    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(item.nome)}</td>
      <td class="py-2 pr-2 font-semibold ${corAcao}">${acao}</td>
      <td class="py-2 pr-2 text-gray-500">${item.contato === null ? '—' : escapeHtml(item.contato)}</td>
      <td class="py-2 pr-2 text-gray-500">${item.observacao === null ? '—' : escapeHtml(item.observacao)}</td>
    `;
    tabelaRevisaoImportFornecedores.appendChild(tr);
  });
}

document.getElementById('btn-confirmar-import-fornecedores').addEventListener('click', confirmarImportacaoFornecedores);

/** Cria fornecedores novos e atualiza os existentes (casados pelo nome); campos em branco não são tocados. */
function confirmarImportacaoFornecedores() {
  if (itensImportFornecedores.length === 0) return;

  let criados = 0;
  let atualizados = 0;

  itensImportFornecedores.forEach((item) => {
    if (item.fornecedorExistenteId) {
      const fornecedor = fornecedores.find((f) => f.id === item.fornecedorExistenteId);
      if (item.contato !== null) fornecedor.contato = item.contato;
      if (item.observacao !== null) fornecedor.observacao = item.observacao;
      atualizados++;
    } else {
      fornecedores.push({
        id: crypto.randomUUID(),
        nome: item.nome,
        contato: item.contato || '',
        observacao: item.observacao || '',
      });
      criados++;
    }
  });

  salvarFornecedores(fornecedores);
  mostrarToast(`Importação concluída: ${criados} fornecedor(es) novo(s), ${atualizados} atualizado(s).`);

  itensImportFornecedores = [];
  arquivoImportFornecedoresSelecionado = null;
  inputArquivoImportFornecedores.value = '';
  nomeArquivoImportFornecedoresEl.classList.add('hidden');
  btnProcessarImportFornecedores.disabled = true;

  renderizarRevisaoImportFornecedores();
  renderizarFornecedores();
  renderizarCadastro();
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

// ===================== Contagem do Dia via Planilha =====================
// Diferente da planilha em "Entrada de Estoque" (que SOMA compras ao estoque), aqui a
// planilha representa uma contagem física e por isso SUBSTITUI o Estoque Atual.
const dropzoneContagem = document.getElementById('dropzone-contagem');
const inputArquivoContagem = document.getElementById('input-arquivo-contagem');
const nomeArquivoContagemEl = document.getElementById('nome-arquivo-contagem');
const btnProcessarPlanilhaContagem = document.getElementById('btn-processar-planilha-contagem');
const secaoRevisaoContagem = document.getElementById('secao-revisao-contagem');
const tabelaRevisaoContagem = document.getElementById('tabela-revisao-contagem');

let arquivoContagemSelecionado = null;
let itensContagemPlanilha = []; // { descricao, quantidade, produtoId }

dropzoneContagem.addEventListener('click', () => inputArquivoContagem.click());
dropzoneContagem.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzoneContagem.classList.add('dragover');
});
dropzoneContagem.addEventListener('dragleave', () => dropzoneContagem.classList.remove('dragover'));
dropzoneContagem.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzoneContagem.classList.remove('dragover');
  if (e.dataTransfer.files.length) definirArquivoContagemSelecionado(e.dataTransfer.files[0]);
});
inputArquivoContagem.addEventListener('change', () => {
  if (inputArquivoContagem.files.length) definirArquivoContagemSelecionado(inputArquivoContagem.files[0]);
});

function definirArquivoContagemSelecionado(arquivo) {
  if (!ehArquivoPlanilha(arquivo)) {
    mostrarToast('Formato não suportado. Envie uma planilha (XLSX/XLS/CSV).');
    return;
  }
  arquivoContagemSelecionado = arquivo;
  nomeArquivoContagemEl.textContent = `Selecionado: ${arquivo.name}`;
  nomeArquivoContagemEl.classList.remove('hidden');
  btnProcessarPlanilhaContagem.disabled = false;
}

btnProcessarPlanilhaContagem.addEventListener('click', processarPlanilhaContagem);

async function processarPlanilhaContagem() {
  if (!arquivoContagemSelecionado) return;

  if (typeof XLSX === 'undefined') {
    mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.');
    return;
  }

  btnProcessarPlanilhaContagem.disabled = true;

  try {
    const bufferArray = await arquivoContagemSelecionado.arrayBuffer();
    const pasta = XLSX.read(bufferArray, { type: 'array' });
    const planilha = pasta.Sheets[pasta.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: '' });

    const { colProduto, colQuantidade, linhaInicial } = detectarColunasPlanilha(linhas);

    itensContagemPlanilha = linhas
      .slice(linhaInicial)
      .map((linha) => ({
        descricao: String(linha[colProduto] ?? '').trim(),
        quantidade: paraNumero(linha[colQuantidade]),
      }))
      // aceita quantidade 0 (item zerado na contagem física é uma informação válida)
      .filter((item) => item.descricao && !Number.isNaN(item.quantidade) && item.quantidade >= 0)
      .map((item) => ({ ...item, produtoId: encontrarProdutoCorrespondente(item.descricao) }));

    if (itensContagemPlanilha.length === 0) {
      mostrarToast('Nenhuma linha válida encontrada. Confira as colunas de Produto e Quantidade na planilha.');
    } else {
      mostrarToast(`${itensContagemPlanilha.length} linha(s) lida(s). Confira antes de aplicar à contagem.`);
    }

    renderizarRevisaoContagem();
  } catch (erro) {
    console.error(erro);
    mostrarToast('Erro ao ler a planilha. Verifique se o arquivo é um .xlsx, .xls ou .csv válido.');
  } finally {
    btnProcessarPlanilhaContagem.disabled = false;
  }
}

function renderizarRevisaoContagem() {
  tabelaRevisaoContagem.innerHTML = '';
  secaoRevisaoContagem.classList.toggle('hidden', itensContagemPlanilha.length === 0);

  itensContagemPlanilha.forEach((item, index) => {
    const opcoesProdutos = produtos
      .map((p) => `<option value="${p.id}" ${p.id === item.produtoId ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`)
      .join('');

    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0 align-top';
    tr.innerHTML = `
      <td class="py-2 pr-2">${escapeHtml(item.descricao || '(descrição vazia)')}</td>
      <td class="py-2 pr-2">
        <select data-index="${index}" class="select-produto-contagem rounded-lg border-gray-300 border px-2 py-1 text-sm max-w-[200px]">
          <option value="">-- Não mapear --</option>
          ${opcoesProdutos}
        </select>
      </td>
      <td class="py-2 pr-2">
        <input type="text" inputmode="decimal" value="${formatarNumero(item.quantidade)}" data-index="${index}"
          class="input-quantidade-contagem-planilha w-24 rounded-lg border-gray-300 border px-2 py-1 text-sm" />
      </td>
      <td class="py-2 pr-2 text-right">
        <button data-index="${index}" class="btn-remover-item-contagem text-red-500 hover:text-red-700 text-xs font-medium">Remover</button>
      </td>
    `;
    tabelaRevisaoContagem.appendChild(tr);
  });

  tabelaRevisaoContagem.querySelectorAll('.select-produto-contagem').forEach((select) => {
    select.addEventListener('change', () => {
      const idx = Number(select.dataset.index);
      itensContagemPlanilha[idx].produtoId = select.value || null;
    });
  });

  tabelaRevisaoContagem.querySelectorAll('.input-quantidade-contagem-planilha').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.index);
      itensContagemPlanilha[idx].quantidade = paraNumero(input.value);
    });
    selecionarConteudoAoFocar(input);
  });

  tabelaRevisaoContagem.querySelectorAll('.btn-remover-item-contagem').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      itensContagemPlanilha.splice(idx, 1);
      renderizarRevisaoContagem();
    });
  });
}

document.getElementById('btn-aplicar-contagem').addEventListener('click', aplicarContagemDaPlanilha);

/** Sobrescreve o Estoque Atual dos produtos mapeados com os valores da planilha (contagem física). */
function aplicarContagemDaPlanilha() {
  const itensValidos = itensContagemPlanilha.filter(
    (item) => item.produtoId && !Number.isNaN(item.quantidade) && item.quantidade >= 0
  );

  if (itensValidos.length === 0) {
    mostrarToast('Selecione um produto válido para pelo menos um item.');
    return;
  }

  itensValidos.forEach((item) => {
    const produto = produtos.find((p) => p.id === item.produtoId);
    if (!produto) return;
    produto.estoqueAtual = arredondar2(item.quantidade);
  });

  salvarProdutos(produtos);
  mostrarToast(`Contagem de ${itensValidos.length} produto(s) atualizada!`);

  itensContagemPlanilha = [];
  arquivoContagemSelecionado = null;
  inputArquivoContagem.value = '';
  nomeArquivoContagemEl.classList.add('hidden');
  btnProcessarPlanilhaContagem.disabled = true;

  renderizarRevisaoContagem();
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
const listaComprasPorProdutoEl = document.getElementById('lista-compras-por-produto');
const listaComprasPorFornecedorEl = document.getElementById('lista-compras-por-fornecedor');
const listaComprasAcoes = document.getElementById('lista-compras-acoes');
const btnExportarTexto = document.getElementById('btn-exportar-texto');
const btnWhatsapp = document.getElementById('btn-whatsapp');

let modoVisualizacaoLista = 'produto'; // 'produto' ou 'fornecedor'

document.querySelectorAll('.modo-lista-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    modoVisualizacaoLista = btn.dataset.modoLista;
    document.querySelectorAll('.modo-lista-btn').forEach((b) => {
      const ativo = b === btn;
      b.classList.toggle('bg-blue-600', ativo);
      b.classList.toggle('text-white', ativo);
      b.classList.toggle('bg-gray-100', !ativo);
      b.classList.toggle('text-gray-700', !ativo);
    });
    renderizarListaCompras();
  });
});

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

/** Nomes dos fornecedores de um item da lista, já formatados para exibição ("—" se nenhum). */
function nomesFornecedoresDoItem(item) {
  const nomes = (item.fornecedorIds || [])
    .map((id) => fornecedores.find((f) => f.id === id))
    .filter(Boolean)
    .map((f) => f.nome);
  return nomes;
}

/**
 * Agrupa a lista de compras por fornecedor. Um item aparece em todos os grupos dos
 * fornecedores que tiver marcado (para comparar preço entre eles); itens sem nenhum
 * fornecedor definido caem num grupo à parte. Fornecedores em ordem alfabética,
 * "Sem fornecedor" sempre por último.
 */
function agruparListaComprasPorFornecedor() {
  const grupos = new Map();

  ultimaListaCompras.forEach((item) => {
    const ids = item.fornecedorIds && item.fornecedorIds.length > 0 ? item.fornecedorIds : ['__sem__'];
    ids.forEach((fid) => {
      if (!grupos.has(fid)) grupos.set(fid, []);
      grupos.get(fid).push(item);
    });
  });

  const idsOrdenados = [...grupos.keys()].sort((a, b) => {
    if (a === '__sem__') return 1;
    if (b === '__sem__') return -1;
    const nomeA = fornecedores.find((f) => f.id === a)?.nome || '';
    const nomeB = fornecedores.find((f) => f.id === b)?.nome || '';
    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  return idsOrdenados.map((fid) => ({
    fornecedor: fornecedores.find((f) => f.id === fid) || null,
    itens: grupos.get(fid),
  }));
}

function renderizarListaCompras() {
  listaComprasPorProdutoEl.classList.toggle('hidden', modoVisualizacaoLista !== 'produto');
  listaComprasPorFornecedorEl.classList.toggle('hidden', modoVisualizacaoLista !== 'fornecedor');
  listaComprasAcoes.classList.toggle('hidden', ultimaListaCompras.length === 0);

  renderizarListaComprasPorProduto();
  renderizarListaComprasPorFornecedor();
}

function renderizarListaComprasPorProduto() {
  tabelaListaCompras.innerHTML = '';
  const temItens = ultimaListaCompras.length > 0;
  listaVazia.classList.toggle('hidden', temItens);

  ultimaListaCompras.forEach((item) => {
    const nomesFornecedores = nomesFornecedoresDoItem(item).map(escapeHtml).join(', ');

    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    tr.innerHTML = `
      <td class="py-2 pr-2 font-medium">${escapeHtml(item.nome)}</td>
      <td class="py-2 pr-2">${formatarNumero(item.estoqueAtual)}</td>
      <td class="py-2 pr-2">${formatarNumero(item.estoqueMinimo)}</td>
      <td class="py-2 pr-2 font-semibold text-red-600">${formatarNumero(item.comprar)}</td>
      <td class="py-2 pr-2 text-gray-500">${nomesFornecedores || '—'}</td>
    `;
    tabelaListaCompras.appendChild(tr);
  });
}

function renderizarListaComprasPorFornecedor() {
  listaComprasPorFornecedorEl.innerHTML = '';

  if (ultimaListaCompras.length === 0) {
    listaComprasPorFornecedorEl.innerHTML =
      '<p class="text-gray-400 text-sm py-4">Nenhum item abaixo do estoque mínimo. Clique em "Gerar Lista de Compras" para atualizar.</p>';
    return;
  }

  agruparListaComprasPorFornecedor().forEach(({ fornecedor, itens }) => {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 rounded-lg p-4';
    card.innerHTML = `
      <div class="flex items-baseline justify-between gap-2 mb-2">
        <h3 class="font-semibold text-gray-800">${fornecedor ? escapeHtml(fornecedor.nome) : 'Sem fornecedor definido'}</h3>
        ${fornecedor && fornecedor.contato ? `<span class="text-xs text-gray-400">${escapeHtml(fornecedor.contato)}</span>` : ''}
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-1 pr-2">Produto</th>
            <th class="py-1 pr-2">Comprar</th>
          </tr>
        </thead>
        <tbody>
          ${itens
            .map(
              (item) => `
            <tr class="border-b last:border-0">
              <td class="py-1 pr-2">${escapeHtml(item.nome)}</td>
              <td class="py-1 pr-2 font-semibold text-red-600">${formatarNumero(item.comprar)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    listaComprasPorFornecedorEl.appendChild(card);
  });
}

function montarTextoListaCompras() {
  if (ultimaListaCompras.length === 0) return '';
  const dataHoje = new Date().toLocaleDateString('pt-BR');

  if (modoVisualizacaoLista === 'fornecedor') {
    const blocos = agruparListaComprasPorFornecedor().map(({ fornecedor, itens }) => {
      const titulo = fornecedor ? fornecedor.nome : 'Sem fornecedor definido';
      const linhas = itens.map((item) => `- ${item.nome}: ${formatarNumero(item.comprar)} un.`);
      return `*${titulo}*\n${linhas.join('\n')}`;
    });
    return `🛒 Lista de Compras por Fornecedor - ${dataHoje}\n\n${blocos.join('\n\n')}`;
  }

  const linhas = ultimaListaCompras.map((item) => {
    const nomesFornecedores = nomesFornecedoresDoItem(item).join(', ');
    const sufixoFornecedores = nomesFornecedores ? ` — fornecedores: ${nomesFornecedores}` : '';
    return `- ${item.nome}: ${formatarNumero(item.comprar)} un. (atual: ${formatarNumero(item.estoqueAtual)} / mínimo: ${formatarNumero(item.estoqueMinimo)})${sufixoFornecedores}`;
  });
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

/**
 * Monta a lista de compras como uma matriz de linhas (cabeçalho + dados), pronta para
 * virar planilha. Segue o modo de visualização ativo: no modo "produto", uma linha por
 * item com estoque/mínimo/fornecedores; no modo "fornecedor", uma linha por combinação
 * fornecedor+item (o mesmo item repete em cada fornecedor que tiver).
 */
function montarLinhasListaComprasParaPlanilha() {
  if (modoVisualizacaoLista === 'fornecedor') {
    const linhas = [['Fornecedor', 'Produto', 'Comprar']];
    agruparListaComprasPorFornecedor().forEach(({ fornecedor, itens }) => {
      const nomeFornecedor = fornecedor ? fornecedor.nome : 'Sem fornecedor definido';
      itens.forEach((item) => linhas.push([nomeFornecedor, item.nome, arredondar2(item.comprar)]));
    });
    return linhas;
  }

  const linhas = [['Produto', 'Estoque Atual', 'Estoque Mínimo', 'Comprar', 'Fornecedores']];
  ultimaListaCompras.forEach((item) => {
    linhas.push([
      item.nome,
      arredondar2(item.estoqueAtual),
      arredondar2(item.estoqueMinimo),
      arredondar2(item.comprar),
      nomesFornecedoresDoItem(item).join(', '),
    ]);
  });
  return linhas;
}

function nomeArquivoListaCompras(extensao) {
  const dataHoje = new Date().toISOString().slice(0, 10);
  const sufixoModo = modoVisualizacaoLista === 'fornecedor' ? 'por-fornecedor' : 'por-produto';
  return `lista-de-compras-${sufixoModo}-${dataHoje}.${extensao}`;
}

const btnExportarXlsx = document.getElementById('btn-exportar-xlsx');
const btnExportarCsv = document.getElementById('btn-exportar-csv');

btnExportarXlsx.addEventListener('click', () => {
  if (ultimaListaCompras.length === 0) return;
  if (typeof XLSX === 'undefined') {
    mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.');
    return;
  }
  const planilha = XLSX.utils.aoa_to_sheet(montarLinhasListaComprasParaPlanilha());
  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, 'Lista de Compras');
  XLSX.writeFile(pasta, nomeArquivoListaCompras('xlsx'));
});

btnExportarCsv.addEventListener('click', () => {
  if (ultimaListaCompras.length === 0) return;
  if (typeof XLSX === 'undefined') {
    mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.');
    return;
  }
  const planilha = XLSX.utils.aoa_to_sheet(montarLinhasListaComprasParaPlanilha());
  const csv = XLSX.utils.sheet_to_csv(planilha);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivoListaCompras('csv');
  a.click();
  URL.revokeObjectURL(url);
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

/** Como paraNumero, mas retorna null (em vez de NaN) para "vazio" — útil pra distinguir "não informado" de zero. */
function paraNumeroOuNull(texto) {
  if (texto === null || texto === undefined || String(texto).trim() === '') return null;
  const numero = paraNumero(texto);
  return Number.isNaN(numero) ? null : numero;
}

/** Acha o índice da 1ª coluna do cabeçalho cujo texto (sem acento/caixa) contém alguma das palavras-chave. */
function encontrarColuna(cabecalho, palavrasChave) {
  const normalizado = (cabecalho || []).map((c) => normalizarTexto(String(c ?? '')));
  return normalizado.findIndex((c) => palavrasChave.some((p) => c.includes(p)));
}

/**
 * Escolhe a aba de uma planilha (workbook) pelo nome (ex: "produto" casa com "Produtos").
 * Sem nenhuma aba com esse nome, usa a primeira — assim uma planilha de uma aba só continua funcionando.
 */
function selecionarAbaPlanilha(pasta, palavraChave) {
  const nomeAba = pasta.SheetNames.find((nome) => normalizarTexto(nome).includes(palavraChave));
  return pasta.Sheets[nomeAba || pasta.SheetNames[0]];
}

// ===================== Inicialização =====================
renderizarCadastro();
renderizarFornecedores();
renderizarContagem();
renderizarHistoricoNotas();
renderizarRelatorio();
