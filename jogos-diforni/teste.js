'use strict';
// Testes do servidor: npm test  (usa um banco em memória)
process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tratar, sortear } = require('./server');
const { db, hashSenha } = require('./db');

let base;
const servidor = http.createServer(tratar);
test.before(() => new Promise((ok) => servidor.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(); })));
test.after(() => servidor.close());

async function req(metodo, caminho, corpo, cookie) {
  const headers = {};
  if (corpo) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* csv */ }
  return { status: r.status, json, texto, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

const jogada = (celular, extra = {}) =>
  ({ nome: 'Maria da Silva', celular, origem: 'mesa', consentimento: true, ...extra });

db.prepare('insert into equipe (nome, email, senha_hash, papel) values (?, ?, ?, ?)').run('Dono', 'dono@x.com', hashSenha('senha-dono-1'), 'dono');
db.prepare('insert into equipe (nome, email, senha_hash, papel) values (?, ?, ?, ?)').run('Ana', 'ana@x.com', hashSenha('senha-ana-12'), 'balcao');

test('lista os três jogos iniciais', async () => {
  const r = await req('GET', '/api/publico');
  assert.deepEqual(r.json.jogos.map((j) => j.tipo), ['roleta', 'raspadinha', 'caixa']);
});

test('valida cadastro', async () => {
  assert.equal((await req('POST', '/api/jogos/roleta/jogar', jogada('14999998888', { nome: 'Maria' }))).status, 400);
  assert.equal((await req('POST', '/api/jogos/roleta/jogar', jogada('1499999888'))).status, 400);
  assert.equal((await req('POST', '/api/jogos/roleta/jogar', jogada('14899998888'))).status, 400);
  assert.equal((await req('POST', '/api/jogos/roleta/jogar', jogada('14999998888', { consentimento: false }))).status, 400);
  assert.equal((await req('POST', '/api/jogos/nao-existe/jogar', jogada('14999998888'))).status, 404);
});

test('joga uma vez por celular em cada jogo, sem vazar dados na repetição', async () => {
  const r1 = await req('POST', '/api/jogos/roleta/jogar', jogada('(14) 99999-0001'));
  assert.equal(r1.status, 200);
  assert.equal(r1.json.primeiroNome, 'Maria');
  if (r1.json.ganhou) assert.match(r1.json.codigo, /^DF-[A-Z2-9]{5}$/);

  const r2 = await req('POST', '/api/jogos/roleta/jogar', jogada('14999990001', { nome: 'Outra Pessoa' }));
  assert.equal(r2.status, 409);
  assert.ok(!JSON.stringify(r2.json).includes('Maria'));
  if (r1.json.codigo) assert.ok(!JSON.stringify(r2.json).includes(r1.json.codigo));

  // Mesmo celular pode jogar outro jogo
  assert.equal((await req('POST', '/api/jogos/caixa/jogar', jogada('14999990001'))).status, 200);
});

test('jogo desligado não aceita jogadas', async () => {
  db.prepare("update jogos set ativo = 0 where slug = 'raspadinha'").run();
  assert.equal((await req('POST', '/api/jogos/raspadinha/jogar', jogada('14999990002'))).status, 409);
  db.prepare("update jogos set ativo = 1 where slug = 'raspadinha'").run();
});

test('painel exige login e papel certo', async () => {
  assert.equal((await req('GET', '/api/cupons?termo=x')).status, 401);
  assert.equal((await req('POST', '/api/login', { email: 'ana@x.com', senha: 'errada' })).status, 401);
  const ana = (await req('POST', '/api/login', { email: 'ana@x.com', senha: 'senha-ana-12' })).cookie;
  assert.equal((await req('GET', '/api/cupons?termo=x', null, ana)).status, 200);
  assert.equal((await req('GET', '/api/leads', null, ana)).status, 403);
  assert.equal((await req('PUT', '/api/admin/config', { validade_dias: 3 }, ana)).status, 403);
});

test('balcão resgata uma vez; dono desfaz', async () => {
  // Garante um ganhador: só um prêmio ativo na raspadinha
  db.prepare("update premios set ativo = (texto = 'Refri 2L Grátis') where jogo_id = (select id from jogos where slug = 'raspadinha')").run();
  const j = await req('POST', '/api/jogos/raspadinha/jogar', jogada('14999990003'));
  assert.equal(j.json.premio, 'Refri 2L Grátis');

  const ana = (await req('POST', '/api/login', { email: 'ana@x.com', senha: 'senha-ana-12' })).cookie;
  const busca = await req('GET', '/api/cupons?termo=' + j.json.codigo.toLowerCase(), null, ana);
  assert.equal(busca.json.cupons.length, 1);
  const porCelular = await req('GET', '/api/cupons?termo=' + encodeURIComponent('(14) 99999-0003'), null, ana);
  assert.equal(porCelular.json.cupons[0].codigo, j.json.codigo);

  const id = busca.json.cupons[0].id;
  assert.equal((await req('POST', `/api/cupons/${id}/resgatar`, null, ana)).status, 200);
  assert.equal((await req('POST', `/api/cupons/${id}/resgatar`, null, ana)).status, 409);
  assert.equal((await req('POST', `/api/cupons/${id}/desfazer`, null, ana)).status, 403);

  const dono = (await req('POST', '/api/login', { email: 'dono@x.com', senha: 'senha-dono-1' })).cookie;
  assert.equal((await req('POST', `/api/cupons/${id}/desfazer`, null, dono)).status, 200);
  const depois = await req('GET', '/api/cupons?termo=' + j.json.codigo, null, ana);
  assert.equal(depois.json.cupons[0].status, 'gerado');
});

test('cupom vencido não pode ser resgatado', async () => {
  const j = await req('POST', '/api/jogos/raspadinha/jogar', jogada('14999990004'));
  db.prepare("update leads set validade = '2020-01-01' where codigo = ?").run(j.json.codigo);
  const ana = (await req('POST', '/api/login', { email: 'ana@x.com', senha: 'senha-ana-12' })).cookie;
  const c = (await req('GET', '/api/cupons?termo=' + j.json.codigo, null, ana)).json.cupons[0];
  assert.equal(c.status, 'expirado');
  assert.equal((await req('POST', `/api/cupons/${c.id}/resgatar`, null, ana)).status, 409);
});

test('dono vê leads, exporta CSV seguro e indicadores', async () => {
  await req('POST', '/api/jogos/caixa/jogar', jogada('14999990005', { nome: '=HYPERLINK("x") Malicioso' }));
  const dono = (await req('POST', '/api/login', { email: 'dono@x.com', senha: 'senha-dono-1' })).cookie;
  const leads = await req('GET', '/api/leads', null, dono);
  assert.ok(leads.json.total >= 4);
  const csv = await req('GET', '/api/leads.csv', null, dono);
  assert.match(csv.texto, /"'=HYPERLINK/);
  const ind = await req('GET', '/api/indicadores', null, dono);
  assert.ok(ind.json.totais.participacoes >= 4);
});

test('mudar o texto de consentimento cria nova versão', async () => {
  const dono = (await req('POST', '/api/login', { email: 'dono@x.com', senha: 'senha-dono-1' })).cookie;
  const antes = (await req('GET', '/api/admin/config', null, dono)).json.consentimento_versao;
  await req('PUT', '/api/admin/config', { consentimento_texto: 'Novo texto de autorização.' }, dono);
  const depois = (await req('GET', '/api/admin/config', null, dono)).json;
  assert.notEqual(depois.consentimento_versao, antes);
  assert.equal((await req('PUT', '/api/admin/config', { prefixo_codigo: 'x y' }, dono)).status, 400);
});

test('sorteio respeita os pesos', () => {
  const premios = [{ id: 1, peso: 3 }, { id: 2, peso: 1 }, { id: 3, peso: 0 }];
  const cont = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 20000; i++) cont[sortear(premios).id]++;
  assert.equal(cont[3], 0);
  assert.ok(Math.abs(cont[1] / 20000 - 0.75) < 0.02);
  assert.equal(sortear([{ id: 1, peso: 0 }]), null);
});

test('não serve arquivos fora da pasta pública', async () => {
  const r = await req('GET', '/..%2fdb.js');
  assert.equal(r.status, 404);
  assert.equal((await req('GET', '/j/roleta')).status, 200);
});
