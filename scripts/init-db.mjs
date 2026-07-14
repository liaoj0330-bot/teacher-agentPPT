import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

process.env.DATABASE_URL ||= "file:./dev.db";

const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start Prisma: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Database initialization failed with exit code ${result.status ?? "unknown"}.`);
  process.exit(result.status || 1);
}

console.log("Local database is synchronized with prisma/schema.prisma.");
