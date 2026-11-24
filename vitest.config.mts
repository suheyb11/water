import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/env.ts"],
    fileParallelism: false, // one shared test database
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
