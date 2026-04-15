import { FeatureStage } from "@prisma/client";

const ALL_FEATURE_STAGES = Object.values(FeatureStage) as FeatureStage[];
import { canStartCursorImplementation } from "@/lib/artifact-utils";
import { listPipelineFeaturesSafe } from "@/lib/data/features";
import { isCursorAgentFinished, isCursorAgentSucceeded } from "@/lib/cursor/agent-status";
import { isCursorBuildConfigured } from "@/lib/cursor/env";
import { syncLatestCursorJobForFeature } from "@/lib/cursor/sync-job";
import { buildPipelineCardState } from "@/lib/domain/pipeline-card-state";
import type { PipelineListFeature } from "@/lib/domain/pipeline-card-state";
import type { PipelineKanbanCard } from "@/lib/domain/pipeline-kanban";
import {
  PIPELINE_COLUMN_ORDER,
  kanbanCardStageForDbStage,
  kanbanColumnForDbStage,
} from "@/lib/domain/stages";
import { kanbanVercelSummary } from "@/lib/vercel/deployment-display";
import { getVercelDeployHookUrl, getVercelProjectId, getVercelToken } from "@/lib/vercel/env";
import {
  featureEligibleForPipelineVercelSync,
  releaseNeedsVercelPolling,
  syncLatestReleaseForFeature,
} from "@/lib/vercel/release-sync";

function safeIso(d: unknown): string {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  if (typeof d === "string") {
    const x = new Date(d);
    if (!Number.isNaN(x.getTime())) return x.toISOString();
  }
  return "";
}

