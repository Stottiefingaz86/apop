import type { FeatureAgent, AgentRunResult } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";

function questions(): AgentQuestionsPayload {
  return {
    agent: "prd-writer-agent",
    questions: [
      {
        id: "value_artifact",
        label: "Run the value analyst and complete required context first",
        type: "textarea",
        required: true,
        reason: "PRD must trace to an approved value analysis artifact",
      },
    ],
  };
}

export const prdWriterAgent: FeatureAgent = {
  name: "prd-writer-agent",
  stages: ["PRD"],
  async run(ctx): Promise<AgentRunResult> {
    const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
    if (!value?.contentJson || typeof value.contentJson !== "object") {
      return { kind: "questions", payload: questions() };
    }

    const v = value.contentJson as Record<string, unknown>;
    if (!v.primaryKpi || !v.audience) {
      return { kind: "questions", payload: questions() };
    }

    const cp = ctx.contextPack;
    const contentJson = {
      title: ctx.feature.title,
      problem: ctx.feature.description,
      goals: {
        primaryKpi: v.primaryKpi,
        secondaryKpis: v.secondaryKpis ?? cp.secondaryKpis ?? [],
      },
      users: v.audience,
      scope: {
        inScope: [cp.productArea ?? "As defined in context pack"],
        outOfScope: ["Anything not backed by value analysis or explicit approval"],
      },
      requirements: [
        {
          id: "R1",
          priority: "P0",
          text: `Deliver measurable movement on ${String(v.primaryKpi)} for ${String(v.audience)}.`,
        },
        {
          id: "R2",
          priority: "P1",
          text: "Preserve constraints and strategic priority stated in value analysis / context pack.",
        },
      ],
      successMetrics: [String(v.primaryKpi)],
      risks: cp.constraints
        ? [{ text: `Constraint surface: ${cp.constraints}` }]
        : [],
      openQuestions: [],
    };

    const md = [
      `# PRD: ${ctx.feature.title}`,
      ``,
      `## Context`,
      ctx.feature.description || "_No description provided._",
      ``,
      `## Goals`,
      `- **Primary KPI:** ${String(v.primaryKpi)}`,
      ``,
      `## Users`,
      String(v.audience),
      ``,
      `## Requirements`,
      ...((contentJson.requirements as { id: string; priority: string; text: string }[]).map(
        (r) => `- **${r.id} (${r.priority})** ${r.text}`,
      )),
      ``,
      `## Success metrics`,
      ...contentJson.successMetrics.map((m: string) => `- ${m}`),
      cp.constraints ? `\n## Constraints\n${cp.constraints}` : "",
    ].join("\n");

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.PRD,
      contentJson,
      contentMarkdown: md,
      needsReview: true,
      nextStage: "DESIGN_SPEC",
    };
  },
};
