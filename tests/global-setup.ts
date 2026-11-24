// Bring the test database up to the current migrations (non-destructive). Test files then empty the tables
// they use with resetDb() — only ever against WaterPortal_Test.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/database=WaterPortal_Test;/i.test(url)) throw new Error("TEST_DATABASE_URL must point at WaterPortal_Test");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
