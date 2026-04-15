"use client";

import type { FeatureStage, FeatureStatus } from "@prisma/client";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  GripVertical,
  Loader2,
  PanelRightOpen,
  PauseCircle,
  ExternalLink,
  Play,
  RefreshCw,
  Rocket,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Badge as StatusBadge } from "@/components/ui/badge";
import { Frame, FrameHeader, FrameTitle } from "@/components/reui/frame";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban";
import { FEATURE_STAGE_LABEL, PIPELINE_COLUMN_ORDER } from "@/lib/domain/stages";
import { FEATURE_STATUS_LABEL } from "@/lib/domain/statuses";
import type { PipelineCardVisualState } from "@/lib/domain/pipeline-card-state";
import { STAGE_DEFAULT_AGENT } from "@/lib/domain/run-lifecycle";
import type { PipelineKanbanCard } from "@/lib/domain/pipeline-kanban";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PipelineFeatureQuickView } from "@/components/pipeline-feature-quick-view";

export type { PipelineKanbanCard };

const TONE_STYLES: Record<
  PipelineCardVisualState["tone"],
  { accent: string; strip: string; iconBox: string; icon: LucideIcon }
> = {
  working: {
    accent: "border-l-primary",
    strip: "bg-primary/[0.045]",
    iconBox: "bg-primary/12 text-primary",
    icon: Loader2,
  },
  paused: {
    accent: "border-l-amber-500",
    strip: "bg-amber-500/[0.06]",
    iconBox:
      "bg-amber-100 text-amber-900 dark:bg-amber-950/45 dark:text-amber-300",
    icon: PauseCircle,
  },
  ready: {
    accent: "border-l-border",
    strip: "bg-muted/50",
    iconBox: "bg-muted text-muted-foreground",
    icon: CheckCircle2,
  },
  attention: {
    accent: "border-l-destructive",
    strip: "bg-destructive/[0.04]",
    iconBox: "bg-destructive/12 text-destructive",
    icon: AlertCircle,
  },
};

const STAGE_DOT: Record<FeatureStage, string> = {
  INBOX: "bg-muted-foreground/35",
  VALUE_REVIEW: "bg-primary/55",
  REJECTED: "bg-destructive/60",
  PRD: "bg-foreground/25",
  DESIGN_SPEC: "bg-foreground/25",
  READY_FOR_BUILD: "bg-primary/40",
  IN_BUILD: "bg-primary/50",
  QA: "bg-foreground/30",
  DONE: "bg-success/50",
};

function statusBadgeVariant(
  s: FeatureStatus,
): "default" | "running" | "input" | "review" {
  if (s === "running" || s === "queued") return "running";
  if (s === "awaiting_input") return "input";
  if (s === "awaiting_review") return "review";
  return "default";
}

function stageOfItem(
  columns: Record<FeatureStage, PipelineKanbanCard[]>,
  id: string,
): FeatureStage | undefined {
  for (const stage of PIPELINE_COLUMN_ORDER) {
    if (columns[stage].some((c) => c.id === id)) return stage;
  }
  return undefined;
}

function shortAgentName(agentKey: string): string {
  return agentKey.replace(/-agent$/i, "").replace(/-/g, " ");
}

/** Right after a column drop: show progress immediately while PATCH + auto-run catch up on the server. */
function optimisticCardAfterColumnMove(
  card: PipelineKanbanCard,
  newColumn: FeatureStage,
): PipelineKanbanCard {
  const next: PipelineKanbanCard = { ...card, stage: newColumn };
  if (newColumn === "INBOX") {
    return {
      ...next,
      tone: "ready",
      headline: "Inbox — idea parked",
      detail:
        "Drag to Research Analysis once to start scoring. Later stages advance with Approve on the card — no more drags.",
      pulse: false,
    };
  }
  const defaultAgent = STAGE_DEFAULT_AGENT[newColumn];
  const willAutoRun =
    !!defaultAgent &&
    (card.status === "idle" || card.status === "failed" || card.status === "blocked");
  if (willAutoRun) {
    return {
      ...next,
      tone: "working",
      headline: "Starting — agent run",
      detail: `${shortAgentName(defaultAgent)} · ${FEATURE_STAGE_LABEL[newColumn]}`,
      pulse: true,
    };
  }
  return next;
}

