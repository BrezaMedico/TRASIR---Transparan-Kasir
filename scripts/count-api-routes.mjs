import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");

function collectRouteFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRouteFiles(full));
    } else if (entry.isFile() && entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

const files = collectRouteFiles(apiDir).sort();
const routes = files.map((filePath) => {
  const rel = path
    .relative(path.join(root, "src", "app"), filePath)
    .replace(/\\/g, "/")
    .replace(/\/route\.ts$/, "");
  return `/${rel}`;
});

const count = routes.length;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ count, routes }, null, 2));
} else {
  console.log(`Total API route handlers: ${count}`);
  for (const r of routes) {
    console.log(`  - ${r}`);
  }
}

if (process.argv.includes("--check-readme")) {
  const readmePath = path.join(root, "README.md");
  const readme = fs.readFileSync(readmePath, "utf8");
  const matches = [...readme.matchAll(/(?<![.\d])(\d+)\s+(?:Next\.js\s+)?Route Handlers/gi)];
  const mismatched = matches.filter((m) => Number(m[1]) !== count);
  if (matches.length === 0 || mismatched.length > 0) {
    console.error(
      `README.md route count mismatch! Expected ${count}, found: ${
        matches.map((m) => m[0]).join(", ") || "none"
      }`
    );
    process.exit(1);
  }
  console.log(`README.md verified: all route counts match (${count}).`);
}
