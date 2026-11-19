// Testes originais do módulo (reference.test.mjs), apontados para o núcleo em TypeScript. Expectativas sem mudança.
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emitirLink, validarToken, gravarRascunhoPublico, anexarDocumentoPublico, registrarEnvio, cpfValido, cpfDuplicado, erroCpfDuplicado, pendenciasParaConcluir, dispensarAso, mudarStatus, cancelarAdmissao, concluirAdmissao, autorizarDownload, MENSAGEM_LINK_RECUSADO} from '../src/lib/admissao/nucleo.ts';
const f = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const {momentos: m, tokens, atores, armazenamento} = f;
const chaves = p => p.map(x => x.chave);
const comAdmissao = (link, admissao) => ({...link, admissao});
const pronta = () => ({...f.admissaoParaConcluir, assinaturas: {...f.admissaoParaConcluir.assinaturas, regulamento: f.regulamentoAssinado}});

test('o link vale 7 dias exatos e o reenvio derruba o anterior na hora', () => {
 const {link} = emitirLink({admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: tokens.convite});
 assert.equal(Date.parse(link.expiraEm), Date.parse(f.esperado.linkExpira));
 assert.ok(!('token' in link) && link.tokenHash.length === 64);
 assert.equal(validarToken(comAdmissao(link, f.admissaoAberta), m.quaseVencido).ok, true);
 const vencido = validarToken(comAdmissao(link, f.admissaoAberta), m.vencido);
 assert.equal(vencido.motivo, 'VENCIDO'); assert.equal(vencido.mensagem, MENSAGEM_LINK_RECUSADO);
 const r = emitirLink({admissao: f.admissaoAberta, links: [link], agora: m.reenvio, tokenBruto: tokens.reenvio});
 assert.equal(Date.parse(r.link.expiraEm), Date.parse(f.esperado.linkReenviadoExpira));
 const antigo = r.links.find(l => l.id === link.id);
 assert.equal(validarToken(comAdmissao(antigo, f.admissaoAberta), m.reenvio).motivo, 'REVOGADO');
 assert.equal(validarToken(comAdmissao(r.link, f.admissaoAberta), m.reenvio).ok, true);
});

test('o candidato preenche, sobe as fotos e envia uma vez só; salário e loja não vêm do link', () => {
 const {link} = emitirLink({admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: tokens.convite});
 const r = gravarRascunhoPublico(comAdmissao(link, f.admissaoAberta), m.envio, f.candidatoEnvia);
 assert.deepEqual([...r.ignorados].sort(), f.esperado.ignoradosNoRascunho);
 let adm = r.admissao;
 assert.equal(adm.salarioCentavos, 190000); assert.equal(adm.storeId, 'loja-centro'); assert.equal(adm.status, 'PENDENTE');
 const cedo = registrarEnvio(comAdmissao(link, adm), m.envio);
 assert.equal(cedo.ok, false); assert.deepEqual(cedo.camposFaltantes, ['titulo', 'identidade', 'ctps', 'comprovante']);
 for (const u of f.uploadsRecusados) assert.equal(anexarDocumentoPublico(comAdmissao(link, adm), m.envio, u.tipo, u.arquivo).motivo, u.motivo);
 for (const u of f.uploads) { const up = anexarDocumentoPublico(comAdmissao(link, adm), m.envio, u.tipo, u.arquivo); assert.ok(up.ok); adm = up.admissao; }
 const e = registrarEnvio(comAdmissao(link, adm), m.envio);
 assert.ok(e.ok); assert.equal(e.admissao.status, 'DOCS_RECEBIDOS'); assert.equal(e.admissao.preenchidoEm, m.envio);
 assert.deepEqual(e.admissao.documentos, f.admissaoParaConcluir.documentos);
 assert.equal(validarToken(comAdmissao(e.link, e.admissao), m.envio).ok, false);
 assert.equal(gravarRascunhoPublico(comAdmissao(link, e.admissao), m.envio, {cpf: '1'}).ok, false);
});

