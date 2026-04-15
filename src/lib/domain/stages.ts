import type { FeatureStage as PrismaFeatureStage } from "@prisma/client";

/**
 * Kanban columns only (no QA — unused in practice; legacy `QA` DB rows show under **Done**).
 * REJECTED is a terminal column, not sequential.
 */
export const PIPELINE_COLUMN_ORDER: PrismaFeatureStage[] = [
  "REJECTED",
  "INBOX",
  "VALUE_REVIEW",
  "DESIGN_SPEC",
  "PRD",
  "READY_FOR_BUILD",
  "IN_BUILD",
  "DONE",
];

const FEATURE_STAGE_SET = new Set<string>(
  [
    "INBOX",
    "VALUE_REVIEW",
    "REJECTED",
    "PRD",
    "DESIGN_SPEC",
    "READY_FOR_BUILD",
    "IN_BUILD",
    "QA",
    "DONE",
  ] as PrismaFeatureStage[],
);

/** Ensure a string is a valid Prisma FeatureStage before passing to prisma.feature.update. */
export function isFeatureStage(value: string): value is PrismaFeatureStage {
  return FEATURE_STAGE_SET.has(value);
}

/** Workspace + `/pipeline` stage filter (includes legacy QA so existing rows stay selectable). */
export const PIPELINE_STAGE_SELECT_ORDER: PrismaFeatureStage[] = [
  "REJECTED",
  "INBOX",
  "VALUE_REVIEW",
  "DESIGN_SPEC",
  "PRD",
  "READY_FOR_BUILD",
  "IN_BUILD",
  "QA",
  "DONE",
];

/** Map DB stage to the Kanban column that holds the card. */
export function kanbanColumnForDbStage(stage: PrismaFeatureStage): PrismaFeatureStage {
  return stage === "QA" ? "DONE" : stage;
}

/** Stage stored on the card JSON (drag/drop PATCH target). */
export function kanbanCardStageForDbStage(stage: PrismaFeatureStage): PrismaFeatureStage {
  return stage === "QA" ? "DONE" : stage;
}

export const FEATURE_STAGE_LABEL: Record<PrismaFeatureStage, string> = {
  INBOX: "Inbox",
  VALUE_REVIEW: "Research Analysis",
  REJECTED: "Rejected",
  /** UX / tokens / brand — before the implementation prompt. */
  DESIGN_SPEC: "Design",
  /** Final handoff: concise prompt for Cursor (stored as `prd` artifact). */
  PRD: "Cursor prompt",
  READY_FOR_BUILD: "Ready for build",
  IN_BUILD: "In build",
  QA: "QA",
  DONE: "Done",
};

/** Default forward transitions (manual advance + agent completion). */
export const DEFAULT_STAGE_FLOW: Partial<
  Record<PrismaFeatureStage, PrismaFeatureStage | null>
> = {
  INBOX: "VALUE_REVIEW",
  VALUE_REVIEW: "DESIGN_SPEC",
  DESIGN_SPEC: "PRD",
  PRD: "READY_FOR_BUILD",
  READY_FOR_BUILD: "IN_BUILD",
  IN_BUILD: "DONE",
  QA: "DONE",
};
