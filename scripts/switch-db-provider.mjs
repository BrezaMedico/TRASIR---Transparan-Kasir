import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!["postgresql", "sqlite"].includes(target)) {
  console.error("Usage: node scripts/switch-db-provider.mjs <postgresql|sqlite>");
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
let schema = fs.readFileSync(schemaPath, "utf8");

if (target === "postgresql") {
  schema = schema.replace(
    /datasource db \{[\s\S]*?\}/,
    `datasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}`
  );
} else {
  schema = schema.replace(
    /datasource db \{[\s\S]*?\}/,
    `datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}`
  );
}

fs.writeFileSync(schemaPath, schema, "utf8");
console.log(`Updated prisma/schema.prisma datasource provider to: ${target}`);

