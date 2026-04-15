import { z } from "zod";

export const prdRoadmapLaneSchema = z.enum([
  "SPORTS",
  "CASINO",
  "MARKETING",
  "PAM",
  "UNCATEGORIZED",
]);

export const prdRequirementLlmSchema = z.object({
  id: z.string(),
  priority: z.enum(["P0", "P1", "P2"]),
  text: z.string(),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
});

export const prdCursorHandoffSchema = z.object({
  implementationChecklist: z.array(z.string()),
  suggestedFilesOrRoutes: z.array(z.string()),
  dependenciesNotes: z.string(),
});

/** User / job stories the builder must satisfy (distinct from P0 requirements). */
export const prdUseCaseLlmSchema = z.object({
  id: z.string(),
  title: z.string(),
  actor: z.string(),
  situation: z.string(),
  mainFlow: z.array(z.string()).min(1).max(12),
  expectedOutcome: z.string(),
});

export const prdLlmResponseSchema = z.object({
  title: z.string(),
  problem: z.string(),
  goals: z.object({
    primaryKpi: z.string(),
    secondaryKpis: z.array(z.string()),
  }),
  users: z.string(),
  scope: z.object({
    inScope: z.array(z.string()),
    outOfScope: z.array(z.string()),
  }),
  requirements: z.array(prdRequirementLlmSchema).min(1).max(8),
  successMetrics: z.array(z.string()).min(1),
  risks: z.array(z.object({ text: z.string() })).default([]),
  openQuestions: z.array(z.string()).default([]),
  cursorHandoff: prdCursorHandoffSchema,
  valueHypothesis: z
    .string()
    .describe(
      "One paragraph: what outcome we expect if this ships (directional, not a financial guarantee)",
    ),
  /** Concrete scenarios: happy path + at least one edge or failure path. */
  useCases: z.array(prdUseCaseLlmSchema).min(2).max(6),
  /** BA/PM swimlane on the org roadmap — infer from title, description, KPI, audience, design, and product area. */
  roadmapLane: prdRoadmapLaneSchema.optional(),
  markdownBody: z.string().optional(),
});

export type PrdLlmParsed = z.infer<typeof prdLlmResponseSchema>;

/** Stored PRD JSON may omit `useCases` (legacy) or be edited down to zero in the UI. */
export const prdStoredForMarkdownSchema = prdLlmResponseSchema
  .omit({ useCases: true })
  .extend({
    useCases: z.array(prdUseCaseLlmSchema).optional().default([]),
  });

export type PrdForMarkdown = z.infer<typeof prdStoredForMarkdownSchema>;

export function tryPrdMarkdownFromContentJson(
  contentJson: Record<string, unknown>,
  titleFallback: string,
): string | null {
  const parsed = prdStoredForMarkdownSchema.safeParse(contentJson);
  if (!parsed.success) return null;
  return prdMarkdownFromJson(parsed.data, titleFallback);
}

