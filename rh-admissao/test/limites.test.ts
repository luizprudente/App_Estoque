// Fronteiras do blueprint que os testes originais não cobrem, e as adaptações deste projeto. Só dados sintéticos.
// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../src/lib/admissao/nucleo.ts";

const f = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));
const { momentos: m, tokens, atores, armazenamento } = f;
const pronta = () => ({ ...f.admissaoParaConcluir, assinaturas: { ...f.admissaoParaConcluir.assinaturas, regulamento: f.regulamentoAssinado } });
const J = f.admissaoAberta.jornada;
const chaves = p => p.map(x => x.chave);
const linkAberto = () => R.emitirLink({ admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: tokens.convite }).link;

test("jornada: 5x2 exige duas folgas diferentes; 12x36 exige plantão de 12h", () => {
  assert.deepEqual(R.pendenciasDaJornada(J), []);
  assert.ok(R.pendenciasDaJornada({ ...J, tipoEscala: "5X2" }).includes("duas folgas fixas"));
  assert.ok(R.pendenciasDaJornada({ ...J, tipoEscala: "5X2", folgas: ["SAB", "SAB"] }).includes("duas folgas fixas"));
  assert.deepEqual(R.pendenciasDaJornada({ ...J, tipoEscala: "5X2", folgas: ["SAB", "DOM"] }), []);
  assert.ok(R.pendenciasDaJornada({ ...J, tipoEscala: "12X36" }).includes("plantão de 12 horas"));
  assert.deepEqual(R.pendenciasDaJornada({ ...J, tipoEscala: "12X36", entrada: "19:00", saida: "07:00", cargaSemanal: 36, horasMensais: "180:00" }), []);
});

test("jornada: horários, intervalo, carga e confirmação nunca são presumidos", () => {
  assert.deepEqual(R.pendenciasDaJornada(null), ["jornada não informada"]);
  assert.ok(R.pendenciasDaJornada({ ...J, entrada: "7:00" }).includes("horários"));
  assert.ok(R.pendenciasDaJornada({ ...J, intervaloMin: 500 }).includes("intervalo"));
  assert.ok(R.pendenciasDaJornada({ ...J, cargaSemanal: 61 }).includes("carga semanal"));
  assert.ok(R.pendenciasDaJornada({ ...J, cargaSemanal: 0 }).includes("carga semanal"));
  assert.ok(R.pendenciasDaJornada({ ...J, horasMensais: "220" }).includes("horas mensais"));
  assert.ok(R.pendenciasDaJornada({ ...J, confirmadaEm: null }).includes("confirmação do RH"));
});

test("link: 167h abre, 168h recusa; finalidade não se mistura; texto público é sempre igual", () => {
  const link = linkAberto(), com = a => ({ ...link, admissao: a }), t0 = Date.parse(m.abertura);
  assert.equal(R.validarToken(com(f.admissaoAberta), new Date(t0 + 167 * 3600e3).toISOString()).ok, true);
  assert.equal(R.validarToken(com(f.admissaoAberta), new Date(t0 + 168 * 3600e3).toISOString()).motivo, "VENCIDO");
  assert.equal(R.validarToken(com(f.admissaoAberta), m.envio, "PRIMEIRO_ACESSO").motivo, "FINALIDADE_ERRADA");
  assert.equal(R.validarToken(null, m.envio).mensagem, R.MENSAGEM_LINK_RECUSADO);
  assert.throws(() => R.emitirLink({ admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: "curto" }), /token curto/);
  assert.throws(() => R.emitirLink({ admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: tokens.primeiroAcesso, finalidade: "PRIMEIRO_ACESSO" }), /primeiro acesso/);
});

test("token gerado tem 32 bytes aleatórios e só o hash é guardado", () => {
  const a = R.gerarTokenBruto(), b = R.gerarTokenBruto();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64url").length, 32);
  const { link } = R.emitirLink({ admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: a });
  assert.ok(!JSON.stringify(link).includes(a));
  assert.equal(link.tokenHash, R.hashToken(a));
});

test("rascunho corta texto em 500 e dependentes em 20", () => {
  const link = linkAberto();
  const r = R.gravarRascunhoPublico({ ...link, admissao: f.admissaoAberta }, m.envio, {
    escolaridade: "x".repeat(900),
    dependentes: Array.from({ length: 30 }, (_, i) => ({ nome: "Dependente Ficticio " + i })),
  });
  assert.equal(r.admissao.escolaridade.length, 500);
  assert.equal(r.admissao.dependentes.length, 20);
});

