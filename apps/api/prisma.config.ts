// Prisma 7 CLI configuration — the connection URL moved out of schema.prisma (see the datasource
// block there) into this file for Migrate/CLI use; the runtime client gets its URL via the pg
// driver adapter in src/prisma/prisma.service.ts.
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env. Node 22's loadEnvFile covers local dev (pnpm migrate:dev /
// db:seed from apps/api with a .env present); CI and production set DATABASE_URL directly.
try {
  process.loadEnvFile();
} catch {
  // No .env file — fine everywhere the URL comes from the real environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
