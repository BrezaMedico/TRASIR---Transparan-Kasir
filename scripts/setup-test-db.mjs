import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const prodSchemaPath = path.join(root, "prisma", "schema.prisma");
const testSchemaPath = path.join(root, "prisma", "schema.test.prisma");

let schema = fs.readFileSync(prodSchemaPath, "utf8");

schema = schema.replace(
  /generator client \{[\s\S]*?\}/,
  `generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma-test-client"\n}`
);

schema = schema.replace(
  /datasource db \{[\s\S]*?\}/,
  `datasource db {\n  provider = "sqlite"\n  url      = env("TEST_DATABASE_URL")\n}`
);

fs.writeFileSync(testSchemaPath, schema, "utf8");

const env = {
  ...process.env,
  TEST_DATABASE_URL: "file:./test_isolated.db",
};

execSync("npx prisma generate --schema=prisma/schema.test.prisma", {
  stdio: "inherit",
  env,
});

execSync("npx prisma db push --schema=prisma/schema.test.prisma --force-reset --skip-generate", {
  stdio: "inherit",
  env,
});