test("upload: limites exatos de 5 MB (PDF) e 15 MB (imagem); HTML recusado", () => {
  const L = { ...linkAberto(), admissao: f.admissaoAberta }, MB = 1024 * 1024;
  assert.equal(R.anexarDocumentoPublico(L, m.envio, "comprovante", { id: "s1", mime: "application/pdf", tamanho: 5 * MB }).ok, true);
  assert.equal(R.anexarDocumentoPublico(L, m.envio, "comprovante", { id: "s2", mime: "application/pdf", tamanho: 5 * MB + 1 }).motivo, "TAMANHO_RECUSADO");
  assert.equal(R.anexarDocumentoPublico(L, m.envio, "ctps", { id: "s3", mime: "image/webp", tamanho: 15 * MB }).ok, true);
  assert.equal(R.anexarDocumentoPublico(L, m.envio, "ctps", { id: "s4", mime: "image/jpeg", tamanho: 15 * MB + 1 }).motivo, "TAMANHO_RECUSADO");
  assert.equal(R.anexarDocumentoPublico(L, m.envio, "ctps", { id: "s5", mime: "text/html", tamanho: 10 }).motivo, "FORMATO_RECUSADO");
  assert.equal(R.anexarDocumentoPublico(L, m.envio, "ctps", { id: "s6", mime: "image/jpeg", tamanho: 0 }).motivo, "TAMANHO_RECUSADO");
});

