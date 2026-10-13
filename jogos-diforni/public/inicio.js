'use strict';
(async () => {
  const caixa = $('#jogos');
  try {
    const d = await api('/api/publico');
    $('#empresa').textContent = d.nomeEmpresa;
    // Repassa a origem do QR Code (?o=mesa) para o jogo escolhido
    const origem = new URLSearchParams(location.search).get('o');
    const sufixo = origem ? '?o=' + encodeURIComponent(origem) : '';
    caixa.innerHTML = d.jogos.length ? d.jogos.map((j) => `
      <a href="/j/${esc(j.slug)}${esc(sufixo)}">
        <div class="icone">${ICONES[j.tipo] || '🎲'}</div>
        <div><strong>${esc(j.nome)}</strong><span>${esc(NOMES_TIPO[j.tipo])}</span></div>
      </a>`).join('') : '<div class="cartao">Nenhum jogo no ar agora. Volte em breve!</div>';
  } catch (e) {
    caixa.innerHTML = `<div class="cartao">${esc(e.message)}</div>`;
  }
})();
