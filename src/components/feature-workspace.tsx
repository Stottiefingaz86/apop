"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AgentQuestion,
  Approval,
  Artifact,
  CursorAgentJob,
  DesignInputs,
  Feature,
  FeatureStage,
  Release,
  RoadmapLane,
  Run,
  RunEvent,
} from "@prisma/client";
import { STAGE_DEFAULT_AGENT } from "@/lib/domain/run-lifecycle";
import { FEATURE_STAGE_LABEL, PIPELINE_STAGE_SELECT_ORDER } from "@/lib/domain/stages";
import { FEATURE_STATUS_LABEL } from "@/lib/domain/statuses";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import { canStartCursorImplementation, latestArtifactByType } from "@/lib/artifact-utils";
import {
  activityBorderClass,
  buildFeatureActivityTimeline,
  mergeCursorJobForTimeline,
} from "@/lib/domain/feature-activity-timeline";
import { readFileAsDataUrl, stripDataUrl } from "@/lib/client/file-data-url";
import { parseContextPack } from "@/lib/domain/context-pack";
import {
  MAX_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
} from "@/lib/domain/feature-attachment-limits";
import { validateFeatureAttachments } from "@/lib/domain/feature-attachments";
import { referenceImagesForVision } from "@/lib/llm/context-pack-llm";
import { ROADMAP_LANE_COLUMN_ORDER, ROADMAP_LANE_LABEL } from "@/lib/domain/roadmap-lanes";
import {
  composeShipBriefCore,
  composeShipBriefSummaryMarkdown,
  formatDeploymentSection,
} from "@/lib/domain/ship-brief";
import { buildCursorHandoffPromptWithPreamble } from "@/lib/cursor/build-cursor-handoff-prompt-text";
import { CursorHandoffDeliverableCard } from "@/components/cursor-handoff-deliverable-card";
import { PrdUseCasesEditor } from "@/components/prd-use-cases-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { shipPrdMarkdownComponents } from "@/components/ship-prd-markdown";
import { VercelDeploymentStatus } from "@/components/vercel-deployment-status";
import { githubTreeUrl } from "@/lib/cursor/github-branch-url";
import {
  CURSOR_BRANCH_PREVIEW_HINT,
  VERCEL_DEPLOY_HOOK_HINT,
} from "@/lib/vercel/deploy-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RunWithEvents = Run & { events: RunEvent[] };

export type FeatureWorkspaceModel = Feature & {
  artifacts: Artifact[];
  runs: RunWithEvents[];
  agentQuestions: AgentQuestion[];
  designInputs: DesignInputs | null;
  approvals: Approval[];
  releases: Release[];
  cursorAgentJobs: CursorAgentJob[];
  /** Set on server — GitHub repo for Cursor builds; used for branch links */
  deliveryRepositoryWebUrl?: string | null;
};

const ARTIFACT_TABS = [
  { type: ARTIFACT_TYPES.VALUE_ANALYSIS, label: "Value" },
  { type: ARTIFACT_TYPES.DESIGN_SPEC, label: "Design" },
  { type: ARTIFACT_TYPES.PRD, label: "Cursor prompt" },
  { type: ARTIFACT_TYPES.SHIP_BRIEF, label: "Ship snapshot" },
  { type: ARTIFACT_TYPES.DEPLOYMENT_REMEDIATION, label: "Deploy fix" },
] as const;

const RELEASE_STATUS_LABEL: Record<Release["status"], string> = {
  pending: "Pending",
  building: "Building",
  ready: "Ready",
  error: "Failed",
  canceled: "Canceled",
};

function agentDisplayName(raw: string): string {
  return raw.replace(/-agent$/i, "").replace(/-/g, " ");
}

