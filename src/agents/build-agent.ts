import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

/** Placeholder — enqueue real build jobs here. */
export const buildAgent: FeatureAgent = {
  name: "build-agent",
  stages: ["READY_FOR_BUILD", "IN_BUILD"],
  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const next = ctx.feature.stage === "READY_FOR_BUILD" ? "IN_BUILD" : "QA";
    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.BUILD_PLACEHOLDER,
      contentJson: { message: "Build agent not wired — design for CI / worker execution." },
      contentMarkdown: "## Build\n\n_Build agent is a placeholder in MVP._",
      needsReview: true,
      nextStage: next,
    };
  },
};
