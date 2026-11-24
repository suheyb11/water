// Bring the test database up to the current migrations (non-destructive). Test files then empty the tables
// they use with resetDb() — only ever against the test database (see test-db.ts).
import "dotenv/config";
import { isTestDbUrl } from "./test-db";
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!isTestDbUrl(url)) throw new Error("TEST_DATABASE_URL must point at a database named waterportal_test or use ?schema=test");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
