import {
  FeatureStage,
  type AgentQuestion,
  type Artifact,
  type CursorAgentJob,
  type Feature,
  type Release,
  type Run,
  type RunEvent,
} from "@prisma/client";
import { isCursorAgentFinished, isCursorAgentSucceeded } from "@/lib/cursor/agent-status";
import { parseAgentQuestionsPayload } from "@/lib/domain/agent-questions";
import { hasSuccessfulDeployment } from "@/lib/domain/deployment";
import { FEATURE_STAGE_LABEL } from "@/lib/domain/stages";
import { STAGE_DEFAULT_AGENT } from "@/lib/domain/run-lifecycle";
import { kanbanVercelSummary } from "@/lib/vercel/deployment-display";

export type PipelineListFeature = Feature & {
  agentQuestions: AgentQuestion[];
  runs: (Run & { events: RunEvent[] })[];
  cursorAgentJobs: CursorAgentJob[];
  /** Latest rows for value / PRD / design — used to know if Cursor can start */
  artifacts: Artifact[];
  /** Newest first — Kanban Vercel line + board poll sync */
  releases: Release[];
};

const AGENT_LABEL: Record<string, string> = {
  "value-analyst-agent": "Value analyst",
  "prd-writer-agent": "PRD writer",
  "design-spec-agent": "Design spec",
  "build-agent": "Build",
  "qa-agent": "QA",
};

function agentLabel(raw: string): string {
  return AGENT_LABEL[raw] ?? raw.replace(/-agent$/, "").replace(/-/g, " ");
}

