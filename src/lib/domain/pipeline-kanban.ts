import type { FeatureStage, FeatureStatus } from "@prisma/client";
import type { PipelineCardVisualState } from "@/lib/domain/pipeline-card-state";

/** Serializable Kanban card — safe for JSON API + RSC props */
export type PipelineKanbanCard = {
  id: string;
  /** Pipeline column — used for contextual hints (e.g. Vercel footer on In build) */
  stage: FeatureStage;
  title: string;
  description: string;
  status: FeatureStatus;
  score: number | null;
  /** Value + PRD + design artifacts present — Cursor handoff can run */
  cursorImplementationReady: boolean;
  /** Latest agent log line (APOP run or Cursor job status) */
  commentaryLine: string | null;
  /** First Cursor launch on this feature (no job, or only failed jobs cleared) */
  cursorStartEligible: boolean;
  /** Last Cursor job failed — offer retry */
  cursorRetryEligible: boolean;
  /** Signed off + Ship PRD + `VERCEL_DEPLOY_HOOK_URL` — Deploy on card */
  deployFromKanbanEligible: boolean;
  /** Latest Cursor job still running (drives client poll) */
  cursorJobInProgress: boolean;
  /** Short Vercel deployment summary for the card footer */
  vercelLine: string | null;
  /** When true, board poll should keep ticking so Vercel rows can update (requires server token + project id) */
  vercelSyncDesired: boolean;
  /** Cursor job already fired Vercel deploy hook (release row may still be linking) */
  cursorDeployTriggered: boolean;
  /** Cursor Cloud agent URL when a job exists — shown as “Agent dashboard” on the card */
  cursorAgentDashboardUrl: string | null;
} & PipelineCardVisualState;
