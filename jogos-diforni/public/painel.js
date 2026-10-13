'use strict';
(() => {
  let eu = null;
  let jogos = [];
  const filtros = { pagina: 0 };

  // ---------------------------------------------------------------------
  // Sessão
  // ---------------------------------------------------------------------
  async function iniciar() {
    try {
      eu = await api('/api/eu');
    } catch {
      $('#login').hidden = false;
      $('#app').hidden = true;
      return;
    }
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#quem').textContent = `${eu.nome} · ${eu.papel === 'dono' ? 'Dono' : 'Balcão'}`;
    $$('[data-dono]').forEach((b) => { b.hidden = eu.papel !== 'dono'; });
    if (eu.papel === 'dono') await carregarJogos();
    abrirAba(location.hash.slice(1) || 'balcao');
  }

  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('#loginErro');
    erro.hidden = true;
    try {
      await api('/api/login', { method: 'POST', corpo: { email: $('#email').value, senha: $('#senha').value } });
      $('#senha').value = '';
      iniciar();
    } catch (err) {
      erro.textContent = err.message;
      erro.hidden = false;
    }
  });

  $('#sair').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    location.hash = '';
    location.reload();
  });

  // Chamada de API que trata sessão expirada e mostra o erro
  async function chamar(caminho, opcoes) {
    try {
      return await api(caminho, opcoes);
    } catch (e) {
      if (e.status === 401) { alert('Sua sessão expirou. Entre de novo.'); location.reload(); }
      else alert(e.message);
      throw e;
    }
  }

  // ---------------------------------------------------------------------
  // Abas
  // ---------------------------------------------------------------------
  const carregarAba = {
    balcao: () => $('#termo').focus(),
    leads: carregarLeads,
    indicadores: carregarIndicadores,
    jogos: desenharJogos,
    divulgar: montarDivulgar,
    config: carregarConfig,
    equipe: carregarEquipe
  };

  function abrirAba(nome) {
    const botao = $(`#abas [data-aba="${nome}"]`);
    if (!botao || botao.hidden) nome = 'balcao';
    $$('#abas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === nome)));
    $$('main > section').forEach((s) => { s.hidden = s.id !== 'aba-' + nome; });
    history.replaceState(null, '', '#' + nome);
    carregarAba[nome]();
  }
  $('#abas').addEventListener('click', (e) => { if (e.target.dataset.aba) abrirAba(e.target.dataset.aba); });

  const etiqueta = (st) => {
    const nomes = { gerado: 'Válido', resgatado: 'Resgatado', expirado: 'Expirado', sem_premio: 'Sem prêmio', cancelado: 'Cancelado' };
    return `<span class="etiqueta st-${esc(st)}">${esc(nomes[st] || st)}</span>`;
  };
  const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ---------------------------------------------------------------------
  // Balcão
  // ---------------------------------------------------------------------
  $('#buscaCupom').addEventListener('submit', async (e) => {
    e.preventDefault();
    const termo = $('#termo').value.trim();
    if (!termo) return;
    const d = await chamar('/api/cupons?termo=' + encodeURIComponent(termo));
    const caixa = $('#cupons');
    if (!d.cupons.length) {
      caixa.innerHTML = '<div class="erro">Nenhum cupom encontrado. Confira o código (ex.: DF-AB2CD) ou o celular com DDD.</div>';
      return;
    }
    caixa.innerHTML = d.cupons.map((c) => `
      <div class="cupom-balcao">
        <h3>${esc(c.premio)} ${etiqueta(c.status)}</h3>
        <div><strong>${esc(c.nome)}</strong> · ${esc(formatarCelular(c.celular))}</div>
        <div class="miudo">${esc(c.jogo)} · jogou em ${esc(dataHora(c.criado_em))}
          ${c.codigo ? ` · código <strong>${esc(c.codigo)}</strong> · válido até ${esc(dataCurta(c.validade))}` : ''}
          ${c.resgatado_em ? `<br>Resgatado em ${esc(dataHora(c.resgatado_em))} por ${esc(c.resgatado_por_nome)}` : ''}</div>
        ${c.status === 'gerado' ? `<button class="botao verde" type="button" data-resgatar="${c.id}" style="margin-top:10px">✔ Resgatar agora</button>` : ''}
        ${c.status === 'resgatado' && eu.papel === 'dono' ? `<button class="botao pequeno secundario" type="button" data-desfazer="${c.id}" style="margin-top:10px">Desfazer resgate</button>` : ''}
      </div>`).join('');
  });

  $('#cupons').addEventListener('click', async (e) => {
    const id = e.target.dataset.resgatar || e.target.dataset.desfazer;
    if (!id) return;
    if (e.target.dataset.resgatar && !confirm('Confirmar o resgate deste cupom? Ele não poderá ser usado de novo.')) return;
    if (e.target.dataset.desfazer && !confirm('Desfazer o resgate? O cupom volta a ficar válido.')) return;
    await chamar(`/api/cupons/${id}/${e.target.dataset.resgatar ? 'resgatar' : 'desfazer'}`, { method: 'POST' });
    $('#buscaCupom').requestSubmit();
  });

  // ---------------------------------------------------------------------
  // Leads
  // ---------------------------------------------------------------------
  function consultaLeads() {
    const q = new URLSearchParams();
    if ($('#fBusca').value.trim()) q.set('busca', $('#fBusca').value.trim());
    if ($('#fJogo').value) q.set('jogo', $('#fJogo').value);
    if ($('#fOrigem').value.trim()) q.set('origem', $('#fOrigem').value.trim());
    return q;
  }

  async function carregarLeads() {
    const q = consultaLeads();
    q.set('pagina', filtros.pagina);
    const d = await chamar('/api/leads?' + q);
    const de = d.total ? d.pagina * 50 + 1 : 0;
    $('#totalLeads').textContent = `${d.total} participação(ões) · mostrando ${de}–${d.pagina * 50 + d.leads.length}`;
    $('#anterior').disabled = d.pagina === 0;
    $('#proxima').disabled = (d.pagina + 1) * 50 >= d.total;
    $('#tabelaLeads').innerHTML = `
      <tr><th>Data</th><th>Nome</th><th>Celular</th><th>Jogo</th><th>Origem</th><th>Prêmio</th><th>Situação</th><th></th></tr>` +
      d.leads.map((l) => `
      <tr>
        <td>${esc(dataHora(l.criado_em))}</td>
        <td>${esc(l.nome)}${l.descadastrado_em ? ' <span class="etiqueta st-cancelado">descadastrado</span>' : ''}
          ${l.observacao ? `<div class="miudo">${esc(l.observacao)}</div>` : ''}</td>
        <td><a href="https://wa.me/55${esc(l.celular)}" target="_blank" rel="noopener">${esc(formatarCelular(l.celular))}</a></td>
        <td>${esc(l.jogo)}</td>
        <td>${esc(l.origem)}</td>
        <td>${esc(l.premio)}${l.codigo ? `<div class="miudo">${esc(l.codigo)}</div>` : ''}</td>
        <td>${etiqueta(l.status)}</td>
        <td style="white-space:nowrap">
          ${l.descadastrado_em ? '' : `<button class="botao pequeno secundario" data-descad="${l.id}" title="Cliente pediu para não receber mensagens">Descadastrar</button>`}
          <button class="botao pequeno secundario" data-obs="${l.id}">Obs.</button>
          <button class="botao pequeno secundario" data-apagar="${l.id}" title="Apaga os dados (pedido de exclusão LGPD ou teste)">Apagar</button>
        </td>
      </tr>`).join('');
  }

  $('#filtroLeads').addEventListener('submit', (e) => { e.preventDefault(); filtros.pagina = 0; carregarLeads(); });
  $('#anterior').addEventListener('click', () => { filtros.pagina--; carregarLeads(); });
  $('#proxima').addEventListener('click', () => { filtros.pagina++; carregarLeads(); });
  $('#exportar').addEventListener('click', () => { location.href = '/api/leads.csv?' + consultaLeads(); });

  $('#tabelaLeads').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.descad && confirm('Marcar como descadastrado? A pessoa não deve mais receber promoções.')) {
      await chamar(`/api/leads/${b.dataset.descad}/descadastrar`, { method: 'POST' });
    } else if (b.dataset.obs) {
      const texto = prompt('Observação sobre este lead:');
      if (texto === null) return;
      await chamar(`/api/leads/${b.dataset.obs}/observacao`, { method: 'POST', corpo: { observacao: texto } });
    } else if (b.dataset.apagar && confirm('Apagar este lead de vez? Não dá para desfazer.')) {
      await chamar(`/api/leads/${b.dataset.apagar}`, { method: 'DELETE' });
    } else return;
    carregarLeads();
  });

  // ---------------------------------------------------------------------
  // Indicadores
  // ---------------------------------------------------------------------
  async function carregarIndicadores() {
    const d = await chamar('/api/indicadores');
    const t = d.totais;
    const taxa = t.ganhadores ? Math.round((t.resgatados / t.ganhadores) * 100) : 0;
    const numeros = [
      [t.participacoes, 'participações'], [t.pessoas, 'pessoas diferentes'], [t.ganhadores, 'cupons gerados'],
      [t.resgatados, 'cupons resgatados'], [taxa + '%', 'taxa de resgate'],
      [dinheiro(t.custo), 'custo dos prêmios resgatados'],
      [dinheiro(t.pessoas ? t.custo / t.pessoas : 0), 'custo por pessoa cadastrada']
    ];
    $('#numeros').innerHTML = numeros.map(([n, r]) => `<div class="cartao"><strong>${esc(n)}</strong><span>${esc(r)}</span></div>`).join('');

    // Últimos 14 dias, incluindo dias sem participação
    const mapa = Object.fromEntries(d.porDia.map((x) => [x.dia, x.participacoes]));
    const dias = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000);
      dias.push(dt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
    }
    const max = Math.max(1, ...dias.map((x) => mapa[x] || 0));
    $('#barras').innerHTML = dias.map((x) => {
      const v = mapa[x] || 0;
      return `<div style="height:${(v / max) * 100}%" title="${esc(dataCurta(x))}: ${v}"><span>${v || ''}</span></div>`;
    }).join('');

    $('#porJogo').innerHTML = '<tr><th>Jogo</th><th>Participações</th><th>Ganhadores</th><th>Resgatados</th><th>Custo</th></tr>' +
      d.porJogo.map((j) => `<tr><td>${esc(j.jogo)}</td><td>${j.participacoes}</td><td>${j.ganhadores}</td><td>${j.resgatados}</td><td>${dinheiro(j.custo)}</td></tr>`).join('');
    $('#porOrigem').innerHTML = '<tr><th>Origem</th><th>Participações</th><th>Resgatados</th></tr>' +
      d.porOrigem.map((o) => `<tr><td>${esc(o.origem)}</td><td>${o.participacoes}</td><td>${o.resgatados}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------------
  // Jogos e prêmios
  // ---------------------------------------------------------------------
  async function carregarJogos() {
    jogos = (await chamar('/api/admin/jogos')).jogos;
    const opcoes = jogos.map((j) => `<option value="${j.id}">${esc(j.nome)}</option>`).join('');
    $('#fJogo').innerHTML = '<option value="">Todos</option>' + opcoes;
    $('#qJogo').innerHTML = jogos.map((j) => `<option value="${esc(j.slug)}">${esc(j.nome)}${j.ativo ? '' : ' (fora do ar)'}</option>`).join('') +
      '<option value="">Página com todos os jogos</option>';
  }

  const corOpcoes = (atual) => ['vermelho', 'preto', 'verde'].map((c) =>
    `<option value="${c}" ${c === atual ? 'selected' : ''}>${c}</option>`).join('') +
    (/^#/.test(atual) ? `<option value="${esc(atual)}" selected>${esc(atual)}</option>` : '');

  function desenharJogos() {
    $('#listaJogos').innerHTML = jogos.map((j) => {
      const soma = j.premios.filter((p) => p.ativo).reduce((s, p) => s + p.peso, 0);
      return `
      <div class="cartao" data-jogo="${j.id}">
        <div class="linha">
          <div><label>Nome</label><input name="nome" type="text" value="${esc(j.nome)}"></div>
          <div><label>Endereço</label><input name="slug" type="text" value="${esc(j.slug)}"></div>
          <div><label>Tipo</label><select name="tipo">${['roleta', 'raspadinha', 'caixa'].map((t) =>
            `<option value="${t}" ${t === j.tipo ? 'selected' : ''}>${NOMES_TIPO[t]}</option>`).join('')}</select></div>
          <div style="flex:0 0 90px"><label>Ordem</label><input name="ordem" type="number" value="${j.ordem}"></div>
          <label class="check" style="flex:0 0 auto"><input name="ativo" type="checkbox" ${j.ativo ? 'checked' : ''}> No ar</label>
          <button class="botao pequeno" type="button" data-salvar-jogo>Salvar</button>
          <button class="botao pequeno secundario" type="button" data-apagar-jogo>Apagar</button>
        </div>
        <div class="tabela-rolagem"><table>
          <tr><th>Ordem</th><th>Texto</th><th>Cor</th><th>Chance</th><th>%</th><th>É prêmio?</th><th>Custo (R$)</th><th>Ativo</th><th></th></tr>
          ${j.premios.map((p) => `
          <tr data-premio="${p.id}">
            <td><input name="ordem" type="number" value="${p.ordem}" style="width:64px"></td>
            <td><input name="texto" type="text" maxlength="40" value="${esc(p.texto)}"></td>
            <td><select name="cor">${corOpcoes(p.cor)}</select></td>
            <td><input name="peso" type="number" min="0" step="0.1" value="${p.peso}" style="width:80px"></td>
            <td class="miudo">${p.ativo && soma ? Math.round((p.peso / soma) * 1000) / 10 + '%' : '—'}</td>
            <td><input name="e_premio" type="checkbox" ${p.e_premio ? 'checked' : ''}></td>
            <td><input name="custo_estimado" type="number" min="0" step="0.01" value="${p.custo_estimado}" style="width:90px"></td>
            <td><input name="ativo" type="checkbox" ${p.ativo ? 'checked' : ''}></td>
            <td style="white-space:nowrap"><button class="botao pequeno" type="button" data-salvar-premio>Salvar</button>
              <button class="botao pequeno secundario" type="button" data-apagar-premio>✕</button></td>
          </tr>`).join('')}
        </table></div>
        <button class="botao pequeno secundario" type="button" data-novo-premio style="margin-top:10px">+ Adicionar prêmio</button>
        <p class="miudo">“Chance” é relativa: um prêmio com 3 sai três vezes mais que um com 1. Chance 0 aparece no jogo mas nunca sai.
          Desmarque “É prêmio?” para fatias como “Tente novamente”.</p>
      </div>`;
    }).join('');
  }

  function valores(el) {
    const v = {};
    $$('input, select', el).forEach((i) => { v[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
    return v;
  }

  $('#listaJogos').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const cartao = b.closest('[data-jogo]');
    const jogoId = cartao.dataset.jogo;
    const linha = b.closest('[data-premio]');
    if ('salvarJogo' in b.dataset) {
      await chamar(`/api/admin/jogos/${jogoId}`, { method: 'PUT', corpo: valores($('.linha', cartao)) });
    } else if ('apagarJogo' in b.dataset) {
      if (!confirm('Apagar este jogo e seus prêmios?')) return;
      await chamar(`/api/admin/jogos/${jogoId}`, { method: 'DELETE' });
    } else if ('salvarPremio' in b.dataset) {
      await chamar(`/api/admin/premios/${linha.dataset.premio}`, { method: 'PUT', corpo: valores(linha) });
    } else if ('apagarPremio' in b.dataset) {
      if (!confirm('Apagar este prêmio? (Para tirar do jogo sem perder o histórico, desmarque “Ativo”.)')) return;
      await chamar(`/api/admin/premios/${linha.dataset.premio}`, { method: 'DELETE' });
    } else if ('novoPremio' in b.dataset) {
      const j = jogos.find((x) => String(x.id) === jogoId);
      const ordem = Math.max(0, ...j.premios.map((p) => p.ordem)) + 1;
      await chamar(`/api/admin/jogos/${jogoId}/premios`, { method: 'POST',
        corpo: { ordem, texto: 'Novo prêmio', cor: 'preto', peso: 0, e_premio: true, ativo: false, custo_estimado: 0 } });
    } else return;
    await carregarJogos();
    desenharJogos();
  });

  $('#njNome').addEventListener('input', () => {
    $('#njSlug').value = $('#njNome').value.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  });

  $('#novoJogo').addEventListener('submit', async (e) => {
    e.preventDefault();
    await chamar('/api/admin/jogos', { method: 'POST', corpo: { nome: $('#njNome').value, slug: $('#njSlug').value, tipo: $('#njTipo').value } });
    e.target.reset();
    await carregarJogos();
    desenharJogos();
  });

  // ---------------------------------------------------------------------
  // Links e QR Codes
  // ---------------------------------------------------------------------
  function montarDivulgar() {
    if (!$('#qBase').value) $('#qBase').value = location.origin;
    atualizarQr();
  }

  function linkDivulgacao() {
    const base = $('#qBase').value.trim().replace(/\/+$/, '');
    const slug = $('#qJogo').value;
    const origem = $('#qOrigem').value.trim().replace(/[^A-Za-z0-9_-]/g, '-');
    return `${base}/${slug ? 'j/' + slug : ''}${origem ? '?o=' + origem : ''}`;
  }

  function atualizarQr() {
    const link = linkDivulgacao();
    $('#qrLink').textContent = link;
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const url = qr.createDataURL(10, 2);
    $('#qrImg').src = url;
    $('#baixarQr').href = url;
    $('#baixarQr').download = `qrcode-${$('#qJogo').value || 'jogos'}-${$('#qOrigem').value || 'direto'}.gif`;
  }
  ['#qJogo', '#qOrigem', '#qBase'].forEach((s) => $(s).addEventListener('input', atualizarQr));
  $('#copiarLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(linkDivulgacao()); $('#copiarLink').textContent = 'Copiado!'; }
    catch { prompt('Copie o link:', linkDivulgacao()); }
    setTimeout(() => { $('#copiarLink').textContent = 'Copiar link'; }, 1500);
  });

  // ---------------------------------------------------------------------
  // Configurações
  // ---------------------------------------------------------------------
  const CAMPOS = ['nome_empresa', 'prefixo_codigo', 'validade_dias', 'link_google', 'regras', 'consentimento_texto',
    'controlador', 'cnpj', 'contato_privacidade'];

  async function carregarConfig() {
    const c = await chamar('/api/admin/config');
    CAMPOS.forEach((k) => { $('#c_' + k).value = c[k]; });
    $('#versao').textContent = `Versão atual: ${c.consentimento_versao}.`;
    $('#configMsg').innerHTML = '';
  }

  $('#formConfig').addEventListener('submit', async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(CAMPOS.map((k) => [k, $('#c_' + k).value]));
    corpo.validade_dias = Number(corpo.validade_dias);
    await chamar('/api/admin/config', { method: 'PUT', corpo });
    await carregarConfig();
    $('#configMsg').innerHTML = '<div class="aviso-ok">Salvo!</div>';
  });

  // ---------------------------------------------------------------------
  // Equipe
  // ---------------------------------------------------------------------
  async function carregarEquipe() {
    const d = await chamar('/api/admin/equipe');
    $('#tabelaEquipe').innerHTML = '<tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr>' +
      d.equipe.map((p) => `
      <tr data-pessoa="${p.id}">
        <td>${esc(p.nome)}</td><td>${esc(p.email)}</td>
        <td>${p.papel === 'dono' ? 'Dono' : 'Balcão'}</td>
        <td>${p.ativo ? '<span class="etiqueta st-gerado">Ativo</span>' : '<span class="etiqueta st-cancelado">Bloqueado</span>'}</td>
        <td style="white-space:nowrap">
          <button class="botao pequeno secundario" data-ativo="${!p.ativo}">${p.ativo ? 'Bloquear' : 'Reativar'}</button>
          <button class="botao pequeno secundario" data-senha>Trocar senha</button>
        </td>
      </tr>`).join('');
  }

  $('#tabelaEquipe').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.closest('[data-pessoa]').dataset.pessoa;
    if (b.dataset.ativo) {
      await chamar(`/api/admin/equipe/${id}`, { method: 'PUT', corpo: { ativo: b.dataset.ativo === 'true' } });
    } else if ('senha' in b.dataset) {
      const senha = prompt('Nova senha (mínimo 8 caracteres):');
      if (!senha) return;
      await chamar(`/api/admin/equipe/${id}`, { method: 'PUT', corpo: { senha } });
      alert('Senha trocada.');
    }
    carregarEquipe();
  });

  $('#novoUsuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    await chamar('/api/admin/equipe', { method: 'POST',
      corpo: { nome: $('#nuNome').value, email: $('#nuEmail').value, senha: $('#nuSenha').value, papel: $('#nuPapel').value } });
    e.target.reset();
    carregarEquipe();
  });

  iniciar();
})();
