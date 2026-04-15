import type { KnowledgeEntry } from "@prisma/client";
import { KNOWLEDGE_CATEGORY_LABEL } from "@/lib/domain/knowledge-categories";
import { formatIntegrationForAgentsBlock } from "@/lib/domain/knowledge-integration";
import { parseKnowledgeIntegrationMeta } from "@/lib/domain/knowledge-meta";

const MAX_TOTAL = 22_000;
const MAX_BODY = 2_800;
const MAX_EXTRACT = 4_500;

function referenceUrlFromMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const u = (meta as Record<string, unknown>).referenceUrl;
  if (typeof u !== "string") return "";
  const t = u.trim();
  if (!t.startsWith("http://") && !t.startsWith("https://")) return "";
  return t;
}

/**
 * Markdown-ish brief of workspace knowledge for agent prompts (truncated for tokens).
 */
export function formatKnowledgeEntriesForAgents(entries: KnowledgeEntry[]): string {
  if (!entries.length) return "";

  const chunks: string[] = [];
  let used = 0;

  for (const e of entries) {
    const label = KNOWLEDGE_CATEGORY_LABEL[e.category];
    const head = `### [${label}] ${e.title}\n`;
    const refUrl = referenceUrlFromMeta(e.meta);
    const refLine = refUrl
      ? `**Reference URL (stakeholder source — align insights with this material):** ${refUrl}\n`
      : "";
    const sum = e.summary ? `${e.summary}\n` : "";
    const body = (e.body ?? "").trim();
    const bodySlice = body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}…` : body;
    const ex = (e.attachmentExtract ?? "").trim();
    const exSlice = ex.length > MAX_EXTRACT ? `${ex.slice(0, MAX_EXTRACT)}…` : ex;
    const integRaw =
      e.meta && typeof e.meta === "object" && !Array.isArray(e.meta)
        ? (e.meta as { integration?: unknown }).integration
        : undefined;
    const integ = parseKnowledgeIntegrationMeta(integRaw);
    const integSlice = integ ? formatIntegrationForAgentsBlock(integ) : "";
    const block = [
      head,
      refLine,
      sum,
      integSlice ? `${integSlice}\n` : "",
      bodySlice ? `**Notes:**\n${bodySlice}\n` : "",
      exSlice ? `**From uploaded files:**\n${exSlice}\n` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (used + block.length > MAX_TOTAL) break;
    chunks.push(block);
    used += block.length;
  }

  const body = chunks.join("\n---\n");
  const preamble = [
    "## Workspace knowledge (org-wide)",
    "",
    "This bundle is **curated org truth** for researchers and PM-style agents. Use it for KPIs, constraints, research, surveys, integration hints, and **reference URLs** (journey maps, dashboards, docs).",
    "",
    "- Ground value analysis, design narrative, and PRD requirements in these themes when they apply.",
    "- If a feature idea **conflicts** with stated KPIs or research here, call that out explicitly.",
    "- **Reference URL** lines point to live pages; your primary evidence in-prompt is **notes**, **file extracts**, and any **Live fetch** section appended by the server (plain text excerpt when fetch succeeded).",
    "",
    "---",
    "",
  ].join("\n");

  return `${preamble}${body}`;
}
