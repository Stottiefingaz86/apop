import type { KnowledgeCategory } from "@prisma/client";

export const KNOWLEDGE_CATEGORY_ORDER: KnowledgeCategory[] = [
  "DATA_API",
  "DATA_DUMP",
  "FIGMA_MCP",
  "KPI",
  "RESEARCH",
  "SURVEY",
  "OTHER",
];

export const KNOWLEDGE_CATEGORY_LABEL: Record<KnowledgeCategory, string> = {
  DATA_API: "Data & API",
  DATA_DUMP: "Data dump",
  FIGMA_MCP: "Figma / MCP",
  KPI: "KPIs & metrics",
  RESEARCH: "Research",
  SURVEY: "Surveys",
  OTHER: "Other",
};

export const KNOWLEDGE_CATEGORY_HELP: Record<KnowledgeCategory, string> = {
  DATA_API: "Public base URLs, schema notes, or how internal APIs relate to the product (no secrets — use env vars).",
  DATA_DUMP: "Pasted exports, CSV snippets, anonymized tables, or field dictionaries.",
  FIGMA_MCP: "File keys, team context, or how design tokens map to the product.",
  KPI: "North-star metrics, targets, and how you measure success.",
  RESEARCH: "User research summaries, competitive notes, or interview themes.",
  SURVEY: "Survey goals, question themes, or result summaries.",
  OTHER: "Anything else the team should treat as shared context.",
};