test('admissão cancelada recusa leitura e escrita e manda todos os arquivos para exclusão', () => {
 const {link, links} = emitirLink({admissao: f.admissaoAberta, agora: m.abertura, tokenBruto: tokens.convite});
 assert.throws(() => cancelarAdmissao({admissao: f.admissaoAberta, links, ator: atores.gerente, motivo: 'curto', agora: m.cancelamento}));
 const c = cancelarAdmissao({admissao: f.admissaoAberta, links, ator: atores.gerente, motivo: 'Candidata desistiu da vaga por telefone', agora: m.cancelamento});
 assert.ok(c.links.every(l => l.revogadoEm === m.cancelamento));
 const semRevogar = comAdmissao(link, c.admissao);
 assert.equal(validarToken(semRevogar, m.cancelamento).motivo, 'CANCELADA');
 assert.equal(gravarRascunhoPublico(semRevogar, m.cancelamento, {cpf: '000.000.000-00'}).ok, false);
 assert.equal(anexarDocumentoPublico(semRevogar, m.cancelamento, 'cnh', f.uploads[0].arquivo).ok, false);
 const tardio = cancelarAdmissao({admissao: f.admissaoParaConcluir, ator: atores.dono, motivo: 'Vaga congelada pela gerência da loja', agora: m.cancelamento});
 assert.equal(tardio.excluirArquivos.length, f.esperado.arquivosNoPacote);
 assert.ok(['arq-cnh-1', 'arq-tit-1', 'arq-aso-1'].every(id => tardio.excluirArquivos.includes(id)));
 assert.ok(Date.parse(tardio.anonimizarEm) > Date.parse(m.cancelamento));
 assert.throws(() => mudarStatus(tardio.admissao, 'DOCS_RECEBIDOS', atores.dono));
});

test('CPF de funcionário ativo recebe a mensagem genérica, sem nome de ninguém', () => {
 assert.equal(cpfValido('000.000.000-00'), false);
 assert.equal(cpfValido('123'), false);
 assert.equal(cpfDuplicado('000.000.000-00', f.funcionarios), true);
 assert.equal(cpfDuplicado('000.000.000-00', f.funcionarios.filter(x => x.status !== 'ATIVO')), false);
 assert.equal(erroCpfDuplicado.length, 0);
 const erro = erroCpfDuplicado();
 assert.equal(erro.mensagem, f.esperado.mensagemCpf);
 for (const p of f.funcionarios) assert.ok(!JSON.stringify(erro).includes(p.nome));
});

test('a lista do que trava a conclusão bate com o exemplo', () => {
 assert.deepEqual(chaves(pendenciasParaConcluir(f.admissaoAberta, {agora: m.abertura})), f.esperado.pendenciasAberta);
 const conf = pendenciasParaConcluir(f.admissaoParaConcluir, {agora: m.conferencia, armazenamento});
 assert.deepEqual(chaves(conf), f.esperado.pendenciasNaConferencia);
 assert.equal(conf[0].texto, f.esperado.textoRegulamento);
 assert.deepEqual(pendenciasParaConcluir(pronta(), {agora: m.conclusao, armazenamento}), []);
});

test('documentos seguem o tipo de identidade; contrato, regulamento e jornada também travam', () => {
 const base = pronta(), ag = {agora: m.conclusao, armazenamento};
 const rg = {numero: '0000000', emissao: '2015-05-05', orgao: 'SSP'};
 const rgAntigo = {...base, tipoIdentidade: 'RG_ANTIGO', identidade: rg, documentos: {...base.documentos, cnh: [], rg: ['arq-rg-1']}};
 assert.deepEqual(chaves(pendenciasParaConcluir(rgAntigo, ag)), ['fotoCpf']);
 assert.deepEqual(chaves(pendenciasParaConcluir({...rgAntigo, tipoIdentidade: 'RG_NOVO_CIN'}, ag)), []);
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, documentos: {...base.documentos, tituloEleitor: []}}, ag)), ['titulo']);
 const novaRevisao = {...base.assinaturas.contrato, revisaoAtual: 2};
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, assinaturas: {...base.assinaturas, contrato: novaRevisao}}, ag)), ['contrato']);
 const semRegulamento = {...base, setor: 'ESCRITORIO', assinaturas: {contrato: base.assinaturas.contrato}};
 assert.deepEqual(chaves(pendenciasParaConcluir(semRegulamento, ag)), []);
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, dataAdmissao: '2026-12-02'}, ag)), ['escala']);
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, jornada: {...base.jornada, fonteConfirmacao: ''}}, ag)), ['escala']);
});