export function prdMarkdownFromJson(
  p: PrdForMarkdown,
  titleFallback: string,
): string {
  const lines: string[] = [
    `# Cursor — ${p.title || titleFallback}`,
    "",
    "_Implementation brief — paste into Cursor. Scope is fixed; do not gold-plate._",
    "",
    "## Build",
    p.problem,
    "",
    "## Outcome / users",
    `- **KPI:** ${p.goals.primaryKpi}`,
    ...(p.goals.secondaryKpis?.length
      ? [`- **Also:** ${p.goals.secondaryKpis.join("; ")}`]
      : []),
    `- **Who:** ${p.users}`,
    "",
  ];
  if (p.useCases.length > 0) {
    lines.push("## User cases");
    for (const uc of p.useCases) {
      lines.push(
        "",
        `### ${uc.id}: ${uc.title}`,
        `- **Actor:** ${uc.actor}`,
        `- **Situation:** ${uc.situation}`,
        "- **Main flow:**",
        ...uc.mainFlow.map((step, i) => `  ${i + 1}. ${step}`),
        `- **Expected outcome:** ${uc.expectedOutcome}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## Why (directional)",
    p.valueHypothesis,
    "",
    "## Scope",
    "**In:**",
    ...p.scope.inScope.map((s) => `- ${s}`),
    "**Out:**",
    ...p.scope.outOfScope.map((s) => `- ${s}`),
    "",
    "## Requirements",
    ...p.requirements.map(
      (r) =>
        `- **${r.id} (${r.priority})** ${r.text}${
          r.acceptanceCriteria?.length
            ? `\n  - ${r.acceptanceCriteria.join("; ")}`
            : ""
        }`,
    ),
    "",
    "## Success",
    ...p.successMetrics.map((m) => `- ${m}`),
  );
  if (p.risks.length) {
    lines.push("", "## Risks", ...p.risks.map((r) => `- ${r.text}`));
  }
  if (p.openQuestions.length) {
    lines.push("", "## Open questions", ...p.openQuestions.map((q) => `- ${q}`));
  }
  lines.push(
    "",
    "## Roadmap",
    `- **Lane:** ${p.roadmapLane ?? "UNCATEGORIZED"} (org swimlane; set by PRD / BA)`,
    "",
    "## Handoff",
    ...p.cursorHandoff.implementationChecklist.map((x) => `- [ ] ${x}`),
    "",
    "**Files / routes:**",
    ...p.cursorHandoff.suggestedFilesOrRoutes.map((x) => `- ${x}`),
    "",
    "**Integration:**",
    p.cursorHandoff.dependenciesNotes,
  );
  return lines.filter(Boolean).join("\n");
}

export type PrdUseCase = z.infer<typeof prdUseCaseLlmSchema>;

export function emptyPrdUseCase(id: string): PrdUseCase {
  return {
    id,
    title: "",
    actor: "",
    situation: "",
    mainFlow: [""],
    expectedOutcome: "",
  };
}

/** Read use cases from stored PRD JSON for editing (tolerates legacy / partial rows). */
export function coercePrdUseCasesFromContentJson(contentJson: unknown): PrdUseCase[] {
  const root =
    contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
      ? (contentJson as Record<string, unknown>)
      : null;
  const raw = root?.useCases;
  if (!Array.isArray(raw)) return [];
  const out: PrdUseCase[] = [];
  let n = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    n += 1;
    const flowRaw = o.mainFlow;
    const mainFlow = Array.isArray(flowRaw)
      ? flowRaw.filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : `UC${n}`,
      title: typeof o.title === "string" ? o.title : "",
      actor: typeof o.actor === "string" ? o.actor : "",
      situation: typeof o.situation === "string" ? o.situation : "",
      mainFlow: mainFlow.length > 0 ? mainFlow : [""],
      expectedOutcome: typeof o.expectedOutcome === "string" ? o.expectedOutcome : "",
    });
  }
  return out;
}

export function nextPrdUseCaseId(existing: PrdUseCase[]): string {
  const nums = existing
    .map((u) => /^UC(\d+)$/i.exec(u.id.trim())?.[1])
    .filter((x): x is string => !!x)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `UC${max + 1}`;
}

/** Normalize editor rows for JSON + markdown rebuild. Drops blank rows. */
export function normalizePrdUseCasesForSave(rows: PrdUseCase[]): PrdUseCase[] {
  const cleaned: PrdUseCase[] = [];
  for (const row of rows) {
    const title = row.title.trim();
    const actor = row.actor.trim();
    const situation = row.situation.trim();
    const expectedOutcome = row.expectedOutcome.trim();
    const mainFlow = row.mainFlow.map((s) => s.trim()).filter(Boolean);
    if (!title && !situation && !expectedOutcome && mainFlow.length === 0 && !actor) continue;
    const id = row.id.trim() || nextPrdUseCaseId(cleaned);
    cleaned.push({
      id,
      title: title || "Untitled use case",
      actor: actor || "—",
      situation: situation || "—",
      mainFlow: mainFlow.length > 0 ? mainFlow : ["—"],
      expectedOutcome: expectedOutcome || "—",
    });
  }
  return cleaned;
}
