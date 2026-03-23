import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";

function missingDesignQuestions(ctx: AgentContext): AgentQuestionsPayload {
  const d = ctx.designInputs;
  const q: AgentQuestionsPayload["questions"] = [];

  const hasTokens = (() => {
    const v = d.tokenJson;
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v as object).length > 0;
    return false;
  })();
  if (!hasTokens) {
    q.push({
      id: "theme_tokens",
      label: "Upload design token JSON (or paste in design inputs)",
      type: "file_or_json",
      required: true,
      reason: "Needed to define the visual system — agents must not invent tokens",
    });
  }
  if (!d.brandDescription?.trim()) {
    q.push({
      id: "brand_system",
      label: "Describe brand system (colors, typography voice, components)",
      type: "textarea",
      required: true,
      reason: "Cannot align UX to brand without explicit brand facts",
    });
  }
  if (!d.uxDirection?.trim()) {
    q.push({
      id: "ux_direction",
      label: "UX direction (e.g. premium, minimal, gamified)",
      type: "text",
      required: true,
      reason: "Motivational framing depends on declared direction",
    });
  }
  if (!d.competitorUrls?.length) {
    q.push({
      id: "competitors",
      label: "Competitor URLs (one per line)",
      type: "multi_url",
      required: false,
      reason: "Helps align UX patterns when provided",
    });
  }
  if (!d.figmaUrl?.trim()) {
    q.push({
      id: "figma",
      label: "Primary Figma file or frame URL",
      type: "url",
      required: false,
      reason: "Optional but recommended for build handoff",
    });
  }

  return { agent: "design-spec-agent", questions: q };
}

export const designSpecAgent: FeatureAgent = {
  name: "design-spec-agent",
  stages: ["DESIGN_SPEC"],
  async run(ctx): Promise<AgentRunResult> {
    const prd = ctx.artifactsByType.get(ARTIFACT_TYPES.PRD);
    if (!prd?.contentJson) {
      return {
        kind: "questions",
        payload: {
          agent: "design-spec-agent",
          questions: [
            {
              id: "prd_required",
              label: "Complete PRD stage and artifact before design spec",
              type: "textarea",
              required: true,
              reason: "Design must map to an existing PRD",
            },
          ],
        },
      };
    }

    const dq = missingDesignQuestions(ctx);
    const requiredMissing = dq.questions.filter((x) => x.required);
    if (requiredMissing.length > 0) {
      return { kind: "questions", payload: dq };
    }

    const d = ctx.designInputs;
    const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS)?.contentJson as
      | Record<string, unknown>
      | undefined;
    const octalysis = (value?.octalysisProfile as Record<string, number> | undefined) ?? {};

    const contentJson = {
      tokens: d.tokenJson,
      brand: d.brandDescription,
      uxDirection: d.uxDirection,
      figmaUrl: d.figmaUrl,
      competitorUrls: d.competitorUrls ?? [],
      screenshots: d.screenshots ?? [],
      octalysisAlignment: Object.entries(octalysis).map(([drive, weight]) => ({
        drive,
        weight,
        uxImplication:
          weight >= 4
            ? "Surface patterns that reinforce this motivational drive."
            : "Keep neutral; avoid heavy mechanics here unless PRD demands.",
      })),
      layoutPrinciples: [
        "Respect supplied tokens for spacing, color, and type scales only.",
        `Tone: ${d.uxDirection}`,
      ],
    };

    const md = [
      `# Design specification`,
      ``,
      `## Brand`,
      d.brandDescription ?? "",
      ``,
      `## UX direction`,
      d.uxDirection ?? "",
      ``,
      `## Tokens`,
      "`tokenJson` attached as structured data (see JSON artifact).",
      ``,
      `## Octalysis alignment`,
      ...contentJson.octalysisAlignment.map(
        (o: { drive: string; weight: number; uxImplication: string }) =>
          `- **${o.drive}** (${o.weight}): ${o.uxImplication}`,
      ),
      d.figmaUrl ? `\n## Figma\n${d.figmaUrl}` : "",
      (d.competitorUrls?.length ?? 0) > 0
        ? `\n## References\n${d.competitorUrls!.join("\n")}`
        : "",
    ].join("\n");

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.DESIGN_SPEC,
      contentJson,
      contentMarkdown: md,
      needsReview: true,
      nextStage: "READY_FOR_BUILD",
    };
  },
};
