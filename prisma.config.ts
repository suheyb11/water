import "dotenv/config";
import { defineConfig } from "prisma/config";

// The app connects with DATABASE_URL (Supabase pooler, port 6543). Prisma Migrate needs a direct/session
// connection (port 5432), so it uses DIRECT_URL when set. See .env.example.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
