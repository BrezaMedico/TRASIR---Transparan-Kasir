import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", ".agents"],
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: "file:./test_isolated.db",
      DATABASE_URL: "file:./test_isolated.db",
      DIRECT_URL: "file:./test_isolated.db",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@prisma/client": path.resolve(__dirname, "./node_modules/.prisma-test-client"),
    },
  },
});