function statusBadgeVariant(
  status: Feature["status"],
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

function roadmapFormFromFeature(f: Feature) {
  const td = f.roadmapTargetDate as Date | string | null | undefined;
  const targetDate =
    td instanceof Date && !Number.isNaN(td.getTime())
      ? td.toISOString().slice(0, 10)
      : typeof td === "string" && td.length >= 10
        ? String(td).slice(0, 10)
        : "";
  return {
    lane: f.roadmapLane,
    costEstimate: f.roadmapCostEstimate ?? "",
    targetDate,
    expectedLiftPercent:
      f.roadmapExpectedLiftPercent != null && Number.isFinite(f.roadmapExpectedLiftPercent)
        ? String(f.roadmapExpectedLiftPercent)
        : "",
    expectedLiftMetric: f.roadmapExpectedLiftMetric ?? "",
  };
}

function statusHeadline(
  status: Feature["status"],
  stage: FeatureStage,
  hasOpenQuestion: boolean,
  hasRuns: boolean,
): { title: string; detail: string } {
  if (hasOpenQuestion) {
    return {
      title: "The agent needs a bit more from you",
      detail: "Answer the questions below so it can continue.",
    };
  }
  if (status === "approved" && (stage === "IN_BUILD" || stage === "QA")) {
    return {
      title: "Signed off — deploy when ready",
      detail:
        "The Ship PRD below is your spec. Start a Cursor Cloud Agent to implement it, or deploy manually when the build is ready.",
    };
  }
  switch (status) {
    case "running":
      return {
        title: "Working on your idea",
        detail: "The agent is analysing and drafting — updates appear below as it goes.",
      };
    case "awaiting_review":
      return {
        title: "Ready for your review",
        detail: "Check the draft and approve or reject to move on.",
      };
    case "awaiting_input":
      return {
        title: "Waiting on your input",
        detail: "Fill in the form below.",
      };
    case "failed":
      return {
        title: "Something went wrong",
        detail: "You can try running the agent again.",
      };
    case "blocked":
      return {
        title: "Blocked",
        detail: "Adjust the idea or context and try again.",
      };
    default:
      if (!hasRuns) {
        return {
          title: "Starting…",
          detail: "The agent will begin in a moment.",
        };
      }
      return {
        title: "Up to date",
        detail: "When you move the card on the pipeline or run the next stage, progress continues here.",
      };
  }
}

export function FeatureWorkspace({ initial }: { initial: FeatureWorkspaceModel }) {
  const router = useRouter();
  const [feature, setFeature] = useState(initial);
  const [releases, setReleases] = useState<Release[]>(initial.releases ?? []);
  const [contextJson, setContextJson] = useState(
    JSON.stringify(initial.contextPack ?? {}, null, 2),
  );
  const [designForm, setDesignForm] = useState({
    tokenJson: initial.designInputs?.tokenJson
      ? JSON.stringify(initial.designInputs.tokenJson, null, 2)
      : "",
    figmaUrl: initial.designInputs?.figmaUrl ?? "",
    brandDescription: initial.designInputs?.brandDescription ?? "",
    uxDirection: initial.designInputs?.uxDirection ?? "",
    competitors: Array.isArray(initial.designInputs?.competitorUrls)
      ? (initial.designInputs?.competitorUrls as string[]).join("\n")
      : "",
    notes: initial.designInputs?.notes ?? "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [shipPrdOpen, setShipPrdOpen] = useState(false);
  const [prdEditOpen, setPrdEditOpen] = useState(false);
  const [prdJsonDraft, setPrdJsonDraft] = useState("");
  const [prdMdDraft, setPrdMdDraft] = useState("");
  const [autoDeployAfterCursor, setAutoDeployAfterCursor] = useState(true);
  const [cursorJob, setCursorJob] = useState<CursorAgentJob | null>(
    () => initial.cursorAgentJobs?.[0] ?? null,
  );
  const [roadmapForm, setRoadmapForm] = useState(() => roadmapFormFromFeature(initial));
  useEffect(() => {
    setFeature(initial);
    setReleases(initial.releases ?? []);
    setCursorJob(initial.cursorAgentJobs?.[0] ?? null);
    setRoadmapForm(roadmapFormFromFeature(initial));
  }, [initial]);

  const latest = useMemo(() => latestArtifactByType(feature.artifacts), [feature.artifacts]);
  const prdArtifact = latest.get(ARTIFACT_TYPES.PRD);
  const latestRelease = releases[0];
  const contextPack = useMemo(
    () => parseContextPack(feature.contextPack),
    [feature.contextPack],
  );
  const referenceScreens = useMemo(
    () => referenceImagesForVision(contextPack),
    [contextPack],
  );
  const refScreenshotInputRef = useRef<HTMLInputElement>(null);
  const contextPreviewUrl = contextPack.previewUrl?.trim() ?? "";

  const cursorGithubTreeUrl = useMemo(() => {
    const repo = initial.deliveryRepositoryWebUrl?.trim();
    const br = cursorJob?.targetBranch?.trim();
    if (!repo || !br) return null;
    return githubTreeUrl(repo, br);
  }, [initial.deliveryRepositoryWebUrl, cursorJob?.targetBranch]);

  const shipBrief = useMemo(() => {
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
  }, [contextPack, feature.description, feature.title, latest]);

  const cursorHandoffText = useMemo(() => {
    const apopUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "";
    return buildCursorHandoffPromptWithPreamble(shipBrief, referenceScreens.length, {
      featureId: feature.id,
      apopAppUrl: apopUrl,
    });
  }, [feature.id, referenceScreens.length, shipBrief]);

  const shipMarkdownFull = useMemo(() => {
    const deploy = formatDeploymentSection({
      previewUrl: contextPreviewUrl || null,
      vercelUrl: latestRelease?.vercelUrl ?? null,
      releaseStatus: latestRelease ? RELEASE_STATUS_LABEL[latestRelease.status] : null,
    });
    return `${shipBrief.markdown}\n\n${deploy}`;
  }, [contextPreviewUrl, latestRelease, shipBrief.markdown]);

  const shipMarkdownSummary = useMemo(() => {
    const value = latest.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
    const prd = latest.get(ARTIFACT_TYPES.PRD);
    const design = latest.get(ARTIFACT_TYPES.DESIGN_SPEC);
    return composeShipBriefSummaryMarkdown({
      featureTitle: feature.title,
      featureDescription: feature.description,
      value: value
        ? { contentMarkdown: value.contentMarkdown, contentJson: value.contentJson }
        : null,
      prd: prd ? { contentMarkdown: prd.contentMarkdown, contentJson: prd.contentJson } : null,
      design: design
        ? { contentMarkdown: design.contentMarkdown, contentJson: design.contentJson }
        : null,
    });
  }, [feature.description, feature.title, latest]);

  const implementationUnlocked = useMemo(
    () => canStartCursorImplementation(feature.artifacts),
    [feature.artifacts],
  );

  const openQuestion = feature.agentQuestions.find((q) => q.status === "open");
  const questionPayload = openQuestion?.questionJson as AgentQuestionsPayload | undefined;

  const defaultAgent = STAGE_DEFAULT_AGENT[feature.stage];

  const activityTimeline = useMemo(() => {
    const merged = mergeCursorJobForTimeline(feature, cursorJob);
    return buildFeatureActivityTimeline({
      runs: merged.runs ?? [],
      cursorAgentJobs: merged.cursorAgentJobs ?? [],
      releases: merged.releases ?? [],
      approvals: merged.approvals ?? [],
    });
  }, [feature, cursorJob]);

  const headline = statusHeadline(
    feature.status,
    feature.stage,
    !!(openQuestion && questionPayload),
    feature.runs.length > 0,
  );

  const showPrimaryDeploy =
    feature.status === "approved" &&
    (feature.stage === "IN_BUILD" ||
      feature.stage === "QA" ||
      feature.stage === "READY_FOR_BUILD");

  function cursorJobNeedsPoll(status: string | null | undefined): boolean {
    if (!status) return true;
    const u = status.toUpperCase();
    return !["FINISHED", "FAILED", "ERROR", "STOPPED"].includes(u);
  }

  async function startCursorCloudBuild() {
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
          id: j.job.id,
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
  }

  function hrefFromDeploymentUrl(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;
    const t = raw.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    return `https://${t}`;
  }

  const fetchReleases = useCallback(async (refresh: boolean) => {
    const res = await fetch(
      `/api/features/${feature.id}/releases${refresh ? "?refresh=1" : ""}`,
    );
    if (!res.ok) return;
    const rows = (await res.json()) as Release[];
    setReleases(rows);
  }, [feature.id]);

  const pullWorkspace = useCallback(async () => {
    try {
      const res = await fetch(`/api/features/${feature.id}/workspace`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as FeatureWorkspaceModel;
      if (!data.cursorAgentJobs) data.cursorAgentJobs = [];
      setFeature(data);
      setReleases(data.releases ?? []);
      setCursorJob(data.cursorAgentJobs?.[0] ?? null);
    } catch {
      /* ignore transient errors */
    }
  }, [feature.id]);

  useEffect(() => {
    if (!cursorJob || !cursorJobNeedsPoll(cursorJob.status)) return;
    const t = setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/features/${feature.id}/cursor-build`);
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
  }, [cursorJob, feature.id, fetchReleases, pullWorkspace]);

  useEffect(() => {
    if (!latestRelease) return;
    const poll =
      latestRelease.status === "building" ||
      latestRelease.status === "pending" ||
      (latestRelease.status === "error" && !latestRelease.buildLogExcerpt);
    if (!poll) return;
    const t = setInterval(() => {
      void fetchReleases(true);
    }, 5000);
    return () => clearInterval(t);
  }, [fetchReleases, latestRelease]);

  /** Agent progress — poll JSON instead of `router.refresh()` (RSC refetches are brittle in dev). */
  useEffect(() => {
    if (feature.status !== "running" && feature.status !== "queued") return;
    const t = setInterval(() => void pullWorkspace(), 3000);
    void pullWorkspace();
    return () => clearInterval(t);
  }, [feature.status, pullWorkspace]);

  async function patchFeature(body: object) {
    const res = await fetch(`/api/features/${feature.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json() as Promise<Feature>;
  }

  async function saveRoadmapMeta() {
    setBusy("roadmap");
    try {
      const pct = roadmapForm.expectedLiftPercent.trim();
      let roadmapExpectedLiftPercent: number | null = null;
      if (pct !== "") {
        const n = Number(pct);
        if (!Number.isFinite(n)) {
          alert("Expected lift % must be a number.");
          return;
        }
        roadmapExpectedLiftPercent = n;
      }
      const targetDate = roadmapForm.targetDate.trim();
      const roadmapTargetDate = targetDate
        ? new Date(targetDate + "T12:00:00Z").toISOString()
        : null;
      const f = await patchFeature({
        roadmapLane: roadmapForm.lane,
        roadmapCostEstimate: roadmapForm.costEstimate.trim() || null,
        roadmapTargetDate,
        roadmapExpectedLiftPercent,
        roadmapExpectedLiftMetric: roadmapForm.expectedLiftMetric.trim() || null,
      });
      setFeature((prev) => ({ ...prev, ...f }));
      setRoadmapForm(roadmapFormFromFeature(f));
    } catch {
      alert("Could not save roadmap fields.");
    } finally {
      setBusy(null);
    }
  }

  async function saveContext() {
    setBusy("context");
    try {
      const parsed = JSON.parse(contextJson || "{}");
      const f = await patchFeature({ contextPack: parsed });
      setFeature((prev) => ({ ...prev, contextPack: f.contextPack }));
    } catch {
      alert("Invalid JSON in context pack");
    } finally {
      setBusy(null);
    }
  }

  async function addReferenceScreenshots(files: FileList | null) {
    if (!files?.length) return;
    const base = { ...parseContextPack(feature.contextPack) } as Record<string, unknown>;
    const existing = referenceScreens;
    const next = [...existing];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_REFERENCE_IMAGES) {
        alert(`At most ${MAX_REFERENCE_IMAGES} reference screenshots.`);
        break;
      }
      if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(f.type)) {
        alert(`“${f.name}”: use PNG, JPEG, WebP, or GIF.`);
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        alert(`“${f.name}” is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024)}KB).`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(f);
      const stripped = stripDataUrl(dataUrl);
      if (!stripped) {
        alert(`Could not read “${f.name}”.`);
        continue;
      }
      next.push({ name: f.name, mimeType: stripped.mimeType, dataBase64: stripped.dataBase64 });
    }
    const att = validateFeatureAttachments({ referenceImages: next });
    if (!att.ok) {
      alert(att.error);
      return;
    }
    if (next.length === existing.length) return;
    base.referenceImages = next;
    setBusy("refimg");
    try {
      const f = await patchFeature({ contextPack: base });
      setFeature((prev) => ({ ...prev, contextPack: f.contextPack }));
    } catch {
      alert("Could not save screenshots.");
    } finally {
      setBusy(null);
    }
  }

  async function removeReferenceScreenshot(index: number) {
    const base = { ...parseContextPack(feature.contextPack) } as Record<string, unknown>;
    const next = referenceScreens.filter((_, i) => i !== index);
    if (next.length) base.referenceImages = next;
    else delete base.referenceImages;
    setBusy("refimg");
    try {
      const f = await patchFeature({ contextPack: base });
      setFeature((prev) => ({ ...prev, contextPack: f.contextPack }));
    } catch {
      alert("Could not remove screenshot.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDesignInputs() {
    setBusy("design");
    try {
      let tokenJson: unknown = null;
      if (designForm.tokenJson.trim()) {
        try {
          tokenJson = JSON.parse(designForm.tokenJson);
        } catch {
          alert("Token JSON invalid");
          setBusy(null);
          return;
        }
      }
      const res = await fetch(`/api/features/${feature.id}/design-inputs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenJson,
          figmaUrl: designForm.figmaUrl || null,
          brandDescription: designForm.brandDescription || null,
          uxDirection: designForm.uxDirection || null,
          competitorUrls: designForm.competitors
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          notes: designForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      await res.json();
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  const runStage = useCallback(
    async (overrideStage?: FeatureStage) => {
      setBusy("run");
      try {
        const res = await fetch(`/api/features/${feature.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: overrideStage ?? feature.stage }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert((j as { error?: string }).error ?? "Run failed");
        }
      } finally {
        setBusy(null);
      }
      await pullWorkspace();
    },
    [feature.id, feature.stage, pullWorkspace],
  );

  async function submitAnswers() {
    if (!openQuestion) return;
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

  async function triggerRelease() {
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

  async function runRemediation(releaseId: string) {
    setBusy("remediate");
    try {
      const res = await fetch(
        `/api/features/${feature.id}/releases/${releaseId}/remediate`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error ?? "Remediation failed");
      }
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

  async function approval(status: "approved" | "rejected") {
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

  async function setStage(stage: FeatureStage) {
    setBusy("stage");
    try {
      const f = await patchFeature({ stage });
      setFeature((prev) => ({ ...prev, ...f }));
    } finally {
      setBusy(null);
    }
    await pullWorkspace();
  }

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
    if (!prdArtifact) return;
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
        body: JSON.stringify({
          contentJson,
          contentMarkdown: prdMdDraft,
        }),
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

  async function deleteFeature() {
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
      router.push("/pipeline");
    } finally {
      setBusy(null);
    }
  }

  const showQuestionActions = !!(openQuestion && questionPayload);
  const showReviewActions = feature.status === "awaiting_review";
  const showRetryAction =
    feature.status === "failed" || feature.status === "blocked" || feature.status === "idle";
  const showStartResearch =
    feature.stage === "VALUE_REVIEW" &&
    (feature.status === "idle" || feature.status === "awaiting_input");

  const reviewCopy =
    feature.stage === "READY_FOR_BUILD" ? (
      <>
        Approve to move into build. Full handoff is in{" "}
        <strong className="text-foreground">Open full Ship PRD</strong>.
      </>
    ) : feature.stage === "PRD" ? (
      <>
        Approve the <strong className="text-foreground">Cursor prompt</strong> on the pipeline card when it looks
        right — the feature jumps to <strong className="text-foreground">In build</strong> (signed off) so you can{" "}
        <strong className="text-foreground">Deploy</strong> or <strong className="text-foreground">Start Cursor</strong>{" "}
        without dragging columns.
      </>
    ) : feature.stage === "DESIGN_SPEC" ? (
      <>
        Approve to run <strong className="text-foreground">Design</strong> if needed, or to create the{" "}
        <strong className="text-foreground">Cursor prompt</strong> once a design spec exists.
      </>
    ) : feature.stage === "INBOX" ? (
      <>
        Inbox holds ideas only. Drag the card to <strong className="text-foreground">Research Analysis</strong>{" "}
        on the pipeline to start value scoring — nothing runs automatically here.
      </>
    ) : feature.stage === "VALUE_REVIEW" ? (
      <>
        When value analysis looks right, use <strong className="text-foreground">Approve value</strong> on the pipeline
        card — APOP moves the feature to <strong className="text-foreground">Design</strong> and starts the design
        agent. Then <strong className="text-foreground">Approve design</strong>, then{" "}
        <strong className="text-foreground">Approve PRD</strong> — only drag needed is from Inbox into Research.
      </>
    ) : (
      "Approve to advance the pipeline, or reject to send it back."
    );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/pipeline"
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              ← Pipeline
            </Link>
            <Link
              href="/roadmap"
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              Roadmap
            </Link>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground">{feature.title}</h1>
          <p className="text-[14px] text-muted-foreground">
            {FEATURE_STAGE_LABEL[feature.stage]}
            {defaultAgent ? (
              <>
                {" · "}
                <span className="text-foreground/80">{agentDisplayName(defaultAgent)}</span>
              </>
            ) : null}
          </p>
        </div>

        <Card className="border-border/80 shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-[15px] font-semibold">Roadmap</CardTitle>
            <CardDescription className="text-[12px] leading-relaxed">
              Lane, target date, cost, and expected lift appear on the org roadmap. Set a target date to place
              this in the right quarter (Current, Q1, Q2, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <Label htmlFor="roadmap-lane" className="text-[12px] text-muted-foreground">
                Lane
              </Label>
              <select
                id="roadmap-lane"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
                value={roadmapForm.lane}
                onChange={(e) =>
                  setRoadmapForm((r) => ({ ...r, lane: e.target.value as RoadmapLane }))
                }
                disabled={!!busy}
              >
                {ROADMAP_LANE_COLUMN_ORDER.map((lane) => (
                  <option key={lane} value={lane}>
                    {ROADMAP_LANE_LABEL[lane]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <Label htmlFor="roadmap-target-date" className="text-[12px] text-muted-foreground">
                Target date
              </Label>
              <Input
                id="roadmap-target-date"
                type="date"
                value={roadmapForm.targetDate}
                onChange={(e) =>
                  setRoadmapForm((r) => ({ ...r, targetDate: e.target.value }))
                }
                disabled={!!busy}
              />
            </div>
            <div className="flex min-w-[200px] flex-[2] flex-col gap-1.5">
              <Label htmlFor="roadmap-cost" className="text-[12px] text-muted-foreground">
                Cost / effort
              </Label>
              <Input
                id="roadmap-cost"
                placeholder="e.g. 3 eng weeks, $40k vendor"
                value={roadmapForm.costEstimate}
                onChange={(e) => setRoadmapForm((r) => ({ ...r, costEstimate: e.target.value }))}
                disabled={!!busy}
              />
            </div>
            <div className="flex min-w-[100px] flex-col gap-1.5">
              <Label htmlFor="roadmap-lift-pct" className="text-[12px] text-muted-foreground">
                Expected lift %
              </Label>
              <Input
                id="roadmap-lift-pct"
                inputMode="decimal"
                placeholder="e.g. 12"
                value={roadmapForm.expectedLiftPercent}
                onChange={(e) => setRoadmapForm((r) => ({ ...r, expectedLiftPercent: e.target.value }))}
                disabled={!!busy}
              />
            </div>
            <div className="flex min-w-[200px] flex-[2] flex-col gap-1.5">
              <Label htmlFor="roadmap-lift-metric" className="text-[12px] text-muted-foreground">
                Lift applies to (KPI)
              </Label>
              <Input
                id="roadmap-lift-metric"
                placeholder="e.g. cross-sell attach rate"
                value={roadmapForm.expectedLiftMetric}
                onChange={(e) => setRoadmapForm((r) => ({ ...r, expectedLiftMetric: e.target.value }))}
                disabled={!!busy}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void saveRoadmapMeta()}
              disabled={!!busy}
            >
              {busy === "roadmap" ? "Saving…" : "Save roadmap"}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ship PRD
          </h2>
          <p className="text-[11px] text-muted-foreground lg:max-w-[20rem] lg:text-right">
            Cursor Cloud and Vercel deploy are in the sidebar →
          </p>
        </div>

        <Card className="border-border/70 bg-muted/10">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-[13px] font-semibold">Reference screenshots</CardTitle>
            <CardDescription className="text-[12px] leading-relaxed">
              Stored in the context pack. Passed as vision to <strong className="font-medium text-foreground">value</strong>,{" "}
              <strong className="font-medium text-foreground">design spec</strong>, and{" "}
              <strong className="font-medium text-foreground">PRD</strong> agents; sent to Cursor Cloud as{" "}
              <code className="rounded bg-muted px-1 font-mono text-[10px]">prompt.images</code> when you start an agent.
              Up to {MAX_REFERENCE_IMAGES} files, {Math.round(MAX_IMAGE_BYTES / 1024)}KB each.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {referenceScreens.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {referenceScreens.map((im, i) => (
                  <div
                    key={`${im.name}-${i}`}
                    className="overflow-hidden rounded-lg border border-border/60 bg-background"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic data: URLs */}
                    <img
                      src={`data:${im.mimeType};base64,${im.dataBase64}`}
                      alt={im.name}
                      className="max-h-48 w-full object-contain object-top"
                    />
                    <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-1.5">
                      <span className="truncate text-[11px] text-muted-foreground" title={im.name}>
                        {im.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => void removeReferenceScreenshot(i)}
                        disabled={!!busy}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No screenshots yet — add PNG, JPEG, WebP, or GIF below.
              </p>
            )}
            <input
              ref={refScreenshotInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={(e) => {
                void addReferenceScreenshots(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!!busy || referenceScreens.length >= MAX_REFERENCE_IMAGES}
                onClick={() => refScreenshotInputRef.current?.click()}
              >
                {busy === "refimg" ? "Saving…" : "Add screenshots"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {implementationUnlocked ? (
          <CursorHandoffDeliverableCard
            handoffText={cursorHandoffText}
            referenceImageCount={referenceScreens.length}
          />
        ) : (
          <Card className="border-border/70 bg-muted/10">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-[13px] font-semibold">Cursor Cloud deliverable</CardTitle>
              <CardDescription className="text-[12px] leading-relaxed">
                The exact prompt text appears here once <strong className="font-medium text-foreground">Value</strong>,{" "}
                <strong className="font-medium text-foreground">Design</strong>, and{" "}
                <strong className="font-medium text-foreground">Cursor prompt</strong> all have content. Approve each
                stage on the pipeline — the handoff is built from those artifacts.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card className="border-border/60 shadow-[0_2px_8px_rgba(15,15,15,0.04)] ring-1 ring-black/[0.03] dark:ring-white/[0.06] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-border/50 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-[13px] font-semibold">At-a-glance</CardTitle>
              <CardDescription className="text-[12px] leading-relaxed">
                Short checklist for this feature. The{" "}
                <strong className="font-medium text-foreground">Cursor Cloud deliverable</strong> card above is what
                ships to the agent; use <strong className="font-medium text-foreground">Open full Ship PRD</strong> for
                the complete sign-off document.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {prdArtifact ? (
                <Button type="button" variant="outline" size="sm" onClick={openPrdEditDialog}>
                  Edit Cursor prompt
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => setShipPrdOpen(true)}>
                Open full Ship PRD
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 py-6 sm:px-8 sm:py-7">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={shipPrdMarkdownComponents()}>
              {shipMarkdownSummary}
            </ReactMarkdown>
          </CardContent>
        </Card>

        <Dialog open={shipPrdOpen} onOpenChange={setShipPrdOpen}>
          <DialogContent className="flex max-h-[min(90vh,900px)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 text-left">
              <DialogTitle>Full Ship PRD</DialogTitle>
              <DialogDescription>
                Idea, value, design, Cursor prompt, implementation notes, and deployment.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1 px-6 py-4">
              <div className="pr-3 pb-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={shipPrdMarkdownComponents()}>
                  {shipMarkdownFull}
                </ReactMarkdown>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Dialog open={prdEditOpen} onOpenChange={setPrdEditOpen}>
          <DialogContent className="flex max-h-[min(90vh,900px)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 text-left">
              <DialogTitle>Edit Cursor prompt (PRD)</DialogTitle>
              <DialogDescription>
                The JSON object is what ship brief and handoff read; markdown is the human-readable view. Both are
                saved together.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 max-h-[min(56vh,480px)] flex-1 px-6 py-4">
              <div className="flex flex-col gap-3 pr-3 pb-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px] text-muted-foreground">PRD JSON</Label>
                  <Textarea
                    className="min-h-[220px] font-mono text-xs"
                    value={prdJsonDraft}
                    onChange={(e) => setPrdJsonDraft(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px] text-muted-foreground">Markdown body</Label>
                  <Textarea
                    className="min-h-[160px] font-mono text-xs"
                    value={prdMdDraft}
                    onChange={(e) => setPrdMdDraft(e.target.value)}
                  />
                </div>
              </div>
            </ScrollArea>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/60 px-6 py-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setPrdEditOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void savePrdEdits()} disabled={!!busy}>
                {busy === "prd-save" ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusBadgeVariant(feature.status)} className="font-normal">
            {FEATURE_STATUS_LABEL[feature.status]}
          </Badge>
          {typeof feature.score === "number" ? (
            <Badge variant="default" className="tabular-nums">
              Score {feature.score.toFixed(1)}
            </Badge>
          ) : null}
          {feature.status === "running" ? (
            <span className="text-[13px] text-muted-foreground">Updating every few seconds…</span>
          ) : null}
        </div>
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">{headline.title}</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{headline.detail}</p>
        </div>
      </section>

      {showQuestionActions ? (
        <section className="flex flex-col gap-4 rounded-xl border border-amber-200/80 bg-amber-50/90 p-5 text-amber-950">
          <h2 className="text-[16px] font-semibold">Questions from the agent</h2>
          <p className="text-[13px] leading-relaxed text-amber-900/90">
            {questionPayload?.agent ? `${agentDisplayName(questionPayload.agent)} needs:` : "Please answer:"}
          </p>
          {questionPayload?.questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1">
              <Label htmlFor={q.id} className="text-amber-950">
                {q.label}
                {q.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              <p className="text-[12px] text-amber-900/80">{q.reason}</p>
              {q.type === "text" || q.type === "url" ? (
                <Input
                  id={q.id}
                  className="border-amber-200 bg-white/90"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              ) : (
                <Textarea
                  id={q.id}
                  className="min-h-[80px] border-amber-200 bg-white/90"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <Button onClick={submitAnswers} disabled={!!busy} className="w-full sm:w-auto">
            {busy === "answers" ? "Saving…" : "Submit answers"}
          </Button>
        </section>
      ) : null}

      {showRetryAction && (feature.status === "failed" || feature.status === "blocked") ? (
        <Button variant="outline" onClick={() => void runStage()} disabled={!!busy}>
          {busy === "run" ? "Starting…" : "Try again"}
        </Button>
      ) : null}

      <details className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4">
        <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground">
          Advanced — stage, context, design, deploy
        </summary>
        <div className="mt-6 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-semibold">Stage</CardTitle>
              <CardDescription className="text-[12px]">
                Prefer dragging the card on the pipeline; you can override here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="h-9 w-full max-w-md rounded-md border border-border bg-card px-2 text-sm"
                value={feature.stage}
                onChange={(e) => setStage(e.target.value as FeatureStage)}
                disabled={!!busy}
              >
                {PIPELINE_STAGE_SELECT_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {FEATURE_STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-semibold">Context pack (JSON)</CardTitle>
              <CardDescription className="text-[12px]">
                Facts agents must not invent. Optional <code className="rounded bg-muted px-1">previewUrl</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Textarea
                className="min-h-[160px] font-mono text-xs"
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={saveContext} disabled={!!busy}>
                Save context
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-semibold">All artifacts</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={ARTIFACT_TYPES.VALUE_ANALYSIS}>
                <TabsList>
                  {ARTIFACT_TABS.map((t) => (
                    <TabsTrigger key={t.type} value={t.type}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {ARTIFACT_TABS.map((t) => {
                  const art = latest.get(t.type);
                  return (
                    <TabsContent key={t.type} value={t.type}>
                      {art?.contentMarkdown ? (
                        <div className="max-w-none space-y-2 text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-4 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-1 [&_th]:border [&_th]:border-border [&_th]:p-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{art.contentMarkdown}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No artifact for this type.</p>
                      )}
                      {t.type === ARTIFACT_TYPES.PRD ? (
                        <div className="mt-6">
                          <PrdUseCasesEditor
                            featureId={feature.id}
                            featureTitle={feature.title}
                            artifact={art ?? null}
                            disabled={!!busy}
                            onSaved={() => void pullWorkspace()}
                          />
                        </div>
                      ) : null}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-semibold">Design inputs</CardTitle>
              <CardDescription className="text-[12px]">
                Optional enrichment. Leave blank and the agent uses the delivery repo theme (globals.css,
                shadcn) plus context pack and value analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>Token JSON</Label>
                <Textarea
                  className="min-h-[100px] font-mono text-xs"
                  value={designForm.tokenJson}
                  onChange={(e) => setDesignForm((d) => ({ ...d, tokenJson: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Figma URL</Label>
                <Input
                  value={designForm.figmaUrl}
                  onChange={(e) => setDesignForm((d) => ({ ...d, figmaUrl: e.target.value }))}
                />
              </div>
              <Button variant="outline" size="sm" onClick={saveDesignInputs} disabled={!!busy}>
                Save design inputs
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-semibold">Vercel release</CardTitle>
              <CardDescription className="text-[12px]">
                {showPrimaryDeploy
                  ? "Primary deploy controls are above when this feature is signed off."
                  : "Trigger a deployment once the feature is approved."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {!showPrimaryDeploy ? (
                  <Button size="sm" onClick={triggerRelease} disabled={!!busy}>
                    Trigger deploy
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => void fetchReleases(true)}>
                  Refresh status
                </Button>
              </div>
              <VercelDeploymentStatus release={latestRelease} />
              {latestRelease?.status === "error" && latestRelease.vercelDeploymentId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runRemediation(latestRelease.id)}
                  disabled={!!busy}
                >
                  Re-run remediation
                </Button>
              ) : null}
              {contextPreviewUrl ? (
                <a
                  href={hrefFromDeploymentUrl(contextPreviewUrl) ?? contextPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline"
                >
                  Preview from context pack
                </a>
              ) : null}
            </CardContent>
          </Card>

          <Button variant="ghost" size="sm" onClick={() => void runStage()} disabled={!!busy}>
            Run agent for current stage (manual)
          </Button>
        </div>
      </details>

      <Card className="border-destructive/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px] font-semibold text-destructive">
            Remove from Kanban
          </CardTitle>
          <CardDescription className="text-[12px] leading-relaxed">
            Deletes the feature row in Postgres and all linked data (cascade). The card disappears
            from Pipeline and Roadmap. Production is still whatever{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">DATABASE_URL</code> points
            to — same DB locally, hosted Postgres (e.g. Supabase) in prod.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={() => void deleteFeature()} disabled={!!busy}>
            {busy === "delete" ? "Deleting…" : "Delete feature"}
          </Button>
        </CardContent>
      </Card>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-6 lg:sticky lg:top-6 lg:w-[min(100%,20rem)] xl:w-[22rem]">
            {feature.stage === "INBOX" &&
            (feature.status === "idle" || feature.status === "awaiting_input") ? (
              <section className="rounded-xl border border-border/80 bg-muted/20 p-4">
                <h2 className="text-[14px] font-semibold tracking-tight">Inbox</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Drag this card to <strong className="text-foreground">Research Analysis</strong> on the
                  pipeline to start value scoring. Research does not run while the card stays in Inbox.
                </p>
              </section>
            ) : null}

            {showStartResearch ? (
              <section className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
                <h2 className="text-[14px] font-semibold tracking-tight">Research</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Runs value analysis from your title and description (no required form). Use if the card is
                  idle in Research or you need to re-run after updating context.
                </p>
                <Button className="mt-3 w-full" onClick={() => void runStage()} disabled={!!busy}>
                  {busy === "run" ? "Starting…" : "Run value analysis"}
                </Button>
              </section>
            ) : null}

            {implementationUnlocked || cursorJob ? (
              <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Cursor Cloud
                </h2>
                {implementationUnlocked ? (
                  <>
                    <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-relaxed">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={autoDeployAfterCursor}
                        onChange={(e) => setAutoDeployAfterCursor(e.target.checked)}
                      />
                      <span>
                        After the Cursor agent <strong className="font-medium">finishes</strong>, run the deploy
                        hook on production (
                        <code className="font-mono text-[11px]">VERCEL_DEPLOY_HOOK_URL</code> required). That
                        rebuilds <strong className="font-medium">main</strong>, not the agent branch — merge the
                        PR first if you need new code on production.
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="gradientCta"
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
                  <div className="text-[12px] text-muted-foreground">
                    <p>
                      Cursor job{" "}
                      <span className="font-mono text-foreground">{cursorJob.cursorAgentId}</span>
                      {cursorJob.status ? (
                        <>
                          {" "}
                          · status <span className="text-foreground">{cursorJob.status}</span>
                        </>
                      ) : null}
                    </p>
                    {cursorJob.cursorSummary?.trim() ? (
                      <p className="mt-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
                        <span className="font-medium text-muted-foreground">From Cursor API: </span>
                        {cursorJob.cursorSummary.trim()}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        Cursor doesn’t expose step-by-step logs here — use <strong>Open agent</strong> for
                        live Cloud UI. This line fills in when their API returns a <code>summary</code>.
                      </p>
                    )}
                    {cursorJob.autoDeploy && cursorJob.deployTriggered ? (
                      <p className="pt-1 text-foreground">
                        Auto-deploy to Vercel was triggered (see Deploy below / releases).
                      </p>
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
                    {cursorJob?.errorMessage ? (
                      <p className="pt-1 text-destructive">{cursorJob.errorMessage}</p>
                    ) : null}
                    {cursorJob.targetBranch?.trim() || cursorJob.prUrl?.trim() ? (
                      <div className="mt-3 space-y-1.5 rounded-md border border-amber-500/35 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] leading-relaxed dark:bg-amber-500/[0.08]">
                        <p className="font-semibold text-foreground">Cursor preview</p>
                        {cursorJob.vercelPreviewUrl?.trim() ? (
                          <a
                            href={cursorJob.vercelPreviewUrl.trim()}
                            target="_blank"
                            rel="noreferrer"
                            className="block break-all text-[12px] font-medium text-primary underline underline-offset-2"
                          >
                            Open preview ({cursorJob.vercelPreviewUrl.trim()})
                          </a>
                        ) : (
                          <p className="text-muted-foreground">
                            Resolving preview URL… keep this page open or use Refresh. Requires{" "}
                            <code className="rounded bg-muted px-1 font-mono text-[10px]">VERCEL_TOKEN</code>{" "}
                            and{" "}
                            <code className="rounded bg-muted px-1 font-mono text-[10px]">
                              VERCEL_PROJECT_ID
                            </code>{" "}
                            on the APOP server (same as the Deploy status integration).
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          The <strong className="text-foreground">Deploy</strong> section below is only for
                          hook-triggered builds. This link is the Vercel Preview for Cursor’s branch.
                        </p>
                        {cursorJob.targetBranch?.trim() ? (
                          <p className="font-mono text-[10px] text-foreground">
                            Branch: {cursorJob.targetBranch.trim()}
                          </p>
                        ) : null}
                        <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                          {cursorJob.prUrl?.trim() ? (
                            <li>
                              <a
                                href={cursorJob.prUrl.trim()}
                                className="text-primary underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open pull request
                              </a>{" "}
                              — Vercel usually posts the preview URL in a comment or check.
                            </li>
                          ) : (
                            <li>When the PR opens, use it to find the preview link.</li>
                          )}
                          {cursorGithubTreeUrl ? (
                            <li>
                              <a
                                href={cursorGithubTreeUrl}
                                className="text-primary underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Branch on GitHub
                              </a>
                            </li>
                          ) : null}
                          <li>
                            In Vercel: <strong className="text-foreground">Deployments</strong> → find the
                            preview for this branch.
                          </li>
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : implementationUnlocked ? (
                  <p className="text-[12px] text-muted-foreground">
                    Start a Cloud Agent with the Ship PRD (left). Requires Cursor API key and repo in{" "}
                    <code className="rounded bg-muted px-1 font-mono text-[11px]">.env</code>.
                  </p>
                ) : null}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {CURSOR_BRANCH_PREVIEW_HINT}
                </p>
              </section>
            ) : null}

            {showPrimaryDeploy ? (
              <section className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Deploy
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Push a Vercel deployment when the implementation is ready.
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{VERCEL_DEPLOY_HOOK_HINT}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void triggerRelease()} disabled={!!busy}>
                    {busy === "release" ? "Starting…" : "Deploy to Vercel"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchReleases(true)}
                    disabled={!!busy}
                  >
                    Refresh status
                  </Button>
                </div>
                <VercelDeploymentStatus release={latestRelease} />
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <div className="space-y-0.5">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Activity timeline
                </h2>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Newest first — all APOP agents, Cursor Cloud, Vercel deploys, and approvals.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="mb-3 text-[12px] text-muted-foreground">
                  Status:{" "}
                  <span className="font-medium text-foreground">{FEATURE_STATUS_LABEL[feature.status]}</span>
                  {activityTimeline.length > 0 ? (
                    <span> · {activityTimeline.length} events</span>
                  ) : null}
                </p>
                <ScrollArea className="h-[min(36vh,280px)] pr-3 lg:h-[min(52vh,420px)]">
                  <div className="flex flex-col gap-3">
                    {activityTimeline.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">
                        {feature.stage === "INBOX"
                          ? "Inbox — drag the card to Research Analysis on the pipeline to start value analysis."
                          : showStartResearch
                            ? "No run logged yet — use Research above."
                            : feature.status === "running" || feature.status === "queued"
                            ? "Waiting for the first log line…"
                            : "Nothing logged yet — runs, Cursor, and deploys will show here."}
                      </p>
                    ) : (
                      activityTimeline.map((row) => (
                        <div
                          key={row.id}
                          className={cn(
                            "border-l-2 pl-3 text-[13px] leading-relaxed",
                            activityBorderClass(row.kind),
                          )}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                            <span className="text-[11px] tabular-nums text-muted-foreground">
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

            {showReviewActions ? (
              <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-[16px] font-semibold">Review</h2>
                <p className="text-[13px] text-muted-foreground">{reviewCopy}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => approval("approved")} disabled={!!busy}>
                    {busy === "approval" ? "…" : "Approve"}
                  </Button>
                  <Button variant="destructive" onClick={() => approval("rejected")} disabled={!!busy}>
                    Reject
                  </Button>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
