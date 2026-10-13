'use strict';
(async () => {
  const params = new URLSearchParams(location.search);
  const slug = (location.pathname.match(/^\/j\/([a-z0-9-]+)/) || [])[1] || params.get('j') || '';
  const origem = params.get('o') || 'direto';
  const chave = 'df-jogo-' + slug;

  let jogo;
  try {
    jogo = await api('/api/jogos/' + encodeURIComponent(slug));
  } catch (e) {
    $('#titulo').textContent = 'Ops!';
    $('#subtitulo').textContent = e.message;
    return;
  }

  document.title = `${jogo.nome} · ${jogo.nomeEmpresa}`;
  $('#titulo').textContent = jogo.nome;
  $('#subtitulo').textContent = jogo.nomeEmpresa;
  $('#consentimentoTexto').textContent = jogo.consentimentoTexto;
  $('#regras').textContent = `${jogo.regras} Cupom válido por ${jogo.validadeDias} dias.`;
  $('#privacidadeTexto').textContent =
    `Controlador dos dados: ${jogo.controlador}${jogo.cnpj ? ', CNPJ ' + jogo.cnpj : ''}. ` +
    'Usamos seu nome e celular para validar o prêmio e, se você autorizou, para enviar promoções. ' +
    'Os dados não são vendidos nem repassados. ' +
    `Para acessar, corrigir ou excluir seus dados, ou cancelar as mensagens${jogo.contatoPrivacidade ? ', fale com: ' + jogo.contatoPrivacidade : ', fale com a loja'}.`;
  $('#privacidade').hidden = false;

  const motor = Jogos[jogo.tipo];
  motor.montar($('#palco'), jogo.premios);

  // Resultado guardado neste aparelho: mostra direto
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(chave)); } catch { /* sem armazenamento */ }
  if (salvo) return mostrarResultado(salvo, true);

  if (!jogo.ativo) {
    instruir('Este jogo está encerrado no momento. Veja os outros jogos!');
    return;
  }

  const form = $('#form');
  form.hidden = false;
  mascaraCelular($('#celular'));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = $('#erro');
    erro.hidden = true;
    const botao = $('#jogar');
    botao.disabled = true;
    botao.textContent = 'Sorteando…';
    let res;
    try {
      res = await api(`/api/jogos/${encodeURIComponent(slug)}/jogar`, {
        method: 'POST',
        corpo: { nome: $('#nome').value, celular: $('#celular').value, origem, consentimento: $('#consentimento').checked }
      });
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
      botao.disabled = false;
      botao.textContent = 'Jogar!';
      return;
    }
    try { localStorage.setItem(chave, JSON.stringify(res)); } catch { /* sem armazenamento */ }
    form.hidden = true;
    await motor.revelar(res, instruir);
    mostrarResultado(res, false);
  });

  function instruir(texto) {
    const el = $('#instrucao');
    el.hidden = !texto;
    el.innerHTML = `<strong style="font-size:18px">${esc(texto)}</strong>`;
  }

  function mostrarResultado(r, jaTinha) {
    instruir('');
    if (jaTinha) $('#palco').hidden = true;
    const el = $('#resultado');
    const google = r.linkGoogle ? `
      <hr style="border:0;border-top:1px solid var(--linha);margin:18px 0">
      <p style="margin:0 0 8px">Gostou da Di Forni? Sua avaliação no Google ajuda muito a gente. 💛</p>
      <a class="botao secundario" href="${esc(r.linkGoogle)}" target="_blank" rel="noopener">Avaliar no Google</a>
      <p class="miudo">Opcional, não tem relação com o prêmio.</p>` : '';
    el.innerHTML = r.ganhou ? `
      ${jaTinha ? '<p class="miudo">Você já jogou neste aparelho. Seu prêmio:</p>' : `<p>Parabéns, ${esc(r.primeiroNome)}! Você ganhou</p>`}
      <div class="grande">${esc(r.premio)}</div>
      <div class="cupom">
        <div class="miudo">Seu código</div>
        <div class="codigo">${esc(r.codigo)}</div>
        <div class="miudo">Válido até ${esc(r.validade)}</div>
      </div>
      <p style="font-size:14px">Mostre este código no balcão ou informe ao fazer o pedido, com o mesmo celular do cadastro.
        <strong>Tire um print desta tela!</strong></p>${google}` : `
      <div class="grande" style="color:var(--tinta)">${esc(r.premio)}</div>
      <p>${jaTinha ? 'Você já jogou este jogo neste aparelho.' : `Obrigado por jogar, ${esc(r.primeiroNome)}!`}
        Fique de olho no WhatsApp: sempre tem promoção nova. 🍕</p>
      <a class="botao" href="/">Ver outros jogos</a>${google}`;
    el.hidden = false;
    if (r.ganhou && !jaTinha) soltarConfete();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