type BoardApiPayload = {
  boardKey?: string;
  initialColumns?: Record<FeatureStage, PipelineKanbanCard[]>;
  agentRunning?: boolean;
  hasPipelineActivity?: boolean;
  humanNeedsAttention?: boolean;
};

export type PipelineBoardMeta = {
  agentRunning: boolean;
  hasPipelineActivity: boolean;
  humanNeedsAttention: boolean;
};

function applyBoardPayload(
  data: BoardApiPayload,
  lastBoardKeyRef: MutableRefObject<string | null>,
  setColumns: Dispatch<SetStateAction<Record<FeatureStage, PipelineKanbanCard[]>>>,
  onBoardMetaChange?: (meta: PipelineBoardMeta) => void,
) {
  if (!data.boardKey || !data.initialColumns) return;
  if (typeof data.agentRunning === "boolean" && typeof data.hasPipelineActivity === "boolean") {
    onBoardMetaChange?.({
      agentRunning: data.agentRunning,
      hasPipelineActivity: data.hasPipelineActivity,
      humanNeedsAttention:
        typeof data.humanNeedsAttention === "boolean" ? data.humanNeedsAttention : false,
    });
  }
  if (data.boardKey !== lastBoardKeyRef.current) {
    lastBoardKeyRef.current = data.boardKey;
    setColumns(data.initialColumns);
  }
}

