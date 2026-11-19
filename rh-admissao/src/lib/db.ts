import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Uma instância por processo (no dev do Next, reaproveitada entre recargas).
const g = globalThis as unknown as { prisma?: PrismaClient };

export function criarPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const prisma = g.prisma ?? (g.prisma = criarPrisma());
