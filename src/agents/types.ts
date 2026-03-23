import type { Feature, FeatureStage } from "@prisma/client";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import type { ContextPack } from "@/lib/domain/context-pack";

export type AgentName =
  | "value-analyst-agent"
  | "prd-writer-agent"
  | "design-spec-agent"
  | "build-agent"
  | "qa-agent";

export type AgentRunResult =
  | {
      kind: "questions";
      payload: AgentQuestionsPayload;
    }
  | {
      kind: "artifact";
      type: string;
      contentJson: Record<string, unknown>;
      contentMarkdown: string;
      /** When true, feature should enter awaiting_review */
      needsReview?: boolean;
      /** Advance feature stage after success (optional) */
      nextStage?: FeatureStage;
      /** Set numeric score on feature (value agent) */
      score?: number;
    }
  | {
      kind: "failed";
      error: string;
    };

export type AgentContext = {
  feature: Feature;
  contextPack: ContextPack;
  designInputs: {
    tokenJson: unknown | null;
    figmaUrl: string | null;
    competitorUrls: string[] | null;
    screenshots: string[] | null;
    notes: string | null;
    brandDescription: string | null;
    uxDirection: string | null;
  };
  /** Latest artifacts by type for downstream agents */
  artifactsByType: Map<string, { contentJson: unknown; contentMarkdown: string | null }>;
};

export type FeatureAgent = {
  name: AgentName;
  /** Pipeline stages this agent is allowed to execute */
  stages: FeatureStage[];
  run: (ctx: AgentContext) => Promise<AgentRunResult>;
};
