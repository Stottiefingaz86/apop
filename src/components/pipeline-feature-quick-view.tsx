"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CursorAgentJob, FeatureStage } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { FEATURE_STAGE_LABEL } from "@/lib/domain/stages";
import { FEATURE_STATUS_LABEL } from "@/lib/domain/statuses";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import { canStartCursorImplementation, latestArtifactByType } from "@/lib/artifact-utils";
import {
  MAX_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
} from "@/lib/domain/feature-attachment-limits";
import { parseContextPack } from "@/lib/domain/context-pack";
import { composeShipBriefCore, formatDeploymentSection } from "@/lib/domain/ship-brief";
import { buildCursorHandoffPromptWithPreamble } from "@/lib/cursor/build-cursor-handoff-prompt-text";
import { CursorHandoffDeliverableCard } from "@/components/cursor-handoff-deliverable-card";
import { referenceImagesForVision } from "@/lib/llm/context-pack-llm";
import {
  activityBorderClass,
  buildFeatureActivityTimeline,
  mergeCursorJobForTimeline,
} from "@/lib/domain/feature-activity-timeline";
import { STAGE_DEFAULT_AGENT } from "@/lib/domain/run-lifecycle";
import { shipPrdMarkdownComponents } from "@/components/ship-prd-markdown";
import { VercelDeploymentStatus } from "@/components/vercel-deployment-status";
import {
  CURSOR_BRANCH_PREVIEW_HINT,
  VERCEL_DEPLOY_HOOK_HINT,
} from "@/lib/vercel/deploy-hint";
import { cn } from "@/lib/utils";
import type { FeatureWorkspaceModel } from "@/components/feature-workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const RELEASE_STATUS_LABEL = {
  pending: "Pending",
  building: "Building",
  ready: "Ready",
  error: "Failed",
  canceled: "Canceled",
} as const;

function agentDisplayName(raw: string): string {
  return raw.replace(/-agent$/i, "").replace(/-/g, " ");
}

function statusBadgeVariant(
  status: FeatureWorkspaceModel["status"],
): "default" | "running" | "input" | "review" | "destructive" {
  switch (status) {
    case "running":
      return "running";
    case "awaiting_input":
      return "input";
    case "awaiting_review":
      return "review";
    case "failed":
    case "blocked":
      return "destructive";
    default:
      return "default";
  }
}

function reviewCopyForStage(stage: FeatureStage) {
  if (stage === "READY_FOR_BUILD") {
    return (
      <>
        Approve to move into build. Full handoff is in the Ship PRD (left).
      </>
    );
  }
  if (stage === "PRD") {
    return (
      <>
        Approve to generate or accept the <strong className="text-foreground">Cursor prompt</strong>.
      </>
    );
  }
  if (stage === "DESIGN_SPEC") {
    return (
      <>
        Approve to run <strong className="text-foreground">Design</strong> or advance after a design spec
        exists.
      </>
    );
  }
  if (stage === "INBOX") {
    return (
      <>
        Inbox only — drag the card to <strong className="text-foreground">Research Analysis</strong> to start
        scoring.
      </>
    );
  }
  if (stage === "VALUE_REVIEW") {
    return (
      <>
        Tap <strong className="text-foreground">Approve value</strong> when research looks right — moves to{" "}
        <strong className="text-foreground">Design</strong> and runs the design agent. Then approve design →
        Cursor prompt → approve PRD → <strong className="text-foreground">In build</strong> for deploy/Cursor. Only
        drag: <strong className="text-foreground">Inbox → Research</strong>.
      </>
    );
  }
  return "Approve to advance, or reject.";
}

