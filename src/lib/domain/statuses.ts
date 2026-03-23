import type { FeatureStatus as PrismaFeatureStatus } from "@prisma/client";

export const FEATURE_STATUS_LABEL: Record<PrismaFeatureStatus, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  awaiting_input: "Awaiting input",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  blocked: "Blocked",
};

export const TERMINAL_FEATURE_STATUSES: PrismaFeatureStatus[] = [
  "rejected",
  "failed",
];
