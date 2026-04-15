import type { KnowledgeEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tryFetchReferenceUrlPreview } from "@/lib/knowledge/fetch-reference-url-preview";
import { formatKnowledgeEntriesForAgents } from "@/lib/domain/workspace-knowledge-brief";

const MAX_FETCH_SECTION_CHARS = 12_000;
const MAX_ENTRIES_TO_FETCH = 5;

function referenceUrlFromEntry(e: KnowledgeEntry): string | null {
  const m = e.meta;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const u = (m as Record<string, unknown>).referenceUrl;
  if (typeof u !== "string") return null;
  const t = u.trim();
  return t.startsWith("https://") ? t : null;
}

/**
 * Loads recent knowledge entries and formats a single string for LLM context.
 * Optionally appends server-fetched plain-text excerpts from HTTPS reference URLs (safe hosts only).
 */
export async function loadWorkspaceKnowledgeBriefForAgents(): Promise<string | null> {
  const rows = await prisma.knowledgeEntry.findMany({
    orderBy: { updatedAt: "desc" },
    take: 35,
  });
  const base = formatKnowledgeEntriesForAgents(rows).trim();
  if (!base) return null;

  const fetchChunks: string[] = [];
  let budget = MAX_FETCH_SECTION_CHARS;
  let n = 0;
  for (const e of rows) {
    if (n >= MAX_ENTRIES_TO_FETCH) break;
    const url = referenceUrlFromEntry(e);
    if (!url) continue;
    n++;
    const preview = await tryFetchReferenceUrlPreview(url);
    if (!preview) continue;
    const chunk = `### Live fetch: ${e.title}\n**URL:** ${url}\n\n${preview}\n`;
    if (chunk.length > budget) break;
    fetchChunks.push(chunk);
    budget -= chunk.length;
  }

  const fetchSection =
    fetchChunks.length > 0
      ? `\n---\n## Reference pages (server-fetched excerpts)\nPlain text pulled from HTTPS reference URLs when allowed. Use together with notes above; pages may change.\n\n${fetchChunks.join("\n---\n")}`
      : "";

  const combined = `${base}${fetchSection}`.trim();
  const cap = 34_000;
  return combined.length > cap ? `${combined.slice(0, cap)}\n\n…[knowledge brief truncated]` : combined;
}

export async function loadWorkspaceKnowledgeBriefSafe(): Promise<string | null> {
  try {
    return await loadWorkspaceKnowledgeBriefForAgents();
  } catch {
    return null;
  }
}
