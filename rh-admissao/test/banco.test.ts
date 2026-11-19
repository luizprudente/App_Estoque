// Testes no PostgreSQL de verdade. Só rodam com DATABASE_URL apontando para um banco DESCARTÁVEL já migrado.
// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.DATABASE_URL;
const pular = !url || !/localhost|127\.0\.0\.1/.test(url) ? "defina DATABASE_URL de um banco local descartável" : false;

test("banco: trilha append-only, conferências e token único", { skip: pular }, async () => {
  const { criarPrisma } = await import("../src/lib/db.ts");
  const prisma = criarPrisma();
  const sufixo = Date.now().toString(36);
  try {
    const adm = await prisma.admissao.create({
      data: {
        tenantId: "t-teste", storeId: "s-teste", nome: "Pessoa Teste", telefone: "0090000000", cargo: "Cargo", funcao: "FUNCAO",
        setor: "COZINHA", salarioCentavos: 100000, tipoContrato: "INDETERMINADO", dataAdmissao: new Date("2026-12-01"),
        jornada: {}, criadoPor: "teste",
      },
    });
    const ev = await prisma.eventoAdmissao.create({ data: { admissaoId: adm.id, operacaoId: "op-" + sufixo, tipo: "ABERTA", ator: "teste" } });
    await assert.rejects(prisma.eventoAdmissao.update({ where: { id: ev.id }, data: { tipo: "OUTRO" } }), /append-only/);
    await assert.rejects(prisma.eventoAdmissao.delete({ where: { id: ev.id } }), /append-only/);
    // mesma operacaoId não grava duas vezes (idempotência do clique)
    await assert.rejects(prisma.eventoAdmissao.create({ data: { admissaoId: adm.id, operacaoId: "op-" + sufixo, tipo: "ABERTA", ator: "teste" } }));
    await assert.rejects(prisma.admissao.update({ where: { id: adm.id }, data: { salarioCentavos: 0 } }));
    await assert.rejects(prisma.dispensaAso.create({ data: { admissaoId: adm.id, autorizadoPor: "x", motivo: "curto" } }));
    const agora = new Date();
    await prisma.linkAdmissao.create({ data: { admissaoId: adm.id, finalidade: "PREENCHER_ADMISSAO", tokenHash: "h-" + sufixo, criadoEm: agora, expiraEm: new Date(+agora + 1000) } });
    await assert.rejects(prisma.linkAdmissao.create({ data: { admissaoId: adm.id, finalidade: "PREENCHER_ADMISSAO", tokenHash: "h-" + sufixo, criadoEm: agora, expiraEm: new Date(+agora + 1000) } }));
    await assert.rejects(prisma.linkAdmissao.create({ data: { admissaoId: adm.id, finalidade: "PREENCHER_ADMISSAO", tokenHash: "h2-" + sufixo, criadoEm: agora, expiraEm: agora } }));
  } finally {
    await prisma.$disconnect();
  }
});
