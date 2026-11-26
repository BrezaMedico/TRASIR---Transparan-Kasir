import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const prodSchemaPath = path.join(root, "prisma", "schema.prisma");
const testSchemaPath = path.join(root, "prisma", "schema.test.prisma");

const configuredUrl = process.env.TEST_DATABASE_URL?.trim() || "file:./test_isolated.db";
const isPostgres =
  configuredUrl.startsWith("postgres://") || configuredUrl.startsWith("postgresql://");

let schema = fs.readFileSync(prodSchemaPath, "utf8");

schema = schema.replace(
  /generator client \{[\s\S]*?\}/,
  `generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma-test-client"\n}`
);

schema = schema.replace(
  /datasource db \{[\s\S]*?\}/,
  isPostgres
    ? `datasource db {\n  provider  = "postgresql"\n  url       = env("TEST_DATABASE_URL")\n  directUrl = env("TEST_DATABASE_URL")\n}`
    : `datasource db {\n  provider = "sqlite"\n  url      = env("TEST_DATABASE_URL")\n}`
);

fs.writeFileSync(testSchemaPath, schema, "utf8");

const env = {
  ...process.env,
  TEST_DATABASE_URL: configuredUrl,
  DATABASE_URL: configuredUrl,
  DIRECT_URL: configuredUrl,
};

console.log(
  `[setup-test-db] Engine: ${isPostgres ? "PostgreSQL" : "SQLite (local fallback)"}`
);

execSync("npx prisma generate --schema=prisma/schema.test.prisma", {
  stdio: "inherit",
  env,
});

execSync(
  "npx prisma db push --schema=prisma/schema.test.prisma --force-reset --skip-generate --accept-data-loss",
  {
    stdio: "inherit",
    env,
  }
);

if (isPostgres) {
  const stockCheckSql = path.join(
    root,
    "prisma",
    "migrations",
    "20261126203000_product_stock_non_negative_check",
    "migration.sql"
  );
  if (fs.existsSync(stockCheckSql)) {
    execSync(
      `npx prisma db execute --schema=prisma/schema.test.prisma --file="${stockCheckSql}"`,
      {
        stdio: "inherit",
        env,
      }
    );
  }
}
