import type { FeatureStage, FeatureStatus, RunStatus } from "@prisma/client";

/**
 * Run lifecycle (per stage execution)
 *
 * 1. pending — run row created, job not started
 * 2. running — agent executing; run_events appended
 * 3. completed | failed | cancelled — terminal; completedAt set
 *
 * Feature.status during a run:
 * - queued: job accepted
 * - running: agent active
 * - awaiting_input: agent emitted structured questions; work paused
 * - awaiting_review: agent produced artifact pending human gate
 * - idle: no active expectation (after completion or manual reset)
 */
export type RunLifecyclePhase = RunStatus;

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Maps pipeline stage → default agent responsible for that stage’s primary work. */
export const STAGE_DEFAULT_AGENT: Record<FeatureStage, string | null> = {
  INBOX: null,
  VALUE_REVIEW: "value-analyst-agent",
  REJECTED: null,
  PRD: "prd-writer-agent",
  DESIGN_SPEC: "design-spec-agent",
  READY_FOR_BUILD: "build-agent",
  IN_BUILD: "build-agent",
  QA: "qa-agent",
  DONE: null,
};

export function featureStatusForRunStart(): FeatureStatus {
  return "running";
}

export function featureStatusForQuestions(): FeatureStatus {
  return "awaiting_input";
}

export function featureStatusForArtifactReview(): FeatureStatus {
  return "awaiting_review";
}

export function featureStatusAfterSuccessfulRun(): FeatureStatus {
  return "idle";
}
