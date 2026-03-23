import type { FeatureStage as PrismaFeatureStage } from "@prisma/client";

/** Ordered pipeline columns for Kanban (REJECTED is a terminal column, not sequential). */
export const PIPELINE_COLUMN_ORDER: PrismaFeatureStage[] = [
  "INBOX",
  "VALUE_REVIEW",
  "REJECTED",
  "PRD",
  "DESIGN_SPEC",
  "READY_FOR_BUILD",
  "IN_BUILD",
  "QA",
  "DONE",
];

export const FEATURE_STAGE_LABEL: Record<PrismaFeatureStage, string> = {
  INBOX: "Inbox",
  VALUE_REVIEW: "Value review",
  REJECTED: "Rejected",
  PRD: "PRD",
  DESIGN_SPEC: "Design spec",
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
  VALUE_REVIEW: "PRD",
  PRD: "DESIGN_SPEC",
  DESIGN_SPEC: "READY_FOR_BUILD",
  READY_FOR_BUILD: "IN_BUILD",
  IN_BUILD: "QA",
  QA: "DONE",
};
