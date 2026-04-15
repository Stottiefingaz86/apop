import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { inferOctalysisWeightsFromCopy } from "@/lib/domain/infer-octalysis";
import { OCTALYSIS_DRIVES } from "@/lib/domain/octalysis";
import { runValueAnalysisWithAnthropic } from "@/lib/llm/value-analyst-llm";
import { runValueAnalysisWithOpenAI } from "@/lib/llm/value-analyst-openai";
import { buildValueAnalysisMarkdown } from "@/lib/llm/value-analyst-markdown";

/**
 * Fills missing context-pack fields so the analyst can run without blocking questions.
 * The model is instructed to infer specifics from title + description.
 */
function augmentContextForAutoValue(ctx: AgentContext): AgentContext {
  const c = ctx.contextPack;
  const title = ctx.feature.title?.trim() || "Untitled feature";
  const desc = (ctx.feature.description ?? "").trim();

  const productArea =
    c.productArea?.trim() ||
    (title.length > 72 ? `${title.slice(0, 69)}…` : title) ||
    "Product surface (inferred from feature)";

  const targetAudience =
    c.targetAudience?.trim() ||
    (desc
      ? "Audience and journeys implied by the feature description — refine in context pack anytime."
      : "End users of this product; infer personas and segments from the title and description.");

  const primaryKpi =
    c.primaryKpi?.trim() ||
    "Engagement, conversion, retention, and trust — infer concrete KPIs from the idea (no separate form required).";

  return {
    ...ctx,
    contextPack: {
      ...c,
      productArea,
      targetAudience,
      primaryKpi,
    },
  };
}

export const valueAnalystAgent: FeatureAgent = {
  name: "value-analyst-agent",
  stages: ["VALUE_REVIEW"],
  async run(ctx): Promise<AgentRunResult> {
    const runCtx = augmentContextForAutoValue(ctx);
    const c = runCtx.contextPack;

    const llm =
      (await runValueAnalysisWithOpenAI(runCtx)) ?? (await runValueAnalysisWithAnthropic(runCtx));
    if (llm) {
      return {
        kind: "artifact",
        type: ARTIFACT_TYPES.VALUE_ANALYSIS,
        contentJson: llm.contentJson,
        contentMarkdown: llm.contentMarkdown,
        needsReview: true,
        nextStage: "VALUE_REVIEW",
        score: llm.score,
      };
    }

    console.warn(
      "[apop] value-analyst: heuristic value analysis only (no billable LLM call). " +
        "Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in .env, restart next dev, and ensure context pack is complete. " +
        "GET /api/health shows llmForValueAnalysis.",
    );

    const profileRecord = inferOctalysisWeightsFromCopy(
      ctx.feature.title,
      ctx.feature.description,
      c.primaryKpi,
      c.targetAudience,
      c.strategicPriority,
    );
    const profile: Record<string, number> = {};
    for (const d of OCTALYSIS_DRIVES) {
      profile[d] = profileRecord[d];
    }

    const completeness =
      [c.secondaryKpis?.length, c.constraints, c.strategicPriority].filter(Boolean).length;
    /** How much copy deviates from generic template (more specific ideas → wider band). */
    const desc = (ctx.feature.description ?? "").trim();
    const title = (ctx.feature.title ?? "").trim();
    const combinedLen = title.length + desc.length;
    const specificity = Math.min(3, Math.floor(combinedLen / 120));
    const driveEnergy = OCTALYSIS_DRIVES.reduce(
      (s, d) => s + Math.max(0, profile[d] - 2),
      0,
    );
    const score = Math.min(
      10,
      Math.max(
        2,
        Math.round(3.5 + driveEnergy * 0.22 + specificity * 0.6 + completeness * 0.85),
      ),
    );

    const heuristicNote =
      "Behavioral driver weights inferred from feature copy (heuristic fallback when no LLM).";
    const heuristicParsed = {
      summary: `Value assessment for "${ctx.feature.title}" in ${c.productArea}.`,
      audience: c.targetAudience ?? "",
      primaryKpi: c.primaryKpi ?? "",
      secondaryKpis: c.secondaryKpis ?? [],
      strategicPriority: c.strategicPriority ?? null,
      constraints: c.constraints ?? null,
      businessScore: score,
      note: heuristicNote,
      competitorAnalysis:
        "Compare to reference operators (Stake, FanDuel, DraftKings, Bovada, bet365, Roobet) once LLM is enabled. Heuristic cannot perform competitor analysis.",
      effortEstimate: "Cursor will build; complexity TBD. Typically ~20 mins for simple, longer for complex — run value analysis with LLM for estimate.",
      riceScore: {
        reach: Math.min(10, Math.max(1, Math.round(5 + specificity))),
        impact: Math.min(10, Math.max(1, Math.round(score * 0.8))),
        confidence: 0.5,
        effort: Math.min(10, Math.max(1, Math.round(6 - specificity))),
      },
      valueRationale:
        "Inferred from primary KPI and context. Enable LLM for a concrete value rationale.",
    };

    const contentJson = {
      ...heuristicParsed,
      octalysisProfile: profile,
      provider: "heuristic",
      valueAnalysisSource: "heuristic",
      inferredContextNote:
        "Some context fields were auto-filled from the title/description so analysis could run without a form.",
    };

    const apiBanner = [
      `> **Not ChatGPT / API:** No \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` was available to this server, so this run uses a **local keyword heuristic** (score + drivers), not an LLM. **ChatGPT Plus is separate from the OpenAI API** — add an API key in \`.env\`, restart \`npm run dev\`, and re-run value analysis for real model output. Check \`/api/health\` for \`llmForValueAnalysis\`.`,
      ``,
    ].join("\n");

    const apiFooter = `\n\n---\n_Heuristic value analysis (no LLM). Set \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` for AI value analysis — see \`/api/health\`._`;

    const md =
      apiBanner +
      buildValueAnalysisMarkdown(heuristicParsed, profile, apiFooter);

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.VALUE_ANALYSIS,
      contentJson,
      contentMarkdown: md,
      needsReview: true,
      nextStage: "VALUE_REVIEW",
      score,
    };
  },
};
