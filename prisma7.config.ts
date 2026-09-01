import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations and introspection must bypass the connection pooler: Supavisor
    // runs in transaction mode, which cannot hold the session-level locks and
    // prepared statements DDL needs. DIRECT_URL is the port-5432 string.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
