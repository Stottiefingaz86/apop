import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import { composeShipBriefCore } from "@/lib/domain/ship-brief";

function missingPrereqQuestions(ctx: AgentContext): AgentQuestionsPayload {
  const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  const prd = ctx.artifactsByType.get(ARTIFACT_TYPES.PRD);
  const design = ctx.artifactsByType.get(ARTIFACT_TYPES.DESIGN_SPEC);
  const qs: AgentQuestionsPayload["questions"] = [];

  if (!value?.contentMarkdown?.trim()) {
    qs.push({
      id: "need_value",
      label: "Complete value analysis before ship brief",
      type: "textarea",
      required: true,
      reason: "Ship PRD needs the value artifact",
    });
  }
  if (!prd?.contentMarkdown?.trim()) {
    qs.push({
      id: "need_prd",
      label: "Complete Cursor prompt before ship brief",
      type: "textarea",
      required: true,
      reason: "Ship doc needs the Cursor prompt artifact (`prd` row)",
    });
  }
  if (!design?.contentMarkdown?.trim()) {
    qs.push({
      id: "need_design",
      label: "Complete design specification before ship brief",
      type: "textarea",
      required: true,
      reason: "Ship PRD needs the design spec",
    });
  }

  return { agent: "build-agent", questions: qs };
}

/** Synthesizes the consolidated Ship PRD (same structure as the live workspace composer). */
export const buildAgent: FeatureAgent = {
  name: "build-agent",
  stages: ["READY_FOR_BUILD", "IN_BUILD"],
  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
    const prd = ctx.artifactsByType.get(ARTIFACT_TYPES.PRD);
    const design = ctx.artifactsByType.get(ARTIFACT_TYPES.DESIGN_SPEC);

    if (
      !value?.contentMarkdown?.trim() ||
      !prd?.contentMarkdown?.trim() ||
      !design?.contentMarkdown?.trim()
    ) {
      return { kind: "questions", payload: missingPrereqQuestions(ctx) };
    }

    const { markdown, contentJson } = composeShipBriefCore({
      featureTitle: ctx.feature.title,
      featureDescription: ctx.feature.description,
      contextPack: ctx.contextPack,
      value,
      prd,
      design,
    });

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.SHIP_BRIEF,
      contentJson: {
        ...contentJson,
        savedByAgent: "build-agent",
      },
      contentMarkdown: markdown,
      /** Live doc is composed in the UI; this run stores a snapshot only. Stage moves via approvals / kanban. */
      needsReview: false,
    };
  },
};
