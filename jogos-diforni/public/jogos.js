'use strict';
// Os jogos só mostram o resultado: o sorteio já foi feito no servidor.
// Cada jogo tem: montar(palco, premios) e revelar(resultado, instruir) → Promise

const Jogos = {};

// ---------------------------------------------------------------------
// Roleta
// ---------------------------------------------------------------------
Jogos.roleta = {
  montar(palco, premios) {
    this.premios = premios;
    palco.innerHTML = '<div class="roleta"><div class="ponteiro"></div><div class="disco"><canvas></canvas></div></div>';
    this.canvas = $('canvas', palco);
    this.desenhar();
  },

  desenhar() {
    const cv = this.canvas;
    const lado = cv.clientWidth || 320;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = lado * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const r = lado / 2;
    const n = this.premios.length || 1;
    const fatia = (2 * Math.PI) / n;

    // Aro
    ctx.beginPath(); ctx.arc(r, r, r - 2, 0, 2 * Math.PI); ctx.fillStyle = '#e6b04b'; ctx.fill();
    this.premios.forEach((p, i) => {
      const ini = -Math.PI / 2 + i * fatia;
      ctx.beginPath(); ctx.moveTo(r, r); ctx.arc(r, r, r - 12, ini, ini + fatia); ctx.closePath();
      ctx.fillStyle = corDe(p.cor); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.stroke();
      // Texto na direção do raio
      ctx.save();
      ctx.translate(r, r); ctx.rotate(ini + fatia / 2);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const tam = Math.max(11, Math.min(16, lado / 22));
      ctx.font = `700 ${tam}px system-ui, sans-serif`;
      quebrar(p.texto, 11).forEach((linha, k, todas) =>
        ctx.fillText(linha, r - 24, (k - (todas.length - 1) / 2) * (tam + 2)));
      ctx.restore();
    });
    // Bolinhas do aro
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n;
      ctx.beginPath(); ctx.arc(r + Math.cos(a) * (r - 6), r + Math.sin(a) * (r - 6), 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff8e0'; ctx.fill();
    }
    // Miolo
    ctx.beginPath(); ctx.arc(r, r, r * 0.16, 0, 2 * Math.PI); ctx.fillStyle = '#fffaf2'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#e6b04b'; ctx.stroke();
    ctx.fillStyle = '#c62c2c'; ctx.font = `700 ${r * 0.14}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DF', r, r + 1);
  },

  revelar(res, instruir) {
    instruir('Girando…');
    const n = this.premios.length;
    const i = Math.max(0, this.premios.findIndex((p) => p.id === res.premioId));
    const grau = 360 / n;
    const centro = (i + 0.5) * grau;
    const folga = (Math.random() - 0.5) * grau * 0.7;
    const alvo = 360 * 6 - centro + folga;
    const dur = 5200;
    return new Promise((ok) => {
      const t0 = performance.now();
      const passo = (t) => {
        const x = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - x, 4);
        this.canvas.style.transform = `rotate(${alvo * e}deg)`;
        if (x < 1) requestAnimationFrame(passo); else setTimeout(ok, 350);
      };
      requestAnimationFrame(passo);
    });
  }
};

function quebrar(texto, max) {
  const linhas = [];
  let atual = '';
  for (const p of String(texto).split(' ')) {
    if (atual && (atual + ' ' + p).length > max) { linhas.push(atual); atual = p; }
    else atual = atual ? atual + ' ' + p : p;
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 3);
}

// ---------------------------------------------------------------------
// Raspadinha
// ---------------------------------------------------------------------
Jogos.raspadinha = {
  montar(palco) {
    palco.innerHTML = `<div class="raspadinha">
      <div class="por-baixo"><div class="miudo">Cadastre-se para raspar</div><strong>?</strong></div>
      <canvas></canvas></div>`;
    this.caixa = $('.raspadinha', palco);
    this.canvas = $('canvas', palco);
    this.cobrir();
  },

  cobrir() {
    const cv = this.canvas;
    const w = cv.clientWidth || 320;
    const h = cv.clientHeight || 213;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#b9b9b9'); g.addColorStop(0.5, '#e4e4e4'); g.addColorStop(1, '#a9a9a9');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    ctx.fillStyle = '#6d6d6d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 22px Georgia, serif'; ctx.fillText('RASPE AQUI', w / 2, h / 2 - 10);
    ctx.font = '14px system-ui, sans-serif'; ctx.fillText('🪙 com o dedo', w / 2, h / 2 + 18);
    this.ctx = ctx;
  },

  revelar(res, instruir) {
    $('.por-baixo', this.caixa).innerHTML = res.ganhou
      ? `<div class="miudo">Você ganhou</div><strong>${esc(res.premio)}</strong>`
      : `<strong style="color:var(--tinta)">${esc(res.premio)}</strong>`;
    instruir('Raspe o cartão para ver seu prêmio!');
    this.caixa.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return new Promise((ok) => {
      const cv = this.canvas;
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = 38;
      let ultimo = null;
      let movimentos = 0;
      let fim = false;

      const ponto = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const raspar = (p) => {
        ctx.beginPath();
        if (ultimo) { ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        else { ctx.arc(p.x, p.y, 19, 0, 2 * Math.PI); ctx.fill(); }
        ultimo = p;
        if (++movimentos % 8 === 0 && limpo() > 0.5) terminar();
      };
      const limpo = () => {
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let vazio = 0, total = 0;
        for (let i = 3; i < d.length; i += 4 * 24) { total++; if (d[i] === 0) vazio++; }
        return vazio / total;
      };
      const terminar = () => {
        if (fim) return;
        fim = true;
        cv.style.transition = 'opacity .5s'; cv.style.opacity = '0';
        setTimeout(() => { cv.remove(); ok(); }, 600);
      };

      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ultimo = null; raspar(ponto(e)); });
      cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') raspar(ponto(e)); });
      cv.addEventListener('pointerup', () => { ultimo = null; });
    });
  }
};

// ---------------------------------------------------------------------
// Caixa surpresa
// ---------------------------------------------------------------------
Jogos.caixa = {
  montar(palco, premios) {
    this.premios = premios;
    palco.innerHTML = '<div class="caixas">' +
      [1, 2, 3].map((n) => `<button class="caixa" type="button" disabled aria-label="Caixa ${n}">🎁</button>`).join('') +
      '</div>';
    this.grade = $('.caixas', palco);
  },

  revelar(res, instruir) {
    instruir('Escolha uma caixa!');
    this.grade.classList.add('convite');
    this.grade.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const caixas = $$('.caixa', this.grade);
    caixas.forEach((c) => { c.disabled = false; });

    return new Promise((ok) => {
      caixas.forEach((c) => c.addEventListener('click', () => {
        this.grade.classList.remove('convite');
        caixas.forEach((x) => { x.disabled = true; });
        abrir(c, res.premio, 'escolhida');
        // As outras caixas mostram o que "poderia ter sido", só para graça
        const outros = this.premios.filter((p) => p.id !== res.premioId).map((p) => p.texto);
        setTimeout(() => {
          caixas.filter((x) => x !== c).forEach((x) =>
            abrir(x, outros.splice(Math.floor(Math.random() * outros.length), 1)[0] || '—', 'outra'));
          setTimeout(ok, 900);
        }, 800);
      }, { once: true }));
    });
  }
};

function abrir(caixa, texto, classe) {
  caixa.classList.add('aberta', classe);
  caixa.innerHTML = `<span>${esc(texto)}</span>`;
}

// ---------------------------------------------------------------------
// Confete
// ---------------------------------------------------------------------
function soltarConfete() {
  const cv = $('#confete');
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cv.hidden = false;
  cv.width = innerWidth; cv.height = innerHeight;
  const ctx = cv.getContext('2d');
  const cores = ['#c62c2c', '#2f7d3a', '#e6b04b', '#fffaf2'];
  const pecas = Array.from({ length: 140 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
    cor: cores[Math.floor(Math.random() * cores.length)], w: 6 + Math.random() * 6, h: 4 + Math.random() * 6
  }));
  const t0 = performance.now();
  const passo = (t) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of pecas) {
      p.x += p.vx; p.y += p.vy; p.a += p.va; p.vy += 0.04;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.cor;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t - t0 < 3500) requestAnimationFrame(passo); else cv.hidden = true;
  };
  requestAnimationFrame(passo);
}
