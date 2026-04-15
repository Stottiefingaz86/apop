#!/usr/bin/env node
/**
 * Prints what is missing or still placeholder in `.env`.
 * Does not print secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

const PLACEHOLDER =
  /YOUR_SUPABASE_DB_PASSWORD|PASTE_DB_PASSWORD_HERE|CHANGE_ME_DB_PASSWORD/i;

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

console.log("\n  APOP env check\n");

if (!fs.existsSync(envPath)) {
  console.log("  Missing file: .env");
  console.log("  Create it:  cp .env.example .env");
  console.log("  Then edit only the lines marked in .env.example (search PASTE_).\n");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const env = parseEnv(raw);

const issues = [];

const dbUrl = env.DATABASE_URL || "";
const directUrl = env.DIRECT_URL || "";
if (PLACEHOLDER.test(dbUrl) || PLACEHOLDER.test(directUrl)) {
  issues.push({
    var: "DATABASE_URL / DIRECT_URL",
    fix: "Replace PASTE_DB_PASSWORD_HERE with your Supabase database password (Dashboard → Project Settings → Database). Same password in both lines.",
  });
}

if (!env.DATABASE_URL) issues.push({ var: "DATABASE_URL", fix: "Set in .env (see .env.example)." });
if (!env.DIRECT_URL) issues.push({ var: "DIRECT_URL", fix: "Set in .env (same host as DATABASE_URL for Supabase direct)." });

const host = env.DATABASE_URL || "";
if (host.includes("supabase.co") && !env.NEXT_PUBLIC_SUPABASE_URL) {
  issues.push({
    var: "NEXT_PUBLIC_SUPABASE_URL",
    fix: "Optional for Prisma; add if you use Supabase client: https://<ref>.supabase.co",
  });
}

if (issues.length) {
  console.log("  Fix these in your project root file: .env\n");
  for (const i of issues) {
    console.log(`  • ${i.var}`);
    console.log(`    → ${i.fix}\n`);
  }
  console.log("  In Supabase: Project Settings → Database → copy connection URI or password.\n");
  process.exit(1);
}

console.log("  .env looks usable (no known placeholders in DATABASE_URL).");

if (/supabase\.co/i.test(dbUrl)) {
  console.log(
    "\n  Tip: Prisma is pointed at Supabase. For a local Docker demo, switch DATABASE_URL + DIRECT_URL to:",
  );
  console.log('    postgresql://apop:apop@localhost:5432/apop?schema=public');
  console.log("    Then: npm run db:up && npx prisma db push\n");
}

const hasOpenAI = Boolean((env.OPENAI_API_KEY || "").trim());
const hasAnthropic = Boolean((env.ANTHROPIC_API_KEY || "").trim());
if (!hasOpenAI && !hasAnthropic) {
  console.log("\n  Note: neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is set.");
  console.log("  → Value analysis will use local heuristics only (no GPT/Claude API usage / spend).");
  console.log("  → PRD and design agents are template-based and never call OpenAI.\n");
} else {
  console.log(
    `\n  LLM: OpenAI ${hasOpenAI ? "on" : "off"}, Anthropic ${hasAnthropic ? "on" : "off"} (value analyst only).\n`,
  );
}

console.log("  Next: npx prisma db push\n");
process.exit(0);