function truncate(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function openQuestionSummary(open: AgentQuestion[]): {
  count: number;
  firstLabel?: string;
  agent?: string;
} {
  let count = 0;
  let firstLabel: string | undefined;
  let agent: string | undefined;
  for (const row of open) {
    const p = parseAgentQuestionsPayload(row.questionJson);
    if (!p?.questions.length) continue;
    agent = agent ?? p.agent;
    count += p.questions.length;
    if (!firstLabel) {
      const req = p.questions.find((q) => q.required);
      firstLabel = (req ?? p.questions[0])?.label;
    }
  }
  return { count, firstLabel, agent };
}

export type PipelineCardVisualState = {
  /** Banner + border accent */
  tone: "working" | "paused" | "ready" | "attention";
  /** One short, human line (always shown in the status strip) */
  headline: string;
  /** Why — especially for paused / problems */
  detail?: string;
  /** Spinner / soft pulse */
  pulse: boolean;
};

/**
 * Maps DB status + open questions into simple product-language copy for the Kanban card.
 */
export function buildPipelineCardState(row: PipelineListFeature): PipelineCardVisualState {
  try {
    return buildPipelineCardStateInner(row);
  } catch {
    return {
      tone: "attention",
      headline: "Couldn’t render card status",
      detail: "Open the workspace for this feature. If this keeps happening, check server logs.",
      pulse: false,
    };
  }
}

/** Kanban strip when feature is in implementation — Cursor Cloud is the main story. */
function inBuildCursorCommentary(row: PipelineListFeature): PipelineCardVisualState | null {
  if (row.stage !== FeatureStage.IN_BUILD) return null;
  if (row.status === "running" || row.status === "queued") return null;

  const job = row.cursorAgentJobs?.[0];
  if (job) {
    const st = job.status?.trim() || "SUBMITTED";
    const err = job.errorMessage?.trim();
    const upper = st.toUpperCase();

    if (err && (upper === "FAILED" || upper === "ERROR" || upper === "STOPPED")) {
      return {
        tone: "attention",
        headline: "Cursor agent reported a problem",
        detail: truncate(err, 130),
        pulse: false,
      };
    }
    if (isCursorAgentSucceeded(st)) {
      const rel = row.releases?.[0];
      const vHint = kanbanVercelSummary(rel);
      const deployParts = [
        vHint && `Vercel: ${vHint}.`,
        !vHint && job.deployTriggered && "Vercel hook ran — preview URL appears below when APOP links the deployment (Refresh if stuck).",
        !vHint && !job.deployTriggered && "Use Deploy on this card or in the workspace to push a Vercel build.",
      ].filter(Boolean);
      return {
        tone: "ready",
        headline: vHint?.includes("fail") ? "Cursor done — check Vercel" : "Cursor finished — review PR & deploy",
        detail: [
          job.prUrl
            ? "A pull request was opened. Open the workspace for the PR link and next steps."
            : "Open the workspace for agent URL and PR.",
          ...deployParts,
        ]
          .filter(Boolean)
          .join(" "),
        pulse: false,
      };
    }
    if (isCursorAgentFinished(st)) {
      return {
        tone: "attention",
        headline: "Cursor agent ended",
        detail: err
          ? truncate(err, 130)
          : "Open the workspace to see final status and what to do next.",
        pulse: false,
      };
    }
    const rel = row.releases?.[0];
    const vercelBuilding =
      rel &&
      !rel.vercelUrl?.trim() &&
      rel.status !== "error" &&
      rel.status !== "canceled" &&
      (rel.status === "building" ||
        rel.status === "pending" ||
        !!(rel.vercelDeploymentId && rel.vercelDeploymentId.trim()));
    const apiSummary = job.cursorSummary?.trim();
    const vercelPhrase = vercelBuilding
      ? `Vercel deploy: ${rel!.readyState?.trim() || rel!.status || "in progress"} (check Deploy in workspace if this lags).`
      : rel?.vercelUrl?.trim()
        ? `Preview: ${rel.vercelUrl.trim()}`
        : null;

    return {
      tone: "working",
      headline: vercelBuilding ? "Cursor & Vercel in progress" : "Cursor Cloud agent is running",
      detail: [
        apiSummary && `From Cursor API: ${truncate(apiSummary, 130)}`,
        vercelPhrase,
        `Job status: ${st}. Use Agent dashboard on this card for live Cursor Cloud logs — APOP only mirrors the API here.`,
      ]
        .filter(Boolean)
        .join(" "),
      pulse: true,
    };
  }

  if (row.status === "approved" || row.status === "idle") {
    return {
      tone: "ready",
      headline: "In build — Cursor not started yet",
      detail:
        "Open this card → workspace → **Start Cursor agent**. That sends your Ship PRD to Cursor Cloud on the delivery repo. Nothing runs in Cursor until you start it from the workspace.",
      pulse: false,
    };
  }

  return null;
}

function buildPipelineCardStateInner(row: PipelineListFeature): PipelineCardVisualState {
  const { status, stage } = row;
  const stageName = FEATURE_STAGE_LABEL[stage] ?? "Unknown stage";
  const defaultAgent = STAGE_DEFAULT_AGENT[stage];
  const agentWorkingName = defaultAgent ? agentLabel(defaultAgent) : "Agent";
  const lastRun = row.runs?.[0];
  const lastEvent = lastRun?.events?.[0];
  const lastRunError =
    lastRun?.status === "failed" && lastEvent?.message
      ? truncate(String(lastEvent.message), 120)
      : undefined;

  const inBuildStrip = inBuildCursorCommentary(row);
  if (inBuildStrip) return inBuildStrip;

  if (stage === FeatureStage.INBOX && status === "idle") {
    return {
      tone: "ready",
      headline: "Inbox — idea parked",
      detail:
        "Drag once to Research Analysis to start value scoring. After that, use Approve on each card to move through Design → Cursor prompt → In build — no more drags required.",
      pulse: false,
    };
  }

  if (
    status === "running" ||
    status === "queued" ||
    (lastRun?.status === "running" && status === "idle")
  ) {
    const queued = status === "queued";
    return {
      tone: "working",
      headline: queued ? "Starting — agent run queued" : "Working — agent is running",
      detail: `${agentWorkingName} · ${stageName}`,
      pulse: true,
    };
  }

  if (status === "awaiting_input") {
    const { count, firstLabel, agent } = openQuestionSummary(row.agentQuestions ?? []);
    const who = agent ? agentLabel(agent) : agentWorkingName;
    if (count <= 0) {
      return {
        tone: "paused",
        headline: "Paused — waiting on your input",
        detail: `${who} needs information. Open this card to answer questions.`,
        pulse: false,
      };
    }
    const focus = firstLabel ? `First: “${truncate(firstLabel, 72)}”.` : "";
    return {
      tone: "paused",
      headline: `Paused — ${count} question${count === 1 ? "" : "s"} to answer`,
      detail: `${who} cannot continue until you respond. ${focus} Open the workspace to submit answers.`,
      pulse: false,
    };
  }

  if (status === "awaiting_review") {
    return {
      tone: "paused",
      headline: "Paused — review needed",
      detail:
        "An artifact is ready. Open the workspace to read it and approve or send back for changes.",
      pulse: false,
    };
  }

  if (status === "failed") {
    return {
      tone: "attention",
      headline: "Stopped — last run failed",
      detail:
        lastRunError ??
        "Open the workspace to see logs and retry or fix context, then run the stage again.",
      pulse: false,
    };
  }

  if (status === "blocked") {
    return {
      tone: "attention",
      headline: "Blocked — needs attention",
      detail:
        "Something in delivery or auto-fix is blocked. Open the workspace to see details and next steps.",
      pulse: false,
    };
  }

  if (status === "rejected") {
    return {
      tone: "attention",
      headline: "Rejected",
      detail: "This idea was rejected. You can move it or edit context and retry from the workspace.",
      pulse: false,
    };
  }

  if (stage === FeatureStage.DONE) {
    const shipped = hasSuccessfulDeployment(row.releases ?? []);
    const latest = row.releases?.[0];
    if (shipped) {
      const vercelHint = latest ? kanbanVercelSummary(latest) : null;
      return {
        tone: "ready",
        headline: "Done — deployed",
        detail: vercelHint
          ? `${vercelHint}. Open the workspace for the full deployment panel and history.`
          : "Successful Vercel release on record. Open the workspace for preview or production links.",
        pulse: false,
      };
    }
    return {
      tone: "ready",
      headline: "Done — complete",
      detail:
        "Finished on the pipeline. If you deploy via APOP, a release with a URL will show as **Done — deployed**.",
      pulse: false,
    };
  }

  if (status === "approved") {
    if (stage === FeatureStage.READY_FOR_BUILD) {
      return {
        tone: "ready",
        headline: "Approved — ready for implementation",
        detail:
          "Drag this card to **In build** when you’re ready. Then open the workspace and **Start Cursor agent** so Cursor Cloud gets the Ship PRD on your repo.",
        pulse: false,
      };
    }
    return {
      tone: "ready",
      headline: "Approved — ready to continue",
      detail: `Continue from the workspace for the next step (${stageName}). In **In build**, that usually means **Start Cursor agent**.`,
      pulse: false,
    };
  }

  // idle
  return {
    tone: "ready",
    headline: "Ready — no agent running",
    detail: `Nothing is running right now. Open the workspace to run or advance ${stageName}.`,
    pulse: false,
  };
}

