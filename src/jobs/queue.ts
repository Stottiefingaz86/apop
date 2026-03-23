/**
 * Background job boundary — swap `enqueueFeatureRun` for BullMQ / Inngest / Supabase
 * functions while keeping `executeFeatureRun` as the single execution entrypoint.
 */
import type { FeatureStage } from "@prisma/client";
import type { AgentName } from "@/agents/types";
import { executeFeatureRun } from "@/jobs/execute-feature-run";

export type EnqueueFeatureRunPayload = {
  featureId: string;
  stage: FeatureStage;
  agentNameOverride?: AgentName;
};

export async function enqueueFeatureRun(payload: EnqueueFeatureRunPayload) {
  return executeFeatureRun(payload);
}