test("formato real pelos bytes: JPEG, PNG, WebP e PDF passam; SVG e HTML não", () => {
  const b = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
  assert.equal(R.assinaturaDoArquivo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(R.assinaturaDoArquivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(R.assinaturaDoArquivo(b("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(R.assinaturaDoArquivo(b("%PDF-1.7")), "application/pdf");
  assert.equal(R.assinaturaDoArquivo(b("<svg xmlns=")), null);
  assert.equal(R.assinaturaDoArquivo(b("<!doctype html>")), null);
});

test("envio: PIS obrigatório se não for primeiro emprego; banco aceita PIX ou agência/conta", () => {
  const link = linkAberto();
  const base = { ...f.admissaoParaConcluir, status: "PENDENTE", preenchidoEm: null, versao: 2 };
  assert.ok(R.registrarEnvio({ ...link, admissao: base }, m.envio).ok);
  assert.deepEqual(R.registrarEnvio({ ...link, admissao: { ...base, primeiroEmprego: false } }, m.envio).camposFaltantes, ["pis"]);
  assert.ok(R.registrarEnvio({ ...link, admissao: { ...base, banco: { banco: "000", agencia: "0000", conta: "00000-0" } } }, m.envio).ok);
});

test("CPF: inválido e de funcionário ativo recebem a mesma resposta genérica", () => {
  const invalido = R.conferirCpfDoCandidato("000.000.000-00", []);
  const repetido = R.conferirCpfDoCandidato("111.111.111-11", []);
  assert.equal(invalido.ok, false);
  assert.deepEqual(invalido, repetido);
  assert.equal(invalido.mensagem, f.esperado.mensagemCpf);
});

test("regulamento: salão também trava; a política da loja escolhe os setores", () => {
  const a = { ...pronta(), setor: "SALAO", assinaturas: { contrato: pronta().assinaturas.contrato } };
  assert.equal(R.pendenciasParaConcluir(a, { agora: m.conclusao, armazenamento })[0].texto, "Regulamento do setor (Salão) assinado");
  const soCozinha = { ...R.POLITICA_PADRAO, setoresComRegulamento: ["COZINHA"] };
  assert.deepEqual(R.pendenciasParaConcluir(a, { agora: m.conclusao, armazenamento, politica: soCozinha }), []);
});

test("política: documento extra do contador trava só no tipo de contrato configurado", () => {
  const exige = { ...R.POLITICA_PADRAO, documentosPorContrato: { EXPERIENCIA_45_45: ["foto"] } };
  const p = R.pendenciasParaConcluir(pronta(), { agora: m.conclusao, armazenamento, politica: exige });
  assert.deepEqual(chaves(p), ["doc:foto"]);
  assert.equal(p[0].texto, "Foto 3x4");
  assert.deepEqual(R.pendenciasParaConcluir({ ...pronta(), tipoContrato: "INDETERMINADO" }, { agora: m.conclusao, armazenamento, politica: exige }), []);
  const comFoto = { ...pronta(), documentos: { ...pronta().documentos, foto: ["arq-foto-1"] } };
  assert.deepEqual(R.pendenciasParaConcluir(comFoto, { agora: m.conclusao, armazenamento: { ...armazenamento, "arq-foto-1": { tipo: "foto", sha256: "h" } }, politica: exige }), []);
});

test("assinatura só conta com envelope concluído, hash e data", () => {
  const b = pronta(), c = b.assinaturas.contrato, ag = { agora: m.conclusao, armazenamento };
  for (const ruim of [{ ...c, envelopeStatus: "ENVIADO" }, { ...c, hashAssinatura: "" }, { ...c, assinadoEm: null }]) {
    assert.deepEqual(chaves(R.pendenciasParaConcluir({ ...b, assinaturas: { ...b.assinaturas, contrato: ruim } }, ag)), ["contrato"]);
  }
});

test("dispensa: revogada volta a travar; dono inativo não dispensa", () => {
  const semAso = { ...pronta(), aso: null };
  const d = R.dispensarAso(semAso, atores.dono, "Autorizado pelo dono após falar com a clínica", m.conclusao);
  const revogada = { ...d, asoDispensa: { ...d.asoDispensa, revogadaEm: m.conclusao } };
  assert.deepEqual(chaves(R.pendenciasParaConcluir(revogada, { agora: m.conclusao, armazenamento })), ["aso"]);
  assert.throws(() => R.dispensarAso(semAso, { ...atores.dono, ativo: false }, "Autorizado pelo dono após falar com a clínica", m.conclusao), /permissão/);
});

test("dois cliques em Concluir não criam duas funcionárias", () => {
  const a = pronta(), base = { ator: atores.dono, agora: m.conclusao, armazenamento, tokenPrimeiroAcesso: tokens.primeiroAcesso };
  const r = R.concluirAdmissao({ ...base, admissao: a, versaoConferida: a.versao });
  assert.throws(() => R.concluirAdmissao({ ...base, admissao: r.admissao, versaoConferida: a.versao }), /versão/);
  const deNovo = R.concluirAdmissao({ ...base, admissao: r.admissao, versaoConferida: r.admissao.versao });
  assert.equal(deNovo.ok, false);
  assert.equal(deNovo.pendencias[0].texto, "Admissão já concluída");
});

test("abertura: exemplo da Maria passa; regras de nome, celular, e-mail, data e jornada", () => {
  const A = f.admissaoAberta;
  const d = { nome: A.nome, telefone: "(00) 90000-0000", email: A.email, cpf: null, cargo: A.cargo, funcao: A.funcao, setor: A.setor,
    salarioCentavos: A.salarioCentavos, tipoContrato: A.tipoContrato, dataAdmissao: A.dataAdmissao, jornada: A.jornada, enviarLink: true };
  const hoje = "2026-11-17";
  assert.deepEqual(R.validarAbertura(d, atores.gerente, hoje), { ok: true, erros: [], avisos: [] });
  assert.equal(R.validarAbertura({ ...d, nome: "Maria" }, atores.gerente, hoje).ok, false);
  assert.equal(R.validarAbertura({ ...d, telefone: "9000" }, atores.gerente, hoje).ok, false);
  assert.equal(R.validarAbertura({ ...d, email: "" }, atores.gerente, hoje).ok, false);
  assert.equal(R.validarAbertura({ ...d, email: "", enviarLink: false }, atores.gerente, hoje).ok, true);
  assert.equal(R.validarAbertura({ ...d, cpf: "000.000.000-00" }, atores.gerente, hoje).ok, false);
  assert.equal(R.validarAbertura({ ...d, jornada: null }, atores.gerente, hoje).ok, false);
  // mudar a data obriga a confirmar a jornada de novo
  assert.match(R.validarAbertura({ ...d, dataAdmissao: "2026-12-02" }, atores.gerente, hoje).erros.join(), /outra data/);
  // 60 dias no futuro passa; 61 não
  const j60 = { ...d, dataAdmissao: "2027-01-16", jornada: { ...A.jornada, confirmadaParaData: "2027-01-16" } };
  assert.equal(R.validarAbertura(j60, atores.gerente, hoje).ok, true);
  const j61 = { ...d, dataAdmissao: "2027-01-17", jornada: { ...A.jornada, confirmadaParaData: "2027-01-17" } };
  assert.equal(R.validarAbertura(j61, atores.gerente, hoje).ok, false);
  // retroativa: gerente não; dono sim, dentro da janela curta
  const retro = { ...d, dataAdmissao: "2026-11-15", jornada: { ...A.jornada, confirmadaParaData: "2026-11-15" } };
  assert.equal(R.validarAbertura(retro, atores.gerente, hoje).ok, false);
  assert.equal(R.validarAbertura(retro, atores.dono, hoje).ok, true);
  // piso: só aviso
  const piso = R.validarAbertura({ ...d, pisoCentavos: 200000 }, atores.gerente, hoje);
  assert.equal(piso.ok, true); assert.deepEqual(piso.avisos, ["Salário abaixo do piso do cargo"]);
});

test("logs trocam o link por um marcador", () => {
  assert.equal(R.mascararLinks("abriu https://rh.exemplo.invalid/admissao/AbC_123-x agora"), "abriu https://rh.exemplo.invalid/admissao/[link da admissão] agora");
});