test('ASO: hash, aptidão e datas; dispensa só pelo dono, com motivo e só sem ASO', () => {
 const base = pronta(), ag = {agora: m.conclusao, armazenamento};
 assert.deepEqual(chaves(pendenciasParaConcluir(base, {agora: m.conclusao, armazenamento: {...armazenamento, 'arq-aso-1': {tipo: 'aso', sha256: 'outro'}}})), ['aso']);
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, aso: {...base.aso, dataExame: '2026-12-01'}}, {agora: '2026-12-01T08:00:00-03:00', armazenamento})), []);
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, aso: {...base.aso, dataExame: '2026-12-02'}}, {agora: '2026-12-03T08:00:00-03:00', armazenamento})), ['aso']);
 assert.deepEqual(chaves(pendenciasParaConcluir({...base, aso: {...base.aso, dataValidade: '2026-11-30'}}, ag)), ['aso']);
 const semAso = {...base, aso: null};
 assert.deepEqual(chaves(pendenciasParaConcluir(semAso, ag)), ['aso']);
 assert.throws(() => dispensarAso(semAso, atores.gerente, 'Autorizado pelo dono após falar com a clínica', m.conclusao));
 assert.throws(() => dispensarAso(semAso, atores.dono, 'curto', m.conclusao));
 const dispensada = dispensarAso(semAso, atores.dono, 'Autorizado pelo dono após falar com a clínica', m.conclusao);
 assert.deepEqual(pendenciasParaConcluir(dispensada, ag), []);
 const inapto = {...base, aso: {...base.aso, apto: false}};
 assert.throws(() => dispensarAso(inapto, atores.dono, 'Autorizado pelo dono após falar com a clínica', m.conclusao));
 assert.equal(pendenciasParaConcluir({...inapto, asoDispensa: dispensada.asoDispensa}, ag)[0].texto, 'ASO inapto: não existe dispensa para isso');
});

test('concluir monta o pacote antes, cria a funcionária e dá primeiro acesso sem senha', () => {
 const a = pronta(), args = {admissao: a, ator: atores.gerente, agora: m.conclusao, armazenamento, tokenPrimeiroAcesso: tokens.primeiroAcesso, versaoConferida: a.versao};
 const travada = concluirAdmissao({...args, admissao: f.admissaoParaConcluir});
 assert.equal(travada.ok, false); assert.deepEqual(chaves(travada.pendencias), ['regulamento']);
 assert.throws(() => concluirAdmissao({...args, versaoConferida: a.versao - 1}), /versão/);
 assert.throws(() => concluirAdmissao({...args, ator: atores.outraLoja}), /não encontrada/);
 const {['arq-ctps-1']: _, ...semCtps} = armazenamento;
 assert.throws(() => concluirAdmissao({...args, armazenamento: semCtps}), /pacote incompleto/);
 const r = concluirAdmissao(args);
 assert.ok(r.ok); assert.equal(r.admissao.status, 'CONCLUIDO'); assert.equal(r.funcionario.status, 'ATIVO');
 assert.equal(r.pacote.arquivos.length, f.esperado.arquivosNoPacote);
 assert.deepEqual(r.integracoes.map(i => i.tipo), f.esperado.integracoes);
 assert.ok(r.integracoes.every(i => i.status === 'PENDENTE'));
 assert.equal(r.primeiroAcesso.finalidade, 'PRIMEIRO_ACESSO');
 assert.equal(Date.parse(r.primeiroAcesso.expiraEm), Date.parse(f.esperado.primeiroAcessoExpira));
 assert.ok(!/senha/i.test(JSON.stringify(r)));
 assert.equal(validarToken(comAdmissao(r.primeiroAcesso, r.admissao), m.conclusao, 'PRIMEIRO_ACESSO').ok, true);
 assert.equal(validarToken(comAdmissao(r.primeiroAcesso, r.admissao), m.conclusao).motivo, 'FINALIDADE_ERRADA');
 assert.throws(() => mudarStatus(r.admissao, 'CANCELADO', atores.dono));
});

test('transições e URL assinada curta respeitam loja e permissão', () => {
 const a = f.admissaoParaConcluir;
 assert.throws(() => mudarStatus(f.admissaoAberta, 'DOCS_RECEBIDOS', atores.gerente), /não enviado/);
 assert.throws(() => mudarStatus(a, 'CONCLUIDO', atores.gerente), /concluirAdmissao/);
 assert.equal(mudarStatus(a, 'ESOCIAL', atores.gerente).status, 'ESOCIAL');
 assert.throws(() => mudarStatus(a, 'ESOCIAL', atores.outraLoja), /não encontrada/);
 assert.throws(() => autorizarDownload({ator: atores.gerente, admissao: a, arquivoId: 'arq-aso-1', agora: m.conferencia, armazenamento}), /permissão/);
 assert.throws(() => autorizarDownload({ator: atores.outraLoja, admissao: a, arquivoId: 'arq-cnh-1', agora: m.conferencia, armazenamento}));
 const url = autorizarDownload({ator: atores.dono, admissao: a, arquivoId: 'arq-aso-1', agora: m.conferencia, armazenamento});
 assert.equal(Date.parse(url.expiraEm) - Date.parse(m.conferencia), 5 * 60000);
});
