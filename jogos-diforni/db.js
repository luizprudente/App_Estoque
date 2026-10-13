'use strict';
// Banco de dados (SQLite embutido no Node 22+). Um arquivo só: dados/jogos.db
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ARQUIVO = process.env.DB_FILE || path.join(__dirname, 'dados', 'jogos.db');
if (ARQUIVO !== ':memory:') fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });

const db = new DatabaseSync(ARQUIVO);
db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');

db.exec(`
create table if not exists config (
  id                   integer primary key check (id = 1),
  nome_empresa         text not null default 'Di Forni Pizzaria',
  prefixo_codigo       text not null default 'DF',
  validade_dias        integer not null default 7,
  link_google          text not null default 'https://g.page/r/CdIrbe-eaxm3EBM/review',
  consentimento_texto  text not null default 'Autorizo a Di Forni Pizzaria a usar meu nome e celular para validar o prêmio e me enviar promoções por WhatsApp/SMS. Posso cancelar quando quiser.',
  consentimento_versao text not null default '2026-10-v1',
  regras               text not null default 'Uma jogada por celular em cada jogo. Prêmio pessoal, uso único, apresentado no pedido com o mesmo celular. Não cumulativo com outras promoções.',
  controlador          text not null default 'Di Forni Pizzaria Ltda',
  cnpj                 text not null default '',
  contato_privacidade  text not null default '',
  atualizado_em        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists jogos (
  id     integer primary key,
  slug   text not null unique,
  tipo   text not null check (tipo in ('roleta', 'raspadinha', 'caixa')),
  nome   text not null,
  ativo  integer not null default 1,
  ordem  integer not null default 0
);

create table if not exists premios (
  id             integer primary key,
  jogo_id        integer not null references jogos(id) on delete cascade,
  ordem          integer not null default 0,
  texto          text not null,
  cor            text not null default 'preto',
  peso           real not null default 1 check (peso >= 0),
  e_premio       integer not null default 1,
  ativo          integer not null default 1,
  custo_estimado real not null default 0
);

create table if not exists equipe (
  id         integer primary key,
  nome       text not null,
  email      text not null unique collate nocase,
  senha_hash text not null,
  papel      text not null check (papel in ('dono', 'balcao')),
  ativo      integer not null default 1,
  criado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists sessoes (
  token_hash text primary key,
  usuario_id integer not null references equipe(id) on delete cascade,
  expira_em  text not null
);

create table if not exists leads (
  id                   integer primary key,
  criado_em            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  jogo_id              integer references jogos(id) on delete set null,
  jogo_nome            text not null,
  nome                 text not null,
  celular              text not null,
  origem               text not null default 'direto',
  consentimento_texto  text not null,
  consentimento_versao text not null,
  premio_id            integer references premios(id) on delete set null,
  premio_texto         text not null,
  ganhou               integer not null,
  codigo               text unique,
  validade             text,
  status               text not null check (status in ('gerado', 'resgatado', 'sem_premio', 'cancelado')),
  resgatado_em         text,
  resgatado_por_nome   text,
  custo_premio         real not null default 0,
  descadastrado_em     text,
  observacao           text not null default '',
  unique (jogo_id, celular)
);
create index if not exists leads_criado_em_idx on leads (criado_em desc);
create index if not exists leads_celular_idx on leads (celular);
`);

// ---------------------------------------------------------------------
// Dados iniciais (só na primeira vez)
// ---------------------------------------------------------------------
db.prepare('insert or ignore into config (id) values (1)').run();

if (!db.prepare('select 1 from jogos limit 1').get()) {
  const novoJogo = db.prepare('insert into jogos (slug, tipo, nome, ordem) values (?, ?, ?, ?)');
  const novoPremio = db.prepare(
    'insert into premios (jogo_id, ordem, texto, cor, peso, e_premio, custo_estimado) values (?, ?, ?, ?, ?, ?, ?)');
  const iniciais = [
    ['roleta', 'roleta', 'Roleta da Sorte', [
      ['10% de Desconto', 'vermelho', 3, 1, 0], ['Brinde Surpresa', 'preto', 2, 1, 0],
      ['Frete Grátis', 'vermelho', 3, 1, 0], ['Tente Novamente', 'verde', 3, 0, 0],
      ['Cupom R$20', 'preto', 1, 1, 20], ['10% de Desconto', 'vermelho', 3, 1, 0],
      ['Frete Grátis', 'preto', 3, 1, 0], ['Tente Novamente', 'verde', 3, 0, 0]]],
    ['raspadinha', 'raspadinha', 'Raspadinha Di Forni', [
      ['Borda Recheada Grátis', 'vermelho', 3, 1, 0], ['Refri 2L Grátis', 'preto', 2, 1, 0],
      ['15% de Desconto', 'verde', 2, 1, 0], ['Não foi dessa vez', 'preto', 3, 0, 0]]],
    ['caixa', 'caixa', 'Caixa Surpresa', [
      ['Sobremesa Grátis', 'vermelho', 2, 1, 0], ['Frete Grátis', 'verde', 3, 1, 0],
      ['Cupom R$15', 'preto', 1, 1, 15], ['Não foi dessa vez', 'preto', 3, 0, 0]]]
  ];
  iniciais.forEach(([slug, tipo, nome, premios], i) => {
    const jogoId = novoJogo.run(slug, tipo, nome, i + 1).lastInsertRowid;
    premios.forEach((p, ordem) => novoPremio.run(jogoId, ordem + 1, ...p));
  });
}

// ---------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------
const hojeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

// Data de hoje no horário de Brasília (AAAA-MM-DD), somando dias se pedido
function hojeSP(maisDias = 0) {
  const d = new Date(hojeFmt.format(new Date()) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + maisDias);
  return d.toISOString().slice(0, 10);
}

// O cupom vence no fim do dia da validade (horário de Brasília)
function statusEfetivo(status, validade) {
  return status === 'gerado' && validade && validade < hojeSP() ? 'expirado' : status;
}

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

function confereSenha(senha, guardado) {
  const [alg, sal, hash] = String(guardado).split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = crypto.scryptSync(senha, Buffer.from(sal, 'base64'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

// Executa fn dentro de uma transação
function transacao(fn) {
  db.exec('begin');
  try {
    const r = fn();
    db.exec('commit');
    return r;
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
}

module.exports = { db, hojeSP, statusEfetivo, hashSenha, confereSenha, transacao };
