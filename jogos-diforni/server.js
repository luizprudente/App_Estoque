'use strict';
// Servidor dos jogos Di Forni. Sem dependências: só Node 22.5+.
//   npm start                                   → sobe o site na porta 3000 (ou $PORT)
//   npm run usuario -- dono email senha Nome    → cria/atualiza um usuário do painel
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hojeSP, statusEfetivo, hashSenha, confereSenha, transacao } = require('./db');

const PUBLICO = path.join(__dirname, 'public');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SESSAO_DIAS = 12;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
const TIPOS = ['roleta', 'raspadinha', 'caixa'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json'
};

class Erro extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

// ---------------------------------------------------------------------
// Utilidades HTTP
// ---------------------------------------------------------------------
function enviarJson(res, status, obj, extras = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extras });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > 100_000) { falha(new Erro(413, 'Envio grande demais.')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return ok({});
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return falha(new Erro(415, 'Use JSON.'));
      }
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch { falha(new Erro(400, 'JSON inválido.')); }
    });
    req.on('error', falha);
  });
}

function ipDe(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

// Limite simples de tentativas por chave (em memória)
const tentativas = new Map();
function limitar(chave, max, janelaMs) {
  const agora = Date.now();
  const t = tentativas.get(chave);
  if (!t || agora - t.inicio > janelaMs) { tentativas.set(chave, { n: 1, inicio: agora }); return; }
  if (++t.n > max) throw new Erro(429, 'Muitas tentativas. Aguarde alguns minutos.');
}
setInterval(() => {
  const limite = Date.now() - 3600_000;
  for (const [k, t] of tentativas) if (t.inicio < limite) tentativas.delete(k);
}, 600_000).unref();

function cookies(req) {
  const r = {};
  for (const par of String(req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) r[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return r;
}

function cookieSessao(req, valor, maxAge) {
  const seguro = req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
  return `sessao=${valor}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
}

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

function usuarioDaSessao(req) {
  const token = cookies(req).sessao;
  if (!token) return null;
  return db.prepare(`
    select e.id, e.nome, e.email, e.papel from sessoes s join equipe e on e.id = s.usuario_id
     where s.token_hash = ? and s.expira_em > ? and e.ativo = 1`).get(sha256(token), new Date().toISOString()) || null;
}

// ---------------------------------------------------------------------
// Regras de negócio
// ---------------------------------------------------------------------
const lerConfig = () => db.prepare('select * from config where id = 1').get();

function normalizarCelular(v) { return String(v || '').replace(/\D/g, ''); }

function dataBR(iso) { return iso ? iso.split('-').reverse().join('/') : null; }

function sortear(premios) {
  const total = premios.reduce((s, p) => s + p.peso, 0);
  if (total <= 0) return null;
  let x = (crypto.randomInt(0, 2 ** 32) / 2 ** 32) * total;
  for (const p of premios) {
    x -= p.peso;
    if (x < 0) return p;
  }
  return premios.filter((p) => p.peso > 0).at(-1);
}

function novoCodigo(prefixo) {
  const existe = db.prepare('select 1 from leads where codigo = ?');
  for (;;) {
    let c = prefixo + '-';
    for (let i = 0; i < 5; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (!existe.get(c)) return c;
  }
}

function jogoPublico(slug) {
  const jogo = db.prepare('select * from jogos where slug = ?').get(slug);
  if (!jogo) throw new Erro(404, 'Jogo não encontrado.');
  return jogo;
}

function cupomJson(l) {
  return {
    id: l.id, jogo: l.jogo_nome, nome: l.nome, celular: l.celular, premio: l.premio_texto,
    ganhou: !!l.ganhou, codigo: l.codigo, validade: l.validade, criado_em: l.criado_em,
    status: statusEfetivo(l.status, l.validade), resgatado_em: l.resgatado_em,
    resgatado_por_nome: l.resgatado_por_nome, observacao: l.observacao
  };
}

function jogar(slug, corpo, ip) {
  const c = lerConfig();
  const jogo = jogoPublico(slug);
  if (!jogo.ativo) throw new Erro(409, 'Este jogo está encerrado no momento.');

  const nome = String(corpo.nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const celular = normalizarCelular(corpo.celular);
  const origem = String(corpo.origem || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) || 'direto';
  if (nome.length < 5 || !nome.includes(' ')) throw new Erro(400, 'Digite nome e sobrenome.');
  if (celular.length !== 11 || celular[2] !== '9') throw new Erro(400, 'Celular inválido. Use DDD + 9 dígitos.');
  if (corpo.consentimento !== true) throw new Erro(400, 'É preciso aceitar a autorização para participar.');

  limitar('jogar:' + ip, 20, 3600_000);

  // Já jogou? Não devolvemos nome nem cupom: quem digita o celular de outra
  // pessoa não pode ver os dados dela. O cliente recupera o cupom no balcão.
  if (db.prepare('select 1 from leads where jogo_id = ? and celular = ?').get(jogo.id, celular)) {
    throw new Erro(409, 'Este celular já participou deste jogo. Se você ganhou, informe seu celular no balcão para usar o cupom.');
  }

  const premios = db.prepare('select * from premios where jogo_id = ? and ativo = 1 order by ordem, id').all(jogo.id);
  const p = sortear(premios);
  if (!p) throw new Erro(503, 'Este jogo está em manutenção. Tente mais tarde.');

  const codigo = p.e_premio ? novoCodigo(c.prefixo_codigo) : null;
  const validade = p.e_premio ? hojeSP(c.validade_dias) : null;
  db.prepare(`
    insert into leads (jogo_id, jogo_nome, nome, celular, origem, consentimento_texto, consentimento_versao,
                       premio_id, premio_texto, ganhou, codigo, validade, status, custo_premio)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    jogo.id, jogo.nome, nome, celular, origem, c.consentimento_texto, c.consentimento_versao,
    p.id, p.texto, p.e_premio, codigo, validade, p.e_premio ? 'gerado' : 'sem_premio', p.custo_estimado);

  return {
    ok: true, premioId: p.id, premio: p.texto, ganhou: !!p.e_premio, codigo,
    validade: dataBR(validade), primeiroNome: nome.split(' ')[0], linkGoogle: c.link_google
  };
}

// ---------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------
const rotas = [];
const rota = (metodo, padrao, nivel, fn) =>
  rotas.push({ metodo, re: new RegExp('^' + padrao.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), nivel, fn });

// --- Público --------------------------------------------------------------
rota('GET', '/api/publico', null, () => {
  const c = lerConfig();
  return {
    nomeEmpresa: c.nome_empresa,
    jogos: db.prepare('select slug, tipo, nome from jogos where ativo = 1 order by ordem, id').all()
  };
});

rota('GET', '/api/jogos/:slug', null, ({ p }) => {
  const c = lerConfig();
  const jogo = jogoPublico(p.slug);
  return {
    slug: jogo.slug, tipo: jogo.tipo, nome: jogo.nome, ativo: !!jogo.ativo,
    premios: db.prepare('select id, texto, cor from premios where jogo_id = ? and ativo = 1 order by ordem, id').all(jogo.id),
    nomeEmpresa: c.nome_empresa, consentimentoTexto: c.consentimento_texto, regras: c.regras,
    validadeDias: c.validade_dias, controlador: c.controlador, cnpj: c.cnpj, contatoPrivacidade: c.contato_privacidade
  };
});

rota('POST', '/api/jogos/:slug/jogar', null, ({ p, corpo, ip }) => jogar(p.slug, corpo, ip));

// --- Sessão ---------------------------------------------------------------
rota('POST', '/api/login', null, ({ req, corpo, ip }) => {
  limitar('login:' + ip, 10, 900_000);
  const u = db.prepare('select * from equipe where email = ? and ativo = 1').get(String(corpo.email || '').trim());
  if (!u || !confereSenha(String(corpo.senha || ''), u.senha_hash)) throw new Erro(401, 'E-mail ou senha incorretos.');
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + SESSAO_DIAS * 86400_000).toISOString();
  db.prepare('delete from sessoes where expira_em < ?').run(new Date().toISOString());
  db.prepare('insert into sessoes (token_hash, usuario_id, expira_em) values (?, ?, ?)').run(sha256(token), u.id, expira);
  return { corpo: { ok: true, nome: u.nome, papel: u.papel }, cookie: cookieSessao(req, token, SESSAO_DIAS * 86400) };
});

rota('POST', '/api/logout', null, ({ req }) => {
  const token = cookies(req).sessao;
  if (token) db.prepare('delete from sessoes where token_hash = ?').run(sha256(token));
  return { corpo: { ok: true }, cookie: cookieSessao(req, '', 0) };
});

rota('GET', '/api/eu', 'equipe', ({ u }) => ({ nome: u.nome, papel: u.papel, email: u.email }));

// --- Balcão ---------------------------------------------------------------
// Busca por código exato ou celular exato: o balcão não vê a lista inteira
rota('GET', '/api/cupons', 'equipe', ({ q }) => {
  const termo = String(q.get('termo') || '').trim().toUpperCase();
  const cel = normalizarCelular(termo);
  const lista = db.prepare(`select * from leads where codigo = ? or (length(?) = 11 and celular = ?)
                             order by criado_em desc limit 20`).all(termo, cel, cel);
  return { cupons: lista.map(cupomJson) };
});

rota('POST', '/api/cupons/:id/resgatar', 'equipe', ({ p, u }) => transacao(() => {
  const l = db.prepare('select * from leads where id = ?').get(Number(p.id));
  if (!l) throw new Erro(404, 'Cupom não encontrado.');
  const st = statusEfetivo(l.status, l.validade);
  if (st !== 'gerado') throw new Erro(409, `Este cupom não pode ser resgatado. Situação: ${st}.`);
  db.prepare(`update leads set status = 'resgatado', resgatado_em = ?, resgatado_por_nome = ? where id = ?`)
    .run(new Date().toISOString(), u.nome, l.id);
  return { ok: true };
}));

rota('POST', '/api/cupons/:id/desfazer', 'dono', ({ p }) => {
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const r = db.prepare(`update leads set status = 'gerado', resgatado_em = null, resgatado_por_nome = null,
                          observacao = trim(observacao || ' [resgate desfeito em ' || ? || ']')
                         where id = ? and status = 'resgatado'`).run(quando, Number(p.id));
  if (!r.changes) throw new Erro(409, 'Este cupom não está resgatado.');
  return { ok: true };
});

// --- Dono: leads ----------------------------------------------------------
function filtroLeads(q) {
  const where = [];
  const args = [];
  if (q.get('jogo')) { where.push('jogo_id = ?'); args.push(Number(q.get('jogo'))); }
  if (q.get('origem')) { where.push('origem = ?'); args.push(q.get('origem')); }
  if (q.get('busca')) {
    const b = q.get('busca').trim();
    where.push('(nome like ? or celular like ? or codigo like ?)');
    args.push(`%${b}%`, `%${normalizarCelular(b) || b}%`, `%${b.toUpperCase()}%`);
  }
  return { sql: where.length ? 'where ' + where.join(' and ') : '', args };
}

rota('GET', '/api/leads', 'dono', ({ q }) => {
  const f = filtroLeads(q);
  const pagina = Math.max(0, Number(q.get('pagina')) || 0);
  const total = db.prepare(`select count(*) n from leads ${f.sql}`).get(...f.args).n;
  const lista = db.prepare(`select * from leads ${f.sql} order by criado_em desc limit 50 offset ?`).all(...f.args, pagina * 50);
  return { total, pagina, leads: lista.map((l) => ({ ...cupomJson(l), origem: l.origem, descadastrado_em: l.descadastrado_em })) };
});

rota('GET', '/api/leads.csv', 'dono', ({ q }) => {
  const f = filtroLeads(q);
  const lista = db.prepare(`select * from leads ${f.sql} order by criado_em desc`).all(...f.args);
  const cab = ['Data', 'Jogo', 'Nome', 'Celular', 'Origem', 'Prêmio', 'Código', 'Validade', 'Situação',
    'Resgatado em', 'Resgatado por', 'Custo', 'Descadastrado em', 'Versão consentimento', 'Observação'];
  // Aspas sempre + neutraliza fórmulas (=, +, -, @) ao abrir no Excel
  const cel = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
  const linhas = lista.map((l) => [dt(l.criado_em), l.jogo_nome, l.nome, l.celular, l.origem, l.premio_texto, l.codigo,
    dataBR(l.validade), statusEfetivo(l.status, l.validade), dt(l.resgatado_em), l.resgatado_por_nome,
    String(l.custo_premio).replace('.', ','), dt(l.descadastrado_em), l.consentimento_versao, l.observacao].map(cel).join(';'));
  return { bruto: '﻿' + [cab.map(cel).join(';'), ...linhas].join('\r\n'), tipo: 'text/csv; charset=utf-8',
    arquivo: `leads-${hojeSP()}.csv` };
});

rota('POST', '/api/leads/:id/descadastrar', 'dono', ({ p }) => {
  const r = db.prepare('update leads set descadastrado_em = ? where id = ? and descadastrado_em is null')
    .run(new Date().toISOString(), Number(p.id));
  if (!r.changes) throw new Erro(409, 'Lead não encontrado ou já descadastrado.');
  return { ok: true };
});

rota('POST', '/api/leads/:id/observacao', 'dono', ({ p, corpo }) => {
  db.prepare('update leads set observacao = ? where id = ?').run(String(corpo.observacao || '').slice(0, 500), Number(p.id));
  return { ok: true };
});

rota('DELETE', '/api/leads/:id', 'dono', ({ p }) => {
  db.prepare('delete from leads where id = ?').run(Number(p.id));
  return { ok: true };
});

// --- Dono: indicadores ----------------------------------------------------
rota('GET', '/api/indicadores', 'dono', () => {
  const porJogo = db.prepare(`
    select jogo_nome jogo, count(*) participacoes, sum(ganhou) ganhadores,
           sum(status = 'resgatado') resgatados, round(sum(case when status = 'resgatado' then custo_premio else 0 end), 2) custo
      from leads group by jogo_nome order by participacoes desc`).all();
  const porOrigem = db.prepare(`
    select origem, count(*) participacoes, sum(status = 'resgatado') resgatados
      from leads group by origem order by participacoes desc`).all();
  const porDia = db.prepare(`
    select date(criado_em, '-3 hours') dia, count(*) participacoes
      from leads where criado_em >= ? group by dia order by dia`).all(new Date(Date.now() - 14 * 86400_000).toISOString());
  const totais = db.prepare(`
    select count(*) participacoes, count(distinct celular) pessoas, coalesce(sum(ganhou), 0) ganhadores,
           coalesce(sum(status = 'resgatado'), 0) resgatados,
           round(coalesce(sum(case when status = 'resgatado' then custo_premio else 0 end), 0), 2) custo
      from leads`).get();
  return { totais, porJogo, porOrigem, porDia };
});

// --- Dono: jogos e prêmios ------------------------------------------------
const bool = (v) => (v ? 1 : 0);

rota('GET', '/api/admin/jogos', 'dono', () => ({
  jogos: db.prepare('select * from jogos order by ordem, id').all().map((j) => ({
    ...j, ativo: !!j.ativo,
    premios: db.prepare('select * from premios where jogo_id = ? order by ordem, id').all(j.id)
      .map((p) => ({ ...p, ativo: !!p.ativo, e_premio: !!p.e_premio }))
  }))
}));

function validarJogo(c) {
  const nome = String(c.nome || '').trim().slice(0, 60);
  const slug = String(c.slug || '').trim().toLowerCase();
  if (!nome) throw new Erro(400, 'Dê um nome ao jogo.');
  if (!/^[a-z0-9-]{2,30}$/.test(slug)) throw new Erro(400, 'Endereço do jogo: use 2 a 30 letras minúsculas, números ou hífen.');
  if (!TIPOS.includes(c.tipo)) throw new Erro(400, 'Tipo de jogo inválido.');
  return { nome, slug, tipo: c.tipo, ativo: bool(c.ativo), ordem: Number(c.ordem) || 0 };
}

function semDuplicado(fn) {
  try { return fn(); }
  catch (e) {
    if (/UNIQUE/.test(e.message)) throw new Erro(409, 'Já existe um jogo com esse endereço.');
    throw e;
  }
}

rota('POST', '/api/admin/jogos', 'dono', ({ corpo }) => semDuplicado(() => {
  const j = validarJogo({ ...corpo, ativo: false });
  const id = db.prepare('insert into jogos (slug, tipo, nome, ativo, ordem) values (?, ?, ?, ?, ?)')
    .run(j.slug, j.tipo, j.nome, j.ativo, j.ordem).lastInsertRowid;
  return { ok: true, id: Number(id) };
}));

rota('PUT', '/api/admin/jogos/:id', 'dono', ({ p, corpo }) => semDuplicado(() => {
  const j = validarJogo(corpo);
  db.prepare('update jogos set slug = ?, tipo = ?, nome = ?, ativo = ?, ordem = ? where id = ?')
    .run(j.slug, j.tipo, j.nome, j.ativo, j.ordem, Number(p.id));
  return { ok: true };
}));

rota('DELETE', '/api/admin/jogos/:id', 'dono', ({ p }) => {
  if (db.prepare('select 1 from leads where jogo_id = ? limit 1').get(Number(p.id))) {
    throw new Erro(409, 'Este jogo já tem participações. Desative em vez de apagar.');
  }
  db.prepare('delete from jogos where id = ?').run(Number(p.id));
  return { ok: true };
});

function validarPremio(c) {
  const texto = String(c.texto || '').trim();
  if (texto.length < 1 || texto.length > 40) throw new Erro(400, 'O texto do prêmio deve ter de 1 a 40 caracteres.');
  const cor = String(c.cor || 'preto');
  if (!['vermelho', 'preto', 'verde'].includes(cor) && !/^#[0-9a-f]{6}$/i.test(cor)) throw new Erro(400, 'Cor inválida.');
  const peso = Number(c.peso);
  const custo = Number(c.custo_estimado);
  if (!(peso >= 0)) throw new Erro(400, 'Chance (peso) deve ser zero ou mais.');
  if (!(custo >= 0)) throw new Erro(400, 'Custo deve ser zero ou mais.');
  return { texto, cor, peso, custo, e_premio: bool(c.e_premio), ativo: bool(c.ativo), ordem: Number(c.ordem) || 0 };
}

rota('POST', '/api/admin/jogos/:id/premios', 'dono', ({ p, corpo }) => {
  const v = validarPremio(corpo);
  const id = db.prepare(`insert into premios (jogo_id, ordem, texto, cor, peso, e_premio, ativo, custo_estimado)
                         values (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(Number(p.id), v.ordem, v.texto, v.cor, v.peso, v.e_premio, v.ativo, v.custo).lastInsertRowid;
  return { ok: true, id: Number(id) };
});

rota('PUT', '/api/admin/premios/:id', 'dono', ({ p, corpo }) => {
  const v = validarPremio(corpo);
  db.prepare(`update premios set ordem = ?, texto = ?, cor = ?, peso = ?, e_premio = ?, ativo = ?, custo_estimado = ?
               where id = ?`).run(v.ordem, v.texto, v.cor, v.peso, v.e_premio, v.ativo, v.custo, Number(p.id));
  return { ok: true };
});

rota('DELETE', '/api/admin/premios/:id', 'dono', ({ p }) => {
  db.prepare('delete from premios where id = ?').run(Number(p.id));
  return { ok: true };
});

// --- Dono: configuração ---------------------------------------------------
rota('GET', '/api/admin/config', 'dono', () => lerConfig());

rota('PUT', '/api/admin/config', 'dono', ({ corpo }) => {
  const atual = lerConfig();
  const txt = (k, max) => String(corpo[k] ?? atual[k]).trim().slice(0, max);
  const v = {
    nome_empresa: txt('nome_empresa', 60), prefixo_codigo: txt('prefixo_codigo', 6).toUpperCase(),
    validade_dias: Number(corpo.validade_dias ?? atual.validade_dias), link_google: txt('link_google', 300),
    consentimento_texto: txt('consentimento_texto', 600), regras: txt('regras', 600),
    controlador: txt('controlador', 100), cnpj: txt('cnpj', 20), contato_privacidade: txt('contato_privacidade', 100)
  };
  if (!/^[A-Z0-9]{1,6}$/.test(v.prefixo_codigo)) throw new Erro(400, 'Prefixo do código: 1 a 6 letras ou números.');
  if (!Number.isInteger(v.validade_dias) || v.validade_dias < 1 || v.validade_dias > 90) throw new Erro(400, 'Validade: de 1 a 90 dias.');
  if (v.link_google && !/^https:\/\//.test(v.link_google)) throw new Erro(400, 'O link do Google deve começar com https://');
  if (!v.consentimento_texto) throw new Erro(400, 'O texto de autorização não pode ficar vazio.');
  // Texto de consentimento mudou → nova versão (cada lead guarda a versão que aceitou)
  const versao = v.consentimento_texto === atual.consentimento_texto ? atual.consentimento_versao
    : new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  db.prepare(`update config set nome_empresa = ?, prefixo_codigo = ?, validade_dias = ?, link_google = ?,
               consentimento_texto = ?, consentimento_versao = ?, regras = ?, controlador = ?, cnpj = ?,
               contato_privacidade = ?, atualizado_em = ? where id = 1`)
    .run(v.nome_empresa, v.prefixo_codigo, v.validade_dias, v.link_google, v.consentimento_texto, versao, v.regras,
      v.controlador, v.cnpj, v.contato_privacidade, new Date().toISOString());
  return { ok: true };
});

// --- Dono: equipe ---------------------------------------------------------
rota('GET', '/api/admin/equipe', 'dono', () => ({
  equipe: db.prepare('select id, nome, email, papel, ativo, criado_em from equipe order by ativo desc, nome').all()
    .map((e) => ({ ...e, ativo: !!e.ativo }))
}));

function validarSenha(s) {
  if (String(s || '').length < 8) throw new Erro(400, 'A senha precisa de pelo menos 8 caracteres.');
  return String(s);
}

rota('POST', '/api/admin/equipe', 'dono', ({ corpo }) => {
  const nome = String(corpo.nome || '').trim().slice(0, 60);
  const email = String(corpo.email || '').trim().toLowerCase();
  if (!nome) throw new Erro(400, 'Informe o nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Erro(400, 'E-mail inválido.');
  if (!['dono', 'balcao'].includes(corpo.papel)) throw new Erro(400, 'Papel inválido.');
  try {
    db.prepare('insert into equipe (nome, email, senha_hash, papel) values (?, ?, ?, ?)')
      .run(nome, email, hashSenha(validarSenha(corpo.senha)), corpo.papel);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new Erro(409, 'Já existe alguém com esse e-mail.');
    throw e;
  }
  return { ok: true };
});

rota('PUT', '/api/admin/equipe/:id', 'dono', ({ p, corpo, u }) => {
  const id = Number(p.id);
  if (id === u.id && (corpo.ativo === false || corpo.papel === 'balcao')) {
    throw new Erro(400, 'Você não pode bloquear a si mesmo nem tirar seu próprio acesso de dono.');
  }
  transacao(() => {
    if (typeof corpo.ativo === 'boolean') {
      db.prepare('update equipe set ativo = ? where id = ?').run(bool(corpo.ativo), id);
      if (!corpo.ativo) db.prepare('delete from sessoes where usuario_id = ?').run(id);
    }
    if (['dono', 'balcao'].includes(corpo.papel)) db.prepare('update equipe set papel = ? where id = ?').run(corpo.papel, id);
    if (corpo.senha) {
      db.prepare('update equipe set senha_hash = ? where id = ?').run(hashSenha(validarSenha(corpo.senha)), id);
      db.prepare('delete from sessoes where usuario_id = ?').run(id);
    }
  });
  return { ok: true };
});

// ---------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------
const CABECALHOS_SEGURANCA = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"
};

function arquivoEstatico(req, res, caminho) {
  if (caminho === '/') caminho = '/index.html';
  if (caminho === '/painel') caminho = '/painel.html';
  if (/^\/j\/[a-z0-9-]+\/?$/.test(caminho)) caminho = '/jogar.html'; // /j/roleta?o=instagram
  const alvo = path.normalize(path.join(PUBLICO, caminho));
  if (!alvo.startsWith(PUBLICO + path.sep)) { res.writeHead(404); return res.end(); }
  fs.readFile(alvo, (err, dados) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Página não encontrada.'); }
    res.writeHead(200, {
      ...CABECALHOS_SEGURANCA,
      'content-type': MIME[path.extname(alvo)] || 'application/octet-stream',
      'cache-control': alvo.endsWith('.html') ? 'no-cache' : 'public, max-age=300'
    });
    res.end(req.method === 'HEAD' ? undefined : dados);
  });
}

async function tratar(req, res) {
  const url = new URL(req.url, 'http://local');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return arquivoEstatico(req, res, decodeURIComponent(url.pathname));
  }
  try {
    let achou = null;
    for (const r of rotas) {
      const m = r.re.exec(url.pathname);
      if (m && r.metodo === req.method) { achou = { r, p: m.groups || {} }; break; }
    }
    if (!achou) throw new Erro(404, 'Rota não encontrada.');
    const u = achou.r.nivel ? usuarioDaSessao(req) : null;
    if (achou.r.nivel && !u) throw new Erro(401, 'Faça login novamente.');
    if (achou.r.nivel === 'dono' && u.papel !== 'dono') throw new Erro(403, 'Só o dono pode fazer isso.');
    const corpo = ['POST', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
    const r = achou.r.fn({ req, p: achou.p, q: url.searchParams, corpo, u, ip: ipDe(req) });
    if (r && r.bruto !== undefined) {
      res.writeHead(200, { 'content-type': r.tipo, 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${r.arquivo}"` });
      return res.end(r.bruto);
    }
    if (r && r.cookie) return enviarJson(res, 200, r.corpo, { 'set-cookie': r.cookie });
    enviarJson(res, 200, r);
  } catch (e) {
    if (!(e instanceof Erro)) console.error(e);
    enviarJson(res, e.status || 500, { ok: false, erro: e instanceof Erro ? e.message : 'Erro interno. Tente de novo.' });
  }
}

// ---------------------------------------------------------------------
// Linha de comando: criar usuário do painel
// ---------------------------------------------------------------------
if (require.main === module && process.argv[2] === 'usuario') {
  const [papel, email, senha, ...nome] = process.argv.slice(3);
  if (!['dono', 'balcao'].includes(papel) || !email || !senha || !nome.length) {
    console.log('Uso: npm run usuario -- <dono|balcao> <email> <senha> <Nome>');
    process.exit(1);
  }
  validarSenha(senha);
  db.prepare(`insert into equipe (nome, email, senha_hash, papel) values (?, ?, ?, ?)
              on conflict (email) do update set nome = excluded.nome, senha_hash = excluded.senha_hash,
                                                papel = excluded.papel, ativo = 1`)
    .run(nome.join(' '), email.toLowerCase(), hashSenha(senha), papel);
  console.log(`Usuário ${email} (${papel}) pronto.`);
} else if (require.main === module) {
  const porta = Number(process.env.PORT) || 3000;
  http.createServer(tratar).listen(porta, () => console.log(`Jogos Di Forni em http://localhost:${porta}  (painel: /painel)`));
}

module.exports = { tratar, sortear };
