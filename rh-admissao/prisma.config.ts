import { defineConfig } from "prisma/config";

// DATABASE_URL vem do ambiente (veja .env.example). Nunca coloque a senha real no repositório.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