export function PipelineFeatureQuickView({
  featureId,
  onOpenChange,
  onFeatureDeleted,
}: {
  featureId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful DELETE so the parent can refetch the board. */
  onFeatureDeleted?: () => void | Promise<void>;
}) {
  const open = featureId !== null;
  const [feature, setFeature] = useState<FeatureWorkspaceModel | null>(null);
  const [releases, setReleases] = useState<FeatureWorkspaceModel["releases"]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [autoDeployAfterCursor, setAutoDeployAfterCursor] = useState(true);
  const [cursorJob, setCursorJob] = useState<CursorAgentJob | null>(null);
  const [shipDocOpen, setShipDocOpen] = useState(false);
  const [prdEditOpen, setPrdEditOpen] = useState(false);
  const [prdJsonDraft, setPrdJsonDraft] = useState("");
  const [prdMdDraft, setPrdMdDraft] = useState("");

  const fetchReleases = useCallback(
    async (refresh: boolean) => {
      if (!featureId) return;
      const res = await fetch(
        `/api/features/${featureId}/releases${refresh ? "?refresh=1" : ""}`,
      );
      if (!res.ok) return;
      const rows = (await res.json()) as FeatureWorkspaceModel["releases"];
      setReleases(rows);
    },
    [featureId],
  );

  const pullWorkspace = useCallback(async () => {
    if (!featureId) return;
    try {
      const res = await fetch(`/api/features/${featureId}/workspace`, { cache: "no-store" });
      if (res.status === 404) {
        setLoadError("Feature not found");
        setFeature(null);
        setCursorJob(null);
        return;
      }
      if (!res.ok) {
        setLoadError("Could not load workspace");
        return;
      }
      const data = (await res.json()) as FeatureWorkspaceModel;
      if (!data.cursorAgentJobs) data.cursorAgentJobs = [];
      setFeature(data);
      setReleases(data.releases ?? []);
      setCursorJob(data.cursorAgentJobs?.[0] ?? null);
      setLoadError(null);
    } catch {
      setLoadError("Network error");
    }
  }, [featureId]);

  useEffect(() => {
    if (!open) {
      setShipDocOpen(false);
      setPrdEditOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!featureId) {
      setFeature(null);
      setLoadError(null);
      setAnswers({});
      return;
    }
    setFeature(null);
    setCursorJob(null);
    setLoadError(null);
    void pullWorkspace();
  }, [featureId, pullWorkspace]);

  const pollStatus = feature?.status;
  useEffect(() => {
    if (!open || !featureId) return;
    if (pollStatus !== "running" && pollStatus !== "queued") return;
    const t = setInterval(() => void pullWorkspace(), 3000);
    void pullWorkspace();
    return () => clearInterval(t);
  }, [open, featureId, pollStatus, pullWorkspace]);

  const latest = useMemo(
    () => (feature ? latestArtifactByType(feature.artifacts) : new Map()),
    [feature],
  );
  const latestRelease = releases[0];
  const contextPack = useMemo(
    () => parseContextPack(feature?.contextPack),
    [feature?.contextPack],
  );
  const contextPreviewUrl = contextPack.previewUrl?.trim() ?? "";
  const referenceScreens = useMemo(
    () => referenceImagesForVision(contextPack),
    [contextPack],
  );

  const shipBrief = useMemo(() => {
    if (!feature) return null;
    const value = latest.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
    const prd = latest.get(ARTIFACT_TYPES.PRD);
    const design = latest.get(ARTIFACT_TYPES.DESIGN_SPEC);
    return composeShipBriefCore({
      featureTitle: feature.title,
      featureDescription: feature.description,
      contextPack,
      value: value
        ? { contentMarkdown: value.contentMarkdown, contentJson: value.contentJson }
        : null,
      prd: prd ? { contentMarkdown: prd.contentMarkdown, contentJson: prd.contentJson } : null,
      design: design
        ? { contentMarkdown: design.contentMarkdown, contentJson: design.contentJson }
        : null,
    });
  }, [contextPack, feature, latest]);

  const shipMarkdownFull = useMemo(() => {
    if (!shipBrief) return "";
    const deploy = formatDeploymentSection({
      previewUrl: contextPreviewUrl || null,
      vercelUrl: latestRelease?.vercelUrl ?? null,
      releaseStatus: latestRelease ? RELEASE_STATUS_LABEL[latestRelease.status] : null,
    });
    return `${shipBrief.markdown}\n\n${deploy}`;
  }, [contextPreviewUrl, latestRelease, shipBrief]);

  const cursorHandoffText = useMemo(() => {
    if (!shipBrief) return "";
    const apopUrl = typeof window !== "undefined" ? window.location.origin : "";
    return buildCursorHandoffPromptWithPreamble(shipBrief, referenceScreens.length, {
      featureId: feature?.id ?? "",
      apopAppUrl: apopUrl,
    });
  }, [feature?.id, referenceScreens.length, shipBrief]);

  const openQuestion = feature?.agentQuestions.find((q) => q.status === "open");
  const questionPayload = openQuestion?.questionJson as AgentQuestionsPayload | undefined;
  const defaultAgent = feature ? STAGE_DEFAULT_AGENT[feature.stage] : null;

  const activityTimeline = useMemo(() => {
    if (!feature) return [];
    const merged = mergeCursorJobForTimeline(feature, cursorJob);
    return buildFeatureActivityTimeline({
      runs: merged.runs ?? [],
      cursorAgentJobs: merged.cursorAgentJobs ?? [],
      releases: merged.releases ?? [],
      approvals: merged.approvals ?? [],
    });
  }, [feature, cursorJob]);
  const showReviewActions = feature?.status === "awaiting_review";
  const showQuestionActions = !!(openQuestion && questionPayload);
  const showStartResearch =
    feature &&
    feature.stage === "VALUE_REVIEW" &&
    (feature.status === "idle" || feature.status === "awaiting_input");
  const showRetryRun =
    feature && (feature.status === "failed" || feature.status === "blocked");

  const implementationUnlocked = useMemo(
    () => !!(feature && canStartCursorImplementation(feature.artifacts)),
    [feature],
  );
  const prdArtifact = latest.get(ARTIFACT_TYPES.PRD);
  const valueArtifact = latest.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  const designArtifact = latest.get(ARTIFACT_TYPES.DESIGN_SPEC);

  function openPrdEditDialog() {
    const art = latest.get(ARTIFACT_TYPES.PRD);
    if (!art) return;
    setPrdJsonDraft(
      art.contentJson && typeof art.contentJson === "object"
        ? JSON.stringify(art.contentJson as object, null, 2)
        : "{}",
    );
    setPrdMdDraft(art.contentMarkdown ?? "");
    setPrdEditOpen(true);
  }

  async function savePrdEdits() {
    if (!feature || !prdArtifact) return;
    setBusy("prd-save");
    try {
      let contentJson: Record<string, unknown>;
      try {
        const parsed = JSON.parse(prdJsonDraft.trim() || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          alert("PRD JSON must be a single object.");
          return;
        }
        contentJson = parsed as Record<string, unknown>;
      } catch {
        alert("Invalid JSON in Cursor prompt.");
        return;
      }
      const res = await fetch(`/api/features/${feature.id}/prd`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentJson, contentMarkdown: prdMdDraft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(
          typeof (j as { error?: unknown }).error === "string"
            ? (j as { error: string }).error
            : "Could not save PRD",
        );
        return;
      }
      setPrdEditOpen(false);
      await pullWorkspace();
    } finally {
      setBusy(null);
    }
  }
  const showPrimaryDeploy =
    !!feature &&
    feature.status === "approved" &&
    (feature.stage === "IN_BUILD" ||
      feature.stage === "QA" ||
      feature.stage === "READY_FOR_BUILD");

  function hrefFromDeploymentUrl(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;
    const t = raw.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    return `https://${t}`;
  }

  function cursorJobNeedsPoll(status: string | null | undefined): boolean {
    if (!status) return true;
    const u = status.toUpperCase();
    return !["FINISHED", "FAILED", "ERROR", "STOPPED"].includes(u);
  }

  useEffect(() => {
    if (!open || !feature?.id) return;
    if (!cursorJob || !cursorJobNeedsPoll(cursorJob.status)) return;
    const id = feature.id;
    const t = setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/features/${id}/cursor-build`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          job: CursorAgentJob | null;
          deployTriggered?: boolean;
        };
        if (data.job) setCursorJob(data.job);
        if (data.deployTriggered) {
          void fetchReleases(true);
          void pullWorkspace();
        }
      })();
    }, 5000);
    return () => clearInterval(t);
  }, [cursorJob, feature?.id, fetchReleases, open, pullWorkspace]);

  useEffect(() => {
    if (!latestRelease) return;
    const poll =
      latestRelease.status === "building" ||
      latestRelease.status === "pending" ||
      (latestRelease.status === "error" && !latestRelease.buildLogExcerpt);
    if (!poll) return;
    const t = setInterval(() => void fetchReleases(true), 5000);
    return () => clearInterval(t);
  }, [fetchReleases, latestRelease]);

  async function startCursorCloudBuild() {
    if (!feature) return;
    setBusy("cursor");
    try {
      const res = await fetch(`/api/features/${feature.id}/cursor-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoDeploy: autoDeployAfterCursor }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        job?: Partial<CursorAgentJob> & { id: string; cursorAgentId: string };
      };
      if (!res.ok) {
        alert(j.error ?? "Could not start Cursor agent");
        return;
      }
      if (j.job) {
        setCursorJob({
          id: j.job.id!,
          featureId: feature.id,
          cursorAgentId: j.job.cursorAgentId,
          status: j.job.status ?? "CREATING",
          cursorSummary: j.job.cursorSummary ?? null,
          agentUrl: j.job.agentUrl ?? null,
          prUrl: j.job.prUrl ?? null,
          targetBranch: j.job.targetBranch ?? null,
          vercelPreviewUrl: j.job.vercelPreviewUrl ?? null,
          errorMessage: j.job.errorMessage ?? null,
          autoDeploy: j.job.autoDeploy ?? autoDeployAfterCursor,
          deployTriggered: j.job.deployTriggered ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  async function triggerRelease() {
    if (!feature) return;
    setBusy("release");
    try {
      const res = await fetch(`/api/features/${feature.id}/release`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error ?? "Release trigger failed");
      }
      await fetchReleases(true);
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  async function approval(status: "approved" | "rejected") {
    if (!feature) return;
    setBusy("approval");
    try {
      await fetch(`/api/features/${feature.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: feature.stage, status, approvedBy: "user" }),
      });
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  async function submitAnswers() {
    if (!feature || !openQuestion) return;
    setBusy("answers");
    try {
      const res = await fetch(`/api/features/${feature.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionRecordId: openQuestion.id, answers }),
      });
      if (!res.ok) alert("Could not save answers");
      setAnswers({});
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  async function runStage() {
    if (!feature) return;
    setBusy("run");
    try {
      const res = await fetch(`/api/features/${feature.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: feature.stage }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error ?? "Run failed");
      }
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  async function deleteFeature() {
    if (!feature) return;
    if (
      !window.confirm(
        "Permanently delete this feature? All runs, artifacts, questions, releases, and Cursor jobs for it will be removed from the database. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/features/${feature.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Could not delete feature");
        return;
      }
      onOpenChange(false);
      await onFeatureDeleted?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cnDialogWide()}>
        {!featureId ? null : loadError && !feature ? (
          <>
            <DialogHeader>
              <DialogTitle>Workspace</DialogTitle>
              <DialogDescription>{loadError}</DialogDescription>
            </DialogHeader>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/features/${featureId}`}>
                Open full page <ExternalLink className="ml-1 size-3.5 opacity-70" />
              </Link>
            </Button>
          </>
        ) : !feature ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <>
            <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 pb-4 pt-2 pr-14 text-left">
              <DialogTitle className="text-lg leading-snug">{feature.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span>{FEATURE_STAGE_LABEL[feature.stage]}</span>
                  {defaultAgent ? (
                    <span className="text-muted-foreground">· {agentDisplayName(defaultAgent)}</span>
                  ) : null}
                  <Badge variant={statusBadgeVariant(feature.status)} className="font-normal">
                    {FEATURE_STATUS_LABEL[feature.status]}
                  </Badge>
                  <Link
                    href={`/features/${feature.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Full workspace <ExternalLink className="ml-0.5 inline size-3 opacity-70" />
                  </Link>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[1fr_min(100%,400px)] lg:divide-x lg:divide-y-0">
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="max-h-[min(88vh,940px)] min-h-[min(40vh,320px)] overflow-y-auto overscroll-y-contain">
                  <div className="space-y-5 p-5 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Ship PRD
                      </p>
                      <span className="text-muted-foreground">·</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setShipDocOpen(true)}
                      >
                        Full document
                      </Button>
                      {prdArtifact ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={openPrdEditDialog}
                        >
                          Edit Cursor prompt
                        </Button>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="default" className="font-normal">
                        Value:{" "}
                        {valueArtifact?.contentMarkdown?.trim() ||
                        (valueArtifact?.contentJson &&
                          typeof valueArtifact.contentJson === "object" &&
                          "summary" in (valueArtifact.contentJson as object))
                          ? "Has content"
                          : "Pending"}
                      </Badge>
                      <Badge variant="default" className="font-normal">
                        Design:{" "}
                        {designArtifact?.contentMarkdown?.trim() ? "Has content" : "Pending"}
                      </Badge>
                      <Badge variant="default" className="font-normal">
                        Cursor prompt: {prdArtifact?.contentMarkdown?.trim() ? "Has content" : "Pending"}
                      </Badge>
                    </div>

                    {implementationUnlocked && shipBrief ? (
                      <CursorHandoffDeliverableCard
                        handoffText={cursorHandoffText}
                        referenceImageCount={referenceScreens.length}
                      />
                    ) : (
                      <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
                        <h3 className="text-[13px] font-semibold">Cursor Cloud deliverable</h3>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                          Shows once <strong className="font-medium text-foreground">Value</strong>,{" "}
                          <strong className="font-medium text-foreground">Design</strong>, and{" "}
                          <strong className="font-medium text-foreground">Cursor prompt</strong> all have content.
                        </p>
                      </section>
                    )}

                    <section className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <h3 className="text-[12px] font-semibold text-foreground">Reference screenshots</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        Same context-pack images as the full workspace (vision for value, design, PRD;{" "}
                        <code className="rounded bg-muted px-1 font-mono text-[10px]">prompt.images</code> for Cursor).
                        Up to {MAX_REFERENCE_IMAGES} files, {Math.round(MAX_IMAGE_BYTES / 1024)}KB each. Add or remove on
                        the{" "}
                        <Link
                          href={`/features/${feature.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          full workspace
                        </Link>
                        .
                      </p>
                      {referenceScreens.length > 0 ? (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {referenceScreens.map((im, i) => (
                            <div
                              key={`${im.name}-${i}`}
                              className="overflow-hidden rounded-md border border-border/60 bg-background"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- data URL previews */}
                              <img
                                src={`data:${im.mimeType};base64,${im.dataBase64}`}
                                alt={im.name}
                                className="aspect-video w-full object-cover object-top"
                              />
                              <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground" title={im.name}>
                                {im.name}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[12px] text-muted-foreground">None attached.</p>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Full Ship PRD (markdown)
                      </h3>
                      <div className="max-w-none rounded-lg border border-border/60 bg-card/50 p-3 text-[13px] leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={shipPrdMarkdownComponents()}
                        >
                          {shipMarkdownFull}
                        </ReactMarkdown>
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              <div className="flex max-h-[min(88vh,940px)] min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
                {feature.stage === "INBOX" &&
                (feature.status === "idle" || feature.status === "awaiting_input") ? (
                  <section className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                    <h3 className="text-[13px] font-semibold">Inbox</h3>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Drag this card to <strong className="text-foreground">Research Analysis</strong> on the
                      board to start value scoring.
                    </p>
                  </section>
                ) : null}

                {showStartResearch ? (
                  <section className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
                    <h3 className="text-[13px] font-semibold">Research</h3>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Uses title + description. Use if idle in Research or stuck on questions.
                    </p>
                    <Button size="sm" className="w-full" onClick={() => void runStage()} disabled={!!busy}>
                      {busy === "run" ? "Starting…" : "Run value analysis"}
                    </Button>
                  </section>
                ) : null}

                {implementationUnlocked || cursorJob ? (
                  <section className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Cursor Cloud
                    </h3>
                    {implementationUnlocked ? (
                      <>
                        <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={autoDeployAfterCursor}
                            onChange={(e) => setAutoDeployAfterCursor(e.target.checked)}
                          />
                          <span>
                            After Cursor <strong className="font-medium">finishes</strong>, run the deploy hook
                            on production (
                            <code className="font-mono text-[10px]">VERCEL_DEPLOY_HOOK_URL</code>
                            ). That rebuilds <strong className="font-medium">main</strong>, not the agent branch —
                            merge the PR first if you need the new code on production.
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="gradientCta"
                            size="sm"
                            onClick={() => void startCursorCloudBuild()}
                            disabled={!!busy}
                          >
                            {busy === "cursor" ? "Starting…" : "Start Cursor agent"}
                          </Button>
                          {cursorJob?.agentUrl ? (
                            <Button type="button" variant="outline" size="sm" asChild>
                              <a href={cursorJob.agentUrl} target="_blank" rel="noreferrer">
                                Open agent
                              </a>
                            </Button>
                          ) : null}
                          {cursorJob?.prUrl ? (
                            <Button type="button" variant="outline" size="sm" asChild>
                              <a href={cursorJob.prUrl} target="_blank" rel="noreferrer">
                                Pull request
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                    {cursorJob ? (
                      <div className="text-[11px] text-muted-foreground">
                        <p>
                          Job{" "}
                          <span className="font-mono text-foreground">{cursorJob.cursorAgentId}</span>
                          {cursorJob.status ? (
                            <>
                              {" "}
                              · <span className="text-foreground">{cursorJob.status}</span>
                            </>
                          ) : null}
                        </p>
                        {cursorJob.cursorSummary?.trim() ? (
                          <p className="mt-1.5 rounded border border-border/50 bg-muted/30 px-2 py-1 text-foreground">
                            {cursorJob.cursorSummary.trim()}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Open agent in Cursor for live progress; API summary appears here when available.
                          </p>
                        )}
                        {cursorJob.autoDeploy && cursorJob.deployTriggered ? (
                          <p className="pt-1 text-foreground">Auto-deploy triggered.</p>
                        ) : null}
                        {!implementationUnlocked && cursorJob.agentUrl ? (
                          <p className="pt-1">
                            <a
                              href={cursorJob.agentUrl}
                              className="text-primary underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Cursor
                            </a>
                          </p>
                        ) : null}
                        {cursorJob.errorMessage ? (
                          <p className="pt-1 text-destructive">{cursorJob.errorMessage}</p>
                        ) : null}
                        {cursorJob.targetBranch?.trim() || cursorJob.prUrl?.trim() ? (
                          <div className="mt-2 space-y-1 rounded-md border border-amber-500/35 bg-amber-500/[0.06] px-2 py-1.5 text-[10px] leading-relaxed dark:bg-amber-500/[0.08]">
                            <p className="font-semibold text-foreground">Cursor preview</p>
                            {cursorJob.vercelPreviewUrl?.trim() ? (
                              <a
                                href={cursorJob.vercelPreviewUrl.trim()}
                                target="_blank"
                                rel="noreferrer"
                                className="block break-all text-primary underline"
                              >
                                {cursorJob.vercelPreviewUrl.trim()}
                              </a>
                            ) : (
                              <p className="text-muted-foreground">
                                Link fills when APOP can read Vercel (token + project id). PR / Vercel
                                dashboard meanwhile.
                              </p>
                            )}
                            {cursorJob.targetBranch?.trim() ? (
                              <p className="font-mono text-[9px] text-foreground">
                                {cursorJob.targetBranch.trim()}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : implementationUnlocked ? (
                      <p className="text-[11px] text-muted-foreground">
                        Sends the Ship PRD (left) to Cursor Cloud on your delivery repo.
                      </p>
                    ) : null}
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {CURSOR_BRANCH_PREVIEW_HINT}
                    </p>
                  </section>
                ) : null}

                {showPrimaryDeploy ? (
                  <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Deploy
                    </h3>
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      Trigger Vercel when the build is ready.
                    </p>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">{VERCEL_DEPLOY_HOOK_HINT}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void triggerRelease()}
                        disabled={!!busy}
                      >
                        {busy === "release" ? "Starting…" : "Deploy to Vercel"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void fetchReleases(true)}
                        disabled={!!busy}
                      >
                        Refresh status
                      </Button>
                    </div>
                    <VercelDeploymentStatus release={latestRelease} compact />
                  </section>
                ) : null}

                <section className="space-y-2">
                  <div className="space-y-0.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Activity timeline
                    </h3>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Newest first — APOP agents, Cursor Cloud, deploys, and approvals.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Feature status:{" "}
                      <span className="font-medium text-foreground">{FEATURE_STATUS_LABEL[feature.status]}</span>
                      {activityTimeline.length > 0 ? (
                        <span className="text-muted-foreground"> · {activityTimeline.length} events</span>
                      ) : null}
                    </p>
                    <ScrollArea className="h-[min(32vh,280px)] pr-2">
                      <div className="flex flex-col gap-2.5">
                        {activityTimeline.length === 0 ? (
                          <p className="text-[12px] text-muted-foreground">
                            {feature.status === "running" || feature.status === "queued"
                              ? "Waiting for the first log line…"
                              : "Nothing in the log yet — runs, Cursor jobs, and deploys appear here."}
                          </p>
                        ) : (
                          activityTimeline.map((row) => (
                            <div
                              key={row.id}
                              className={cn(
                                "border-l-2 pl-2 text-[12px] leading-relaxed",
                                activityBorderClass(row.kind),
                              )}
                            >
                              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                                <span className="text-[10px] tabular-nums text-muted-foreground">
                                  {row.timestamp.toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/80">
                                  {row.label}
                                </span>
                              </div>
                              <p className="mt-0.5 break-words text-foreground">{row.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </section>

                {showQuestionActions ? (
                  <section className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/90 p-3 text-amber-950">
                    <h3 className="text-[13px] font-semibold">Agent questions</h3>
                    <p className="text-[12px] text-amber-900/90">
                      {questionPayload?.agent
                        ? `${agentDisplayName(questionPayload.agent)} needs:`
                        : "Please answer:"}
                    </p>
                    {questionPayload?.questions.map((q) => (
                      <div key={q.id} className="flex flex-col gap-1">
                        <Label htmlFor={`qv-${q.id}`} className="text-amber-950">
                          {q.label}
                          {q.required ? <span className="text-destructive"> *</span> : null}
                        </Label>
                        <p className="text-[11px] text-amber-900/80">{q.reason}</p>
                        {q.type === "text" || q.type === "url" ? (
                          <Input
                            id={`qv-${q.id}`}
                            className="border-amber-200 bg-white/90 text-[13px]"
                            value={answers[q.id] ?? ""}
                            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          />
                        ) : (
                          <Textarea
                            id={`qv-${q.id}`}
                            className="min-h-[72px] border-amber-200 bg-white/90 text-[13px]"
                            value={answers[q.id] ?? ""}
                            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      onClick={() => void submitAnswers()}
                      disabled={!!busy}
                      className="w-full"
                    >
                      {busy === "answers" ? "Saving…" : "Submit answers"}
                    </Button>
                  </section>
                ) : null}

                {showReviewActions ? (
                  <section className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                    <h3 className="text-[14px] font-semibold">Review</h3>
                    <p className="text-[12px] text-muted-foreground">{reviewCopyForStage(feature.stage)}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void approval("approved")} disabled={!!busy}>
                        {busy === "approval" ? "…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void approval("rejected")}
                        disabled={!!busy}
                      >
                        Reject
                      </Button>
                    </div>
                  </section>
                ) : null}

                {showRetryRun ? (
                  <Button variant="outline" size="sm" onClick={() => void runStage()} disabled={!!busy}>
                    {busy === "run" ? "Starting…" : "Try again"}
                  </Button>
                ) : null}

                <section className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3">
                  <h3 className="text-[12px] font-semibold text-destructive">Remove from Kanban</h3>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Deletes this feature and all linked data in the database. The card disappears from Pipeline
                    and Roadmap.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void deleteFeature()}
                    disabled={!!busy}
                  >
                    {busy === "delete" ? "Deleting…" : "Delete feature"}
                  </Button>
                </section>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={shipDocOpen} onOpenChange={setShipDocOpen}>
      <DialogContent className="flex max-h-[min(92vh,960px)] w-[min(96vw,920px)] max-w-[min(96vw,920px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,920px)]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle>Full Ship PRD</DialogTitle>
          <DialogDescription className="text-[12px]">
            Scroll for the complete composed document (idea, value, design, Cursor prompt, deployment).
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="max-w-none pb-6 text-[13px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={shipPrdMarkdownComponents()}>
              {shipMarkdownFull}
            </ReactMarkdown>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={prdEditOpen} onOpenChange={setPrdEditOpen}>
      <DialogContent className="flex max-h-[min(90vh,880px)] w-[min(96vw,640px)] max-w-[min(96vw,640px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle>Edit Cursor prompt (PRD)</DialogTitle>
          <DialogDescription className="text-[12px]">
            JSON drives handoff; markdown is the human view. Saves to the latest PRD artifact.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">PRD JSON</Label>
            <Textarea
              className="min-h-[200px] font-mono text-xs"
              value={prdJsonDraft}
              onChange={(e) => setPrdJsonDraft(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Markdown body</Label>
            <Textarea
              className="min-h-[140px] font-mono text-xs"
              value={prdMdDraft}
              onChange={(e) => setPrdMdDraft(e.target.value)}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setPrdEditOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => void savePrdEdits()} disabled={!!busy}>
            {busy === "prd-save" ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

/** Wide fixed dialog; keeps Radix centering from default DialogContent. */
function cnDialogWide(): string {
  return [
    "flex max-h-[min(96vh,980px)] w-[min(98vw,1360px)] max-w-[min(98vw,1360px)] flex-col gap-0 overflow-hidden p-0",
    "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
    "sm:rounded-lg",
  ].join(" ");
}
