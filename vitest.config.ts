import { defineConfig } from "vitest/config";
import path from "node:path";

const resolvedTestDbUrl =
  process.env.TEST_DATABASE_URL?.trim() || "file:./test_isolated.db";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", ".agents"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      TEST_DATABASE_URL: resolvedTestDbUrl,
      DATABASE_URL: resolvedTestDbUrl,
      DIRECT_URL: resolvedTestDbUrl,
      PRISMA_DISABLE_POOLER_REWRITE: "true",
      RATE_LIMIT_ENABLED: "false",
      RATE_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
      RBAC_CACHE_DISABLED: "true",
      SESSION_REQUEST_CACHE_DISABLED: "true",
      EMAIL_TRANSPORT: "mock",
      EMAIL_DISABLE_DEV_ENV_FALLBACK: "true",
      GEMINI_MODE: "offline_stub",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@prisma/client": path.resolve(__dirname, "./node_modules/.prisma-test-client"),
    },
  },
});