export function PipelineKanbanBoard({
  initialColumns,
  databaseAvailable,
  boardKey,
  cursorBuildConfigured = false,
  pollBoard = false,
  filterQ = "",
  filterStage = "",
  onBoardMetaChange,
}: {
  initialColumns: Record<FeatureStage, PipelineKanbanCard[]>;
  databaseAvailable: boolean;
  /** Content hash from server — when it changes, replace local columns (navigation or agent updates). */
  boardKey: string;
  /** `CURSOR_API_KEY` + repo configured — enables **Start Cursor** on cards */
  cursorBuildConfigured?: boolean;
  /** Poll JSON API instead of `router.refresh()` to avoid intermittent RSC / flight 500s in dev. */
  pollBoard?: boolean;
  filterQ?: string;
  filterStage?: string;
  /** Keeps the pipeline banner in sync with `GET /api/pipeline/board` (SSR props alone go stale). */
  onBoardMetaChange?: (meta: PipelineBoardMeta) => void;
}) {
  const [columns, setColumns] = useState(initialColumns);
  const [quickViewFeatureId, setQuickViewFeatureId] = useState<string | null>(null);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [runBusyId, setRunBusyId] = useState<string | null>(null);
  const [cursorBusyId, setCursorBusyId] = useState<string | null>(null);
  const [deployBusyId, setDeployBusyId] = useState<string | null>(null);
  const lastBoardKeyRef = useRef<string | null>(null);

  const anyCursorJobInProgress = useMemo(
    () =>
      PIPELINE_COLUMN_ORDER.some((col) =>
        (columns[col] ?? []).some((c) => c.cursorJobInProgress === true),
      ),
    [columns],
  );

  const anyApopAgentRunning = useMemo(
    () =>
      PIPELINE_COLUMN_ORDER.some((col) =>
        (columns[col] ?? []).some((c) => c.status === "running" || c.status === "queued"),
      ),
    [columns],
  );

  const anyAwaitingReviewOrInput = useMemo(
    () =>
      PIPELINE_COLUMN_ORDER.some((col) =>
        (columns[col] ?? []).some(
          (c) => c.status === "awaiting_review" || c.status === "awaiting_input",
        ),
      ),
    [columns],
  );

  const anyVercelSyncDesired = useMemo(
    () =>
      PIPELINE_COLUMN_ORDER.some((col) =>
        (columns[col] ?? []).some((c) => c.vercelSyncDesired === true),
      ),
    [columns],
  );

  const refreshBoardFromApi = useCallback(async () => {
    if (!databaseAvailable) return;
    const qs = new URLSearchParams();
    const qTrim = filterQ.trim();
    if (qTrim) qs.set("q", qTrim);
    if (filterStage) qs.set("stage", filterStage);
    qs.set("syncCursor", "1");
    try {
      const res = await fetch(`/api/pipeline/board?${qs.toString()}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) return;
      let data: BoardApiPayload;
      try {
        data = text ? (JSON.parse(text) as BoardApiPayload) : {};
      } catch {
        return;
      }
      applyBoardPayload(data, lastBoardKeyRef, setColumns, onBoardMetaChange);
    } catch {
      /* ignore */
    }
  }, [databaseAvailable, filterQ, filterStage, onBoardMetaChange]);

  const patchFeatureStageRemote = useCallback(
    async (id: string, requestedStage: FeatureStage) => {
      const res = await fetch(`/api/features/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: requestedStage }),
      });
      if (!res.ok) throw new Error(`PATCH ${res.status}`);
      await res.json();
      await refreshBoardFromApi();
    },
    [refreshBoardFromApi],
  );

  const postStartRun = useCallback(
    async (featureId: string, stage: FeatureStage) => {
      if (!databaseAvailable) return;
      setRunBusyId(featureId);
      try {
        const res = await fetch(`/api/features/${featureId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          alert(typeof j.error === "string" ? j.error : "Could not start agent");
          return;
        }
        await refreshBoardFromApi();
      } finally {
        setRunBusyId(null);
      }
    },
    [databaseAvailable, refreshBoardFromApi],
  );

  const postApproval = useCallback(
    async (featureId: string, stage: FeatureStage, status: "approved" | "rejected") => {
      if (!databaseAvailable) return;
      setApprovalBusyId(featureId);
      try {
        const res = await fetch(`/api/features/${featureId}/approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage, status, approvedBy: "user" }),
        });
        if (!res.ok) {
          alert("Could not save approval — try the full workspace or refresh.");
          return;
        }
        await refreshBoardFromApi();
      } finally {
        setApprovalBusyId(null);
      }
    },
    [databaseAvailable, refreshBoardFromApi],
  );

  const postStartCursor = useCallback(
    async (featureId: string, autoDeploy: boolean) => {
      if (!databaseAvailable || !cursorBuildConfigured) return;
      setCursorBusyId(featureId);
      try {
        const res = await fetch(`/api/features/${featureId}/cursor-build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoDeploy }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          alert(typeof j.error === "string" ? j.error : "Could not start Cursor agent");
          return;
        }
        await refreshBoardFromApi();
      } finally {
        setCursorBusyId(null);
      }
    },
    [cursorBuildConfigured, databaseAvailable, refreshBoardFromApi],
  );

  const postTriggerDeploy = useCallback(
    async (featureId: string) => {
      if (!databaseAvailable) return;
      setDeployBusyId(featureId);
      try {
        const res = await fetch(`/api/features/${featureId}/release`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          alert(typeof j.error === "string" ? j.error : "Deploy request failed");
          return;
        }
        await refreshBoardFromApi();
      } finally {
        setDeployBusyId(null);
      }
    },
    [databaseAvailable, refreshBoardFromApi],
  );

  useEffect(() => {
    if (lastBoardKeyRef.current === boardKey) return;
    lastBoardKeyRef.current = boardKey;
    setColumns(initialColumns);
  }, [boardKey, initialColumns]);

  useEffect(() => {
    if (
      !databaseAvailable ||
      (!pollBoard &&
        !anyCursorJobInProgress &&
        !anyApopAgentRunning &&
        !anyAwaitingReviewOrInput &&
        !anyVercelSyncDesired)
    )
      return;
    const qs = new URLSearchParams();
    if (filterQ) qs.set("q", filterQ);
    if (filterStage) qs.set("stage", filterStage);
    qs.set("syncCursor", "1");
    const url = `/api/pipeline/board?${qs.toString()}`;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (cancelled || !res.ok) return;
        let data: BoardApiPayload;
        try {
          data = text ? (JSON.parse(text) as BoardApiPayload) : {};
        } catch {
          return;
        }
        applyBoardPayload(data, lastBoardKeyRef, setColumns, onBoardMetaChange);
      } catch {
        /* ignore network / transient errors */
      }
    };

    void tick();
    const pollMs = anyApopAgentRunning ? 2000 : 3500;
    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    databaseAvailable,
    pollBoard,
    anyCursorJobInProgress,
    anyApopAgentRunning,
    anyAwaitingReviewOrInput,
    anyVercelSyncDesired,
    filterQ,
    filterStage,
    onBoardMetaChange,
  ]);

  const onValueChange = useCallback(
    (next: Record<FeatureStage, PipelineKanbanCard[]>) => {
      setColumns((prev) => {
        if (!databaseAvailable) return next;
        const merged = {} as Record<FeatureStage, PipelineKanbanCard[]>;
        for (const stage of PIPELINE_COLUMN_ORDER) {
          merged[stage] = next[stage].map((card) => {
            const before = stageOfItem(prev, card.id);
            if (before !== undefined && before !== stage) {
              void patchFeatureStageRemote(card.id, stage).catch(() => {
                /* optional: toast + revert */
              });
              return optimisticCardAfterColumnMove(card, stage);
            }
            return card;
          });
        }
        return merged;
      });
    },
    [databaseAvailable, patchFeatureStageRemote],
  );

  return (
    <Kanban
      value={columns}
      onValueChange={onValueChange}
      getItemValue={(item) => item.id}
    >
      <KanbanBoard
        className="w-max min-h-[min(72vh,720px)] gap-3 pb-1"
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          alignItems: "stretch",
          gap: 12,
          width: "max-content",
          minHeight: "min(72vh, 720px)",
          paddingBottom: 4,
        }}
      >
        {PIPELINE_COLUMN_ORDER.map((colId) => {
          const cards = columns[colId] ?? [];
          return (
            <KanbanColumn
              key={colId}
              value={colId}
              className="w-[min(100%,320px)] min-w-[288px] shrink-0 lg:w-[320px]"
              style={{
                width: 320,
                maxWidth: "92vw",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Frame spacing="sm" className="h-full bg-muted/30">
                <FrameHeader className="flex flex-row items-center gap-2 px-1">
                  <div
                    className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[colId])}
                    aria-hidden
                  />
                  <FrameTitle className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {FEATURE_STAGE_LABEL[colId]}
                  </FrameTitle>
                  <Badge variant="outline" size="sm" className="ml-auto tabular-nums">
                    {cards.length}
                  </Badge>
                </FrameHeader>
                <KanbanColumnContent
                  value={colId}
                  className="flex max-h-[min(68vh,680px)] flex-col gap-2 overflow-y-auto p-0.5"
                >
                  {cards.map((feature) => {
                    const tone = TONE_STYLES[feature.tone];
                    const Icon = tone.icon;
                    return (
                      <KanbanItem key={feature.id} value={feature.id}>
                        <div
                          className={cn(
                            "overflow-hidden rounded-xl border border-border/70 bg-card text-card-foreground shadow-sm ring-1 ring-black/[0.04] transition-[box-shadow,transform] duration-200 dark:ring-white/[0.06]",
                            "hover:shadow-md",
                            "border-l-[3px]",
                            tone.accent,
                          )}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "flex items-center gap-2.5 border-b border-border/50 px-3 py-2 outline-none transition-colors",
                              "hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset",
                              tone.strip,
                            )}
                            onClick={() => setQuickViewFeatureId(feature.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setQuickViewFeatureId(feature.id);
                              }
                            }}
                          >
                            <div
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-md",
                                tone.iconBox,
                              )}
                              aria-hidden
                            >
                              <Icon
                                className={cn(
                                  "size-3.5",
                                  feature.pulse &&
                                    feature.tone === "working" &&
                                    "motion-safe:animate-spin",
                                )}
                                style={
                                  feature.pulse && feature.tone === "working"
                                    ? { animation: "apop-spin 0.9s linear infinite" }
                                    : undefined
                                }
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground/90">
                                {feature.headline}
                              </p>
                              {feature.detail ? (
                                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                                  {feature.detail}
                                </p>
                              ) : null}
                            </div>
                            {feature.cursorAgentDashboardUrl ? (
                              <a
                                href={feature.cursorAgentDashboardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary shadow-sm hover:bg-primary/10"
                                title="Open Cursor Cloud agent dashboard"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="size-3" aria-hidden />
                                Dashboard
                              </a>
                            ) : null}
                            {databaseAvailable && feature.status === "awaiting_review" ? (
                              <div
                                className="flex shrink-0 items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <Button
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  className="h-7 gap-1 px-2.5 text-[11px]"
                                  disabled={approvalBusyId === feature.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void postApproval(feature.id, colId, "approved");
                                  }}
                                >
                                  {approvalBusyId === feature.id ? (
                                    <Loader2 className="size-3 animate-spin" aria-hidden />
                                  ) : (
                                    <Check className="size-3" strokeWidth={2.25} aria-hidden />
                                  )}
                                  {"Approve"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                  disabled={approvalBusyId === feature.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void postApproval(feature.id, colId, "rejected");
                                  }}
                                >
                                  <X className="size-3" strokeWidth={2.25} aria-hidden />
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-start gap-2 px-3 py-2.5">
                            <KanbanItemHandle
                              className="mt-0.5 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/55 transition-colors hover:bg-muted/70 hover:text-muted-foreground active:cursor-grabbing"
                              aria-label="Drag to another column"
                              title="Drag to another column"
                            >
                              <GripVertical className="size-4 opacity-80" />
                            </KanbanItemHandle>

                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex items-start gap-1.5">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="min-w-0 flex-1 cursor-pointer rounded-lg px-1 py-0.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30"
                                  onClick={() => setQuickViewFeatureId(feature.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setQuickViewFeatureId(feature.id);
                                    }
                                  }}
                                >
                                  <p className="text-[13px] font-semibold leading-snug text-foreground">
                                    {feature.title}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    <StatusBadge
                                      variant={statusBadgeVariant(feature.status)}
                                      className="text-[10px] font-medium"
                                    >
                                      {FEATURE_STATUS_LABEL[feature.status]}
                                    </StatusBadge>
                                    {typeof feature.score === "number" ? (
                                      <StatusBadge
                                        variant="default"
                                        className="tabular-nums text-[10px] font-medium"
                                      >
                                        {feature.score.toFixed(1)}
                                      </StatusBadge>
                                    ) : null}
                                  </div>
                                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                    {feature.description || "No description"}
                                  </p>
                                  {feature.commentaryLine ? (
                                    <p className="mt-2 line-clamp-3 border-l-2 border-primary/25 pl-2 text-[11px] leading-relaxed text-muted-foreground">
                                      <span className="font-semibold text-foreground/75">Activity</span>
                                      <span className="text-foreground/40"> · </span>
                                      {feature.commentaryLine}
                                    </p>
                                  ) : null}
                                  {feature.vercelLine ? (
                                    <p className="mt-2 line-clamp-3 border-l-2 border-emerald-500/35 pl-2 text-[11px] leading-relaxed text-muted-foreground">
                                      <span className="font-semibold text-emerald-900/85 dark:text-emerald-200/90">
                                        Vercel
                                      </span>
                                      <span className="text-foreground/40"> · </span>
                                      {feature.vercelLine}
                                    </p>
                                  ) : feature.stage === "IN_BUILD" && feature.cursorJobInProgress ? (
                                    <p className="mt-2 line-clamp-3 border-l-2 border-border pl-2 text-[11px] leading-relaxed text-muted-foreground">
                                      <span className="font-semibold text-foreground/75">Vercel</span>
                                      <span className="text-foreground/40"> · </span>
                                      {feature.cursorDeployTriggered ? (
                                        <>
                                          Auto-deploy was triggered — Vercel may already be building.
                                          Open workspace → <span className="font-medium">Deploy</span> or{" "}
                                          <span className="font-medium">Refresh status</span> until the
                                          preview URL appears here.
                                        </>
                                      ) : (
                                        <>
                                          No deploy in APOP yet — open workspace and use{" "}
                                          <span className="font-medium text-foreground/85">Deploy</span> when
                                          ready (preview URL shows once Vercel reports it).
                                        </>
                                      )}
                                    </p>
                                  ) : null}
                                </div>

                                <div onPointerDown={(e) => e.stopPropagation()}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                    title="Ship PRD preview"
                                    aria-label="Open Ship PRD preview"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setQuickViewFeatureId(feature.id);
                                    }}
                                  >
                                    <PanelRightOpen className="size-4" strokeWidth={2.25} />
                                  </Button>
                                </div>
                              </div>

                              {databaseAvailable &&
                              (feature.deployFromKanbanEligible ||
                                (cursorBuildConfigured &&
                                  (feature.cursorStartEligible || feature.cursorRetryEligible))) ? (
                                <div
                                  className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2"
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  {cursorBuildConfigured && feature.cursorStartEligible ? (
                                    <Button
                                      type="button"
                                      variant="gradientCta"
                                      size="sm"
                                      className="h-8 gap-1.5 px-3 text-[12px]"
                                      disabled={cursorBusyId === feature.id}
                                      title="Launch Cursor Cloud agent with Ship PRD"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void postStartCursor(feature.id, true);
                                      }}
                                    >
                                      {cursorBusyId === feature.id ? (
                                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                      ) : (
                                        <Play className="size-3.5" strokeWidth={2.25} aria-hidden />
                                      )}
                                      Start Cursor
                                    </Button>
                                  ) : null}
                                  {cursorBuildConfigured && feature.cursorRetryEligible ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1.5 px-3 text-[12px]"
                                      disabled={cursorBusyId === feature.id}
                                      title="Start a new Cursor Cloud run after a failed job"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void postStartCursor(feature.id, true);
                                      }}
                                    >
                                      {cursorBusyId === feature.id ? (
                                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                      ) : (
                                        <RefreshCw className="size-3.5" strokeWidth={2.25} aria-hidden />
                                      )}
                                      Retry Cursor
                                    </Button>
                                  ) : null}
                                  {feature.deployFromKanbanEligible ? (
                                    <Button
                                      type="button"
                                      variant={
                                        feature.cursorStartEligible || feature.cursorRetryEligible
                                          ? "outline"
                                          : "default"
                                      }
                                      size="sm"
                                      className="h-8 gap-1.5 px-3 text-[12px]"
                                      disabled={deployBusyId === feature.id}
                                      title="Vercel deploy hook — rebuilds production from main. Merge Cursor’s PR first if you need new code."
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void postTriggerDeploy(feature.id);
                                      }}
                                    >
                                      {deployBusyId === feature.id ? (
                                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                      ) : (
                                        <Rocket className="size-3.5" strokeWidth={2.25} aria-hidden />
                                      )}
                                      Deploy
                                    </Button>
                                  ) : null}
                                  <span className="w-full text-[10px] leading-snug text-muted-foreground sm:w-auto">
                                    {feature.cursorStartEligible
                                      ? "Start Cursor (auto-deploy after finish if hook is set). Deploy anytime while signed off."
                                      : feature.cursorRetryEligible
                                        ? "Fix the issue, then retry Cursor or deploy from the last good commit."
                                        : feature.deployFromKanbanEligible
                                          ? "Hook rebuilds main (not the apop/… preview branch). Merge PR first for new code on production."
                                          : null}
                                  </span>
                                </div>
                              ) : null}

                              {databaseAvailable &&
                              (feature.status === "failed" || feature.status === "blocked") &&
                              ["VALUE_REVIEW", "DESIGN_SPEC", "PRD"].includes(feature.stage) ? (
                                <div
                                  className="flex flex-wrap items-center gap-2 border-t border-border/45 pt-2"
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    className="h-8 gap-1.5 px-3 text-[12px]"
                                    disabled={runBusyId === feature.id}
                                    title="Retry the last failed agent run"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void postStartRun(feature.id, feature.stage);
                                    }}
                                  >
                                    {runBusyId === feature.id ? (
                                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <RefreshCw className="size-3.5" strokeWidth={2.25} aria-hidden />
                                    )}
                                    Retry
                                  </Button>
                                </div>
                              ) : null}

                              {databaseAvailable &&
                              feature.stage === "VALUE_REVIEW" &&
                              (feature.status === "idle" || feature.status === "awaiting_input") ? (
                                <div
                                  className="flex flex-wrap items-center gap-2 border-t border-border/45 pt-2"
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    type="button"
                                    variant="gradientCta"
                                    size="sm"
                                    className="h-8 gap-1.5 px-3 text-[12px]"
                                    disabled={runBusyId === feature.id}
                                    title="Start value analysis for this feature"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void postStartRun(feature.id, "VALUE_REVIEW");
                                    }}
                                  >
                                    {runBusyId === feature.id ? (
                                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <Play className="size-3.5" strokeWidth={2.25} aria-hidden />
                                    )}
                                    Run Research
                                  </Button>
                                </div>
                              ) : null}

                              {databaseAvailable && feature.status === "awaiting_review" ? (
                                <div
                                  className="flex flex-wrap items-center gap-2 border-t border-border/45 pt-2"
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    className="h-8 gap-1.5 px-3 text-[12px]"
                                    title="Approve and continue the pipeline"
                                    disabled={approvalBusyId === feature.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void postApproval(feature.id, colId, "approved");
                                    }}
                                  >
                                    {approvalBusyId === feature.id ? (
                                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <Check className="size-3.5" strokeWidth={2.25} aria-hidden />
                                    )}
                                    {feature.stage === "VALUE_REVIEW"
                                      ? "Approve value"
                                      : feature.stage === "DESIGN_SPEC"
                                        ? "Approve design"
                                        : feature.stage === "PRD"
                                          ? "Approve PRD"
                                          : "Approve"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 px-3 text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    title="Reject this stage"
                                    disabled={approvalBusyId === feature.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void postApproval(feature.id, colId, "rejected");
                                    }}
                                  >
                                    <X className="size-3.5" strokeWidth={2.25} aria-hidden />
                                    Reject
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </KanbanItem>
                    );
                  })}
                </KanbanColumnContent>
              </Frame>
            </KanbanColumn>
          );
        })}
      </KanbanBoard>
      <KanbanOverlay className="rounded-lg border-2 border-dashed border-border bg-muted/15" />
      <PipelineFeatureQuickView
        featureId={quickViewFeatureId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setQuickViewFeatureId(null);
        }}
        onFeatureDeleted={() => void refreshBoardFromApi()}
      />
    </Kanban>
  );
}
