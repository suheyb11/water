import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL lives in .env (see .env.example). Switching database later = change `provider` in
// prisma/schema.prisma + the URL here + the adapter in src/server/db.ts, then create a fresh migration.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
