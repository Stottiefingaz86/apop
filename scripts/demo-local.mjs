#!/usr/bin/env node
/**
 * One-shot prep for a local demo: Docker Postgres + Prisma schema.
 * Warns if .env still points at a remote host (common demo failure).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const localHint =
  'postgresql://apop:apop@localhost:5432/apop?schema=public';

console.log("\n  APOP — local demo prep (Docker Postgres + tables)\n");

if (!fs.existsSync(envPath)) {
  console.log("  No .env yet. Run:  cp .env.example .env");
  console.log(`  Then set DATABASE_URL and DIRECT_URL to:\n    ${localHint}\n`);
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const dbLine = raw.split("\n").find((l) => /^\s*DATABASE_URL\s*=/.test(l)) ?? "";
const looksSupabase = /supabase\.co/i.test(dbLine);
const looksLocal =
  /localhost|127\.0\.0\.1/.test(dbLine) && /:5432/.test(dbLine);

if (looksSupabase || (!looksLocal && dbLine.length > 0)) {
  console.log("  ⚠️  DATABASE_URL does not look like local Docker Postgres.");
  if (looksSupabase) {
    console.log("     It still points at Supabase — Prisma will try the cloud host, not this machine.");
  }
  console.log("     For Docker demos, use the same value for DATABASE_URL and DIRECT_URL:\n");
  console.log(`       ${localHint}\n`);
  console.log("     (Comment out or remove the Supabase lines while demoing locally.)\n");
}

console.log("  → docker compose up -d");
console.log("  → prisma db push\n");

try {
  execSync("npm run setup:local", { cwd: root, stdio: "inherit" });
} catch {
  console.error("\n  demo:local failed — is Docker Desktop running?\n");
  process.exit(1);
}

console.log("\n  ✓ Done. Next:");
console.log("    npm run dev");
console.log("    Open the exact Local URL from the terminal (e.g. http://localhost:3002/pipeline)\n");
