import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import type { OctalysisDrive } from "@/lib/domain/octalysis";
import { OCTALYSIS_DRIVES } from "@/lib/domain/octalysis";

function buildQuestions(ctx: AgentContext): AgentQuestionsPayload {
  const c = ctx.contextPack;
  const qs: AgentQuestionsPayload["questions"] = [];

  if (!c.productArea?.trim()) {
    qs.push({
      id: "product_area",
      label: "What product area or module does this feature belong to?",
      type: "text",
      required: true,
      reason: "Cannot assess value without scope",
    });
  }
  if (!c.targetAudience?.trim()) {
    qs.push({
      id: "target_audience",
      label: "Who is the primary target audience?",
      type: "textarea",
      required: true,
      reason: "Value analysis requires an explicit audience — do not guess personas",
    });
  }
  if (!c.primaryKpi?.trim()) {
    qs.push({
      id: "primary_kpi",
      label: "What is the primary KPI or success metric?",
      type: "text",
      required: true,
      reason: "Agents must not invent KPIs; you must supply the north-star metric",
    });
  }

  if (!c.strategicPriority?.trim()) {
    qs.push({
      id: "strategic_priority",
      label: "Strategic priority (e.g. revenue, retention, compliance)",
      type: "text",
      required: false,
      reason: "Improves prioritization framing",
    });
  }

  if (!c.octalysisFocus?.length) {
    qs.push({
      id: "octalysis_focus",
      label: "Which Octalysis drives should we emphasize? (comma-separated)",
      type: "textarea",
      required: false,
      reason: "Without explicit focus, Octalysis profile stays unweighted",
    });
  }

  return {
    agent: "value-analyst-agent",
    questions: qs.length ? qs : [
      {
        id: "context_unknown",
        label: "Provide any missing context fields above",
        type: "textarea",
        required: true,
        reason: "Validation fallback",
      },
    ],
  };
}

function parseOctalysisFocus(raw: string[] | undefined): OctalysisDrive[] {
  if (!raw?.length) return [];
  const set = new Set(OCTALYSIS_DRIVES);
  return raw
    .flatMap((s) => s.split(/[,;\n]+/))
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter((p): p is OctalysisDrive => set.has(p as OctalysisDrive));
}

export const valueAnalystAgent: FeatureAgent = {
  name: "value-analyst-agent",
  stages: ["VALUE_REVIEW"],
  async run(ctx): Promise<AgentRunResult> {
    const c = ctx.contextPack;
    if (!c.productArea?.trim() || !c.targetAudience?.trim() || !c.primaryKpi?.trim()) {
      return { kind: "questions", payload: buildQuestions(ctx) };
    }

    const drives = parseOctalysisFocus(c.octalysisFocus);

    const profile: Record<string, number> = {};
    for (const d of OCTALYSIS_DRIVES) {
      if (drives.length === 0) {
        profile[d] = 2;
      } else if (drives.includes(d)) {
        profile[d] = 4;
      } else {
        profile[d] = 2;
      }
    }

    const completeness =
      [c.secondaryKpis?.length, c.constraints, c.strategicPriority].filter(Boolean).length;
    const score = Math.min(10, 6 + completeness);

    const contentJson = {
      summary: `Value assessment for "${ctx.feature.title}" in ${c.productArea}.`,
      audience: c.targetAudience,
      primaryKpi: c.primaryKpi,
      secondaryKpis: c.secondaryKpis ?? [],
      strategicPriority: c.strategicPriority ?? null,
      constraints: c.constraints ?? null,
      businessScore: score,
      octalysisProfile: profile,
      note:
        drives.length === 0
          ? "Octalysis scores use a neutral baseline until you list drives in context.octalysisFocus."
          : "Emphasis applied only to drives you listed; other drives kept at baseline.",
    };

    const md = [
      `## Value analysis`,
      ``,
      `**Product area:** ${c.productArea}`,
      `**Audience:** ${c.targetAudience}`,
      `**Primary KPI:** ${c.primaryKpi}`,
      c.secondaryKpis?.length
        ? `**Secondary KPIs:** ${c.secondaryKpis.join(", ")}`
        : "",
      c.strategicPriority ? `**Strategic priority:** ${c.strategicPriority}` : "",
      c.constraints ? `**Constraints:** ${c.constraints}` : "",
      ``,
      `### Business score`,
      `${score} / 10 (completeness-weighted; not a market forecast)`,
      ``,
      `### Octalysis profile`,
      drives.length
        ? `Emphasis on: ${drives.join(", ")}`
        : `_Supply \`octalysisFocus\` in the context pack to weight drives explicitly._`,
      ``,
      "| Drive | Weight |",
      "|---|---:|",
      ...OCTALYSIS_DRIVES.map((d) => `| ${d.replace(/_/g, " ")} | ${profile[d]} |`),
    ]
      .filter(Boolean)
      .join("\n");

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.VALUE_ANALYSIS,
      contentJson,
      contentMarkdown: md,
      needsReview: true,
      nextStage: "PRD",
      score,
    };
  },
};
