import type {
  Approval,
  CursorAgentJob,
  FeatureStage,
  Release,
  Run,
  RunEvent,
} from "@prisma/client";
import { FEATURE_STAGE_LABEL } from "@/lib/domain/stages";
import { deploymentWhereLine } from "@/lib/vercel/deployment-display";

const RELEASE_STATUS_LABEL: Record<Release["status"], string> = {
  pending: "Pending",
  building: "Building",
  ready: "Ready",
  error: "Failed",
  canceled: "Canceled",
};

function agentShort(raw: string): string {
  return raw.replace(/-agent$/i, "").replace(/-/g, " ");
}

function truncate(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type ActivityTimelineKind = "agent" | "cursor" | "deploy" | "approval";

export type ActivityTimelineRow = {
  id: string;
  timestamp: Date;
  label: string;
  message: string;
  kind: ActivityTimelineKind;
};

export type ActivityTimelineInput = {
  runs: (Run & { events: RunEvent[] })[];
  cursorAgentJobs?: CursorAgentJob[];
  releases?: Release[];
  approvals?: Approval[];
};

/**
 * Merges a live-updated Cursor job row (client poll) over the matching DB row.
 */
export function mergeCursorJobForTimeline<T extends { cursorAgentJobs?: CursorAgentJob[] | null }>(
  feature: T,
  liveJob: CursorAgentJob | null,
): T {
  if (!liveJob) return feature;
  const list = feature.cursorAgentJobs ?? [];
  const rest = list.filter((j) => j.id !== liveJob.id);
  return { ...feature, cursorAgentJobs: [liveJob, ...rest] };
}

const MAX_ROWS = 120;

export function buildFeatureActivityTimeline(input: ActivityTimelineInput): ActivityTimelineRow[] {
  const rows: ActivityTimelineRow[] = [];

  for (const run of input.runs ?? []) {
    const stageName = FEATURE_STAGE_LABEL[run.stage as FeatureStage] ?? run.stage;
    const label = `${stageName} · ${agentShort(run.agentName)}`;
    for (const ev of run.events ?? []) {
      rows.push({
        id: `run-${run.id}-ev-${ev.id}`,
        timestamp: new Date(ev.timestamp),
        label,
        message: ev.message,
        kind: "agent",
      });
    }
    if ((run.events ?? []).length === 0) {
      rows.push({
        id: `run-${run.id}-placeholder`,
        timestamp: new Date(run.startedAt),
        label,
        message: `Run ${run.status} — waiting for agent log lines.`,
        kind: "agent",
      });
    }
  }

  for (const job of input.cursorAgentJobs ?? []) {
    const created = new Date(job.createdAt).getTime();
    const updated = new Date(job.updatedAt).getTime();
    const idShort = truncate(job.cursorAgentId, 18);
    const detailParts = [
      job.status && `status ${job.status}`,
      job.prUrl && `PR: ${job.prUrl}`,
      job.agentUrl && "agent dashboard link available",
      job.autoDeploy && job.deployTriggered && "Vercel auto-deploy triggered",
      job.errorMessage && truncate(job.errorMessage, 160),
    ].filter(Boolean);
    const detail = detailParts.join(" · ");

    if (Math.abs(updated - created) < 1500) {
      rows.push({
        id: `cursor-${job.id}`,
        timestamp: new Date(job.updatedAt),
        label: "Cursor Cloud",
        message: detail ? `Launched ${idShort} · ${detail}` : `Cursor agent launched · ${idShort}`,
        kind: "cursor",
      });
    } else {
      rows.push({
        id: `cursor-${job.id}-start`,
        timestamp: new Date(job.createdAt),
        label: "Cursor Cloud",
        message: `Agent launched · ${idShort}`,
        kind: "cursor",
      });
      rows.push({
        id: `cursor-${job.id}-update`,
        timestamp: new Date(job.updatedAt),
        label: "Cursor Cloud",
        message: detail || `Job update · ${idShort}`,
        kind: "cursor",
      });
    }
  }

  for (const rel of input.releases ?? []) {
    const st = RELEASE_STATUS_LABEL[rel.status];
    const where = deploymentWhereLine(rel.vercelUrl);
    const parts = [
      `${st}`,
      rel.vercelUrl && rel.vercelUrl,
      where && `(${where})`,
      rel.errorMessage && truncate(rel.errorMessage, 100),
      rel.inspectorUrl && "dashboard link available",
    ].filter(Boolean) as string[];
    rows.push({
      id: `release-${rel.id}`,
      timestamp: new Date(rel.updatedAt),
      label: "Vercel deploy",
      message: parts.join(" · ") || "Release updated",
      kind: "deploy",
    });
  }

  for (const a of input.approvals ?? []) {
    const stageName = FEATURE_STAGE_LABEL[a.stage as FeatureStage] ?? a.stage;
    rows.push({
      id: `approval-${a.id}`,
      timestamp: new Date(a.createdAt),
      label: "Pipeline approval",
      message: `${stageName} → ${a.status}${a.approvedBy ? ` · ${a.approvedBy}` : ""}`,
      kind: "approval",
    });
  }

  rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return rows.slice(0, MAX_ROWS);
}

export function activityBorderClass(kind: ActivityTimelineKind): string {
  switch (kind) {
    case "cursor":
      return "border-violet-500/50";
    case "deploy":
      return "border-emerald-600/45";
    case "approval":
      return "border-amber-500/50";
    default:
      return "border-primary/30";
  }
}