function truncate(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** One line for the Kanban card activity strip */
function buildKanbanCommentaryLine(f: PipelineListFeature): string | null {
  const job = f.cursorAgentJobs?.[0];
  if (job) {
    const st = job.status?.trim() || "SUBMITTED";
    const err = job.errorMessage?.trim();
    const deployOnlyErr =
      !!err &&
      err.includes("Auto-deploy failed") &&
      isCursorAgentSucceeded(job.status);
    if (err && isCursorAgentFinished(job.status) && !deployOnlyErr) {
      return truncate(err, 140);
    }
    const sum = job.cursorSummary?.trim();
    if (sum) {
      return truncate(`Cursor · ${st} — ${sum}`, 160);
    }
    return `Cursor · ${st}`;
  }
  const msg = f.runs?.[0]?.events?.[0]?.message;
  if (msg && String(msg).trim()) {
    return truncate(String(msg).trim(), 140);
  }
  return null;
}

/**
 * Kanban Cursor / Deploy actions:
 * - Start: first run only (no job yet).
 * - Retry: last job ended in failure — not after FINISHED success (use Deploy instead).
 * - Deploy: signed-off + Ship PRD ready + deploy hook configured + Cursor build finished.
 */
function cursorKanbanActionFlags(f: PipelineListFeature): {
  cursorStartEligible: boolean;
  cursorRetryEligible: boolean;
  deployFromKanbanEligible: boolean;
} {
  const impl = canStartCursorImplementation(f.artifacts ?? []);
  const featureNotRunning = f.status !== "running" && f.status !== "queued";

  const job = f.cursorAgentJobs?.[0];
  const cursorBuildComplete = !!job && isCursorAgentFinished(job.status);
  const deployFromKanbanEligible =
    cursorBuildComplete &&
    f.status === "approved" &&
    (f.stage === FeatureStage.IN_BUILD ||
      f.stage === FeatureStage.QA ||
      f.stage === FeatureStage.READY_FOR_BUILD) &&
    impl &&
    !!getVercelDeployHookUrl();

  const stageOkForCursor =
    f.stage === FeatureStage.IN_BUILD || f.stage === FeatureStage.READY_FOR_BUILD;

  if (!impl || !stageOkForCursor || !featureNotRunning) {
    return { cursorStartEligible: false, cursorRetryEligible: false, deployFromKanbanEligible };
  }

  if (!job) {
    return { cursorStartEligible: true, cursorRetryEligible: false, deployFromKanbanEligible };
  }
  if (!isCursorAgentFinished(job.status)) {
    return { cursorStartEligible: false, cursorRetryEligible: false, deployFromKanbanEligible };
  }
  if (isCursorAgentSucceeded(job.status)) {
    return { cursorStartEligible: false, cursorRetryEligible: false, deployFromKanbanEligible };
  }
  return { cursorStartEligible: false, cursorRetryEligible: true, deployFromKanbanEligible };
}

export type PipelineBoardState = {
  initialColumns: Record<FeatureStage, PipelineKanbanCard[]>;
  boardKey: string;
  /** LLM run or queued — not Vercel linking */
  agentRunning: boolean;
  /** Drives background board polling (includes silent Vercel refresh) */
  hasPipelineActivity: boolean;
  /** Cards waiting on answers or review — amber banner */
  humanNeedsAttention: boolean;
  databaseAvailable: boolean;
  boardBuildError: string | null;
  /** True when CURSOR_API_KEY + repo are set — Start Cursor on cards is allowed */
  cursorBuildConfigured: boolean;
};

export function emptyPipelineBoardColumns(): Record<FeatureStage, PipelineKanbanCard[]> {
  return ALL_FEATURE_STAGES.reduce(
    (acc, s) => {
      acc[s] = [];
      return acc;
    },
    {} as Record<FeatureStage, PipelineKanbanCard[]>,
  );
}

/**
 * Shared by `/pipeline` (SSR) and `GET /api/pipeline/board` (client polling).
 * Avoids `router.refresh()` full RSC refetches, which can intermittently 500 in dev.
 */
export async function getPipelineBoardState(options: {
  q?: string;
  stage?: FeatureStage;
  /** When true (e.g. client poll), refresh non-terminal Cursor jobs from the API so card commentary stays current */
  syncCursorJobs?: boolean;
}): Promise<PipelineBoardState> {
  const listOpts = { q: options.q, stage: options.stage };
  let { features, databaseAvailable } = await listPipelineFeaturesSafe(listOpts);

  if (databaseAvailable && options.syncCursorJobs) {
    const active = features.filter((f) => {
      const j = f.cursorAgentJobs?.[0];
      return j && !isCursorAgentFinished(j.status);
    }).slice(0, 12);
    if (active.length > 0) {
      await Promise.all(
        active.map((f) => syncLatestCursorJobForFeature(f.id).catch(() => undefined)),
      );
      const again = await listPipelineFeaturesSafe(listOpts);
      features = again.features;
      databaseAvailable = again.databaseAvailable;
    }

    const vercelApiOk = Boolean(getVercelToken() && getVercelProjectId());
    if (vercelApiOk) {
      const vercelTargets = features
        .filter(
          (f) =>
            featureEligibleForPipelineVercelSync(f.stage) &&
            releaseNeedsVercelPolling(f.releases?.[0]),
        )
        .slice(0, 12);
      if (vercelTargets.length > 0) {
        await Promise.all(
          vercelTargets.map((f) => syncLatestReleaseForFeature(f.id).catch(() => undefined)),
        );
        const vAgain = await listPipelineFeaturesSafe(listOpts);
        features = vAgain.features;
        databaseAvailable = vAgain.databaseAvailable;
      }
    }
  }

  let initialColumns = emptyPipelineBoardColumns();
  let boardKey = [
    options.q ?? "",
    options.stage ?? "",
    databaseAvailable ? "db" : "nodb",
    "init",
  ].join("|");
  let agentRunning = false;
  let hasPipelineActivity = false;
  let humanNeedsAttention = false;
  let boardBuildError: string | null = null;
  const cursorBuildConfigured = isCursorBuildConfigured();
  const vercelSyncCapable = Boolean(getVercelToken() && getVercelProjectId());

  try {
    const byStage = new Map<FeatureStage, typeof features>();
    for (const col of PIPELINE_COLUMN_ORDER) {
      byStage.set(col, []);
    }
    for (const f of features) {
      const bucket = kanbanColumnForDbStage(f.stage);
      byStage.get(bucket)?.push(f);
    }

    const toCard = (f: (typeof features)[number]): PipelineKanbanCard => {
      const cj = f.cursorAgentJobs?.[0];
      const vercelLatest = f.releases?.[0];
      const cursorFlags = cursorKanbanActionFlags(f);
      return {
        id: f.id,
        stage: kanbanCardStageForDbStage(f.stage),
        title: f.title,
        description: f.description,
        status: f.status,
        score: f.score,
        cursorImplementationReady: canStartCursorImplementation(f.artifacts ?? []),
        commentaryLine: buildKanbanCommentaryLine(f),
        cursorStartEligible: cursorFlags.cursorStartEligible,
        cursorRetryEligible: cursorFlags.cursorRetryEligible,
        deployFromKanbanEligible: cursorFlags.deployFromKanbanEligible,
        cursorJobInProgress: !!(cj && !isCursorAgentFinished(cj.status)),
        vercelLine: kanbanVercelSummary(vercelLatest),
        vercelSyncDesired:
          vercelSyncCapable &&
          featureEligibleForPipelineVercelSync(f.stage) &&
          releaseNeedsVercelPolling(vercelLatest),
        cursorDeployTriggered: !!(cj?.deployTriggered),
        cursorAgentDashboardUrl: cj?.agentUrl?.trim() || null,
        ...buildPipelineCardState(f),
      };
    };

    initialColumns = ALL_FEATURE_STAGES.reduce(
      (acc, s) => {
        acc[s] = (byStage.get(s) ?? []).map(toCard);
        return acc;
      },
      {} as Record<FeatureStage, PipelineKanbanCard[]>,
    );

    boardKey = [
      options.q ?? "",
      options.stage ?? "",
      databaseAvailable ? "db" : "nodb",
      ...features.map((f) => {
        const ev = f.runs[0]?.events?.[0];
        const evTs = safeIso(ev?.timestamp);
        const cj = f.cursorAgentJobs?.[0];
        return [
          f.id,
          f.stage,
          f.status,
          safeIso(f.updatedAt),
          (f.agentQuestions ?? []).map((q) => q.id).join(","),
          f.runs[0]?.id ?? "",
          f.runs[0]?.status ?? "",
          evTs,
          cj?.id ?? "",
          cj?.status ?? "",
          cj?.agentUrl ?? "",
          cj?.cursorSummary ?? "",
          safeIso(cj?.updatedAt),
          f.releases?.[0]?.id ?? "",
          f.releases?.[0]?.status ?? "",
          f.releases?.[0]?.vercelUrl ?? "",
          f.releases?.[0]?.vercelDeploymentId ?? "",
          f.releases?.[0]?.readyState ?? "",
          safeIso(f.releases?.[0]?.updatedAt),
        ].join(":");
      }),
    ].join("|");

    const llmAgentRunning = features.some((f) => f.status === "running" || f.status === "queued");
    const cursorJobActive = features.some((f) => {
      const j = f.cursorAgentJobs?.[0];
      return j && !isCursorAgentFinished(j.status);
    });
    const anyVercelNeedsPoll =
      vercelSyncCapable &&
      features.some(
        (f) =>
          featureEligibleForPipelineVercelSync(f.stage) && releaseNeedsVercelPolling(f.releases?.[0]),
      );

    humanNeedsAttention = features.some(
      (f) => f.status === "awaiting_input" || f.status === "awaiting_review",
    );

    /** Banner “working” strip: real agents only — not silent Vercel deployment polling. */
    agentRunning = llmAgentRunning || cursorJobActive;
    hasPipelineActivity = agentRunning || anyVercelNeedsPoll || humanNeedsAttention;
  } catch (err) {
    console.error("[pipeline] board build failed", err);
    boardBuildError =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    initialColumns = emptyPipelineBoardColumns();
    boardKey = `${boardKey}|err:${Date.now()}`;
  }

  return {
    initialColumns,
    boardKey,
    agentRunning,
    hasPipelineActivity,
    humanNeedsAttention,
    databaseAvailable,
    boardBuildError,
    cursorBuildConfigured,
  };
}

/** Strip `undefined` / non-JSON values so RSC → client serialization never throws. */
export function sanitizePipelineColumnsForClient(
  columns: Record<FeatureStage, PipelineKanbanCard[]>,
): Record<FeatureStage, PipelineKanbanCard[]> {
  try {
    return JSON.parse(JSON.stringify(columns)) as Record<FeatureStage, PipelineKanbanCard[]>;
  } catch (err) {
    console.error("[pipeline] sanitizePipelineColumnsForClient failed", err);
    return emptyPipelineBoardColumns();
  }
}
