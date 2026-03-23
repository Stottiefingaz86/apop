import type { FeatureAgent, AgentRunResult } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

/** Placeholder — connect to test runners / human QA checklist. */
export const qaAgent: FeatureAgent = {
  name: "qa-agent",
  stages: ["QA"],
  async run(): Promise<AgentRunResult> {
    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.QA_PLACEHOLDER,
      contentJson: { message: "QA agent placeholder" },
      contentMarkdown: "## QA\n\n_QA agent is a placeholder in MVP._",
      needsReview: true,
      nextStage: "DONE",
    };
  },
};
