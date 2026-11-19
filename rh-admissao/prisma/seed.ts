// Seed FICTÍCIO: só os dados do exemplo do módulo (Maria Exemplo, Loja Centro).
// Nunca rode isto num banco com dados reais e nunca troque por pessoas de verdade.
import { criarPrisma } from "../src/lib/db";
import { readFileSync } from "node:fs";

const f = JSON.parse(readFileSync(new URL("../test/fixtures.json", import.meta.url), "utf8"));
const prisma = criarPrisma();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed fictício não roda em produção.");
  const tenant = await prisma.tenant.upsert({ where: { id: f.scope.tenantId }, update: {}, create: { id: f.scope.tenantId, nome: "Restaurante Exemplo" } });
  for (const [id, nome] of [["loja-centro", "Loja Centro"], ["loja-praia", "Loja Praia"]]) {
    await prisma.loja.upsert({ where: { id }, update: {}, create: { id, tenantId: tenant.id, nome } });
  }
  for (const a of Object.values(f.atores) as any[]) {
    await prisma.usuario.upsert({
      where: { id: a.id }, update: {},
      create: { id: a.id, tenantId: a.tenantId, storeId: a.storeId, nome: "Usuário " + a.id, email: `${a.id}@exemplo.invalid`, papel: a.papel, permissoes: a.permissoes },
    });
  }
  await prisma.politicaAdmissao.upsert({
    where: { tenantId_storeId: { tenantId: tenant.id, storeId: "loja-centro" } }, update: {},
    create: { tenantId: tenant.id, storeId: "loja-centro" },
  });
  const A = f.admissaoAberta;
  await prisma.admissao.upsert({
    where: { id: A.id }, update: {},
    create: {
      id: A.id, tenantId: A.tenantId, storeId: A.storeId, nome: A.nome, telefone: A.telefone, email: A.email,
      cargo: A.cargo, funcao: A.funcao, setor: A.setor, salarioCentavos: A.salarioCentavos, tipoContrato: A.tipoContrato,
      dataAdmissao: new Date(A.dataAdmissao), jornada: A.jornada, criadoPor: "usr-gerente",
    },
  });
  console.log("Seed fictício aplicado: 1 empresa, 2 lojas, 3 usuários, 1 admissão (Maria Exemplo).");
}

main().finally(() => prisma.$disconnect());
