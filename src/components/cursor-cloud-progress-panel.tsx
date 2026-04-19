"use client";

import { useState } from "react";
import type { CursorAgentJob } from "@prisma/client";
import { ChevronDown, ExternalLink, GitPullRequest, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isCursorAgentFinished, isCursorAgentSucceeded } from "@/lib/cursor/agent-status";

type Props = {
  job: CursorAgentJob | null;
  /** True when the pipeline has satisfied enough artifacts to allow a fresh build. */
  implementationUnlocked: boolean;
  autoDeployAfterCursor: boolean;
  onToggleAutoDeploy: (next: boolean) => void;
  onStart: () => void;
  busy: string | null;
  /** GitHub tree URL for the Cursor branch, when we can compute it. */
  branchTreeUrl?: string | null;
};

type Phase = "queued" | "running" | "pr" | "finished" | "error";

function currentPhase(job: CursorAgentJob | null): Phase {
  if (!job) return "queued";
  const s = (job.status || "").toUpperCase();
  if (s === "FAILED" || s === "ERROR" || s === "STOPPED") return "error";
  if (s === "FINISHED") return "finished";
  if (job.prUrl?.trim()) return "pr";
  if (s === "CREATING" || s === "CREATED" || s === "QUEUED") return "queued";
  return "running";
}

const STEPS: { key: Phase; label: string; icon: typeof Sparkles }[] = [
  { key: "queued", label: "Launching", icon: Rocket },
  { key: "running", label: "Coding", icon: Sparkles },
  { key: "pr", label: "Pull request", icon: GitPullRequest },
  { key: "finished", label: "Finished", icon: Sparkles },
];

function statusTone(phase: Phase): { pillClass: string; dotClass: string; label: string } {
  switch (phase) {
    case "error":
      return {
        pillClass: "border-destructive/40 bg-destructive/10 text-destructive",
        dotClass: "bg-destructive",
        label: "Error",
      };
    case "finished":
      return {
        pillClass:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        dotClass: "bg-emerald-500",
        label: "Finished",
      };
    case "pr":
      return {
        pillClass: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        dotClass: "bg-sky-500",
        label: "PR opened",
      };
    case "running":
      return {
        pillClass: "border-primary/40 bg-primary/10 text-primary",
        dotClass: "bg-primary animate-pulse",
        label: "Running",
      };
    case "queued":
    default:
      return {
        pillClass: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        dotClass: "bg-amber-500 animate-pulse",
        label: "Launching",
      };
  }
}

function phaseIndex(p: Phase): number {
  if (p === "error") return -1;
  const i = STEPS.findIndex((s) => s.key === p);
  return i < 0 ? 0 : i;
}

function relativeTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CursorCloudProgressPanel({
  job,
  implementationUnlocked,
  autoDeployAfterCursor,
  onToggleAutoDeploy,
  onStart,
  busy,
  branchTreeUrl,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const phase = currentPhase(job);
  const tone = statusTone(phase);
  const stepIdx = phaseIndex(phase);
  const finished = isCursorAgentFinished(job?.status);
  const succeeded = isCursorAgentSucceeded(job?.status);
  const isActive = !!job && !finished;

  const subline = (() => {
    if (!job) {
      return implementationUnlocked
        ? "Ready to launch — Cursor will open a branch in site-apop and push a PR."
        : "Waiting on Value, Design and Cursor prompt before launch.";
    }
    if (phase === "error") return job.errorMessage?.trim() || "Cursor reported an error — see the agent.";
    if (phase === "finished" && succeeded)
      return job.prUrl?.trim() ? "Coding finished — review the pull request." : "Coding finished.";
    if (phase === "pr") return "PR opened — Cursor may still be pushing follow-up commits.";
    if (phase === "running") return job.cursorSummary?.trim() || "Cursor is writing the code…";
    return "Cursor Cloud is spinning up the agent…";
  })();

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/60 p-3 shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cursor Cloud
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                tone.pillClass,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", tone.dotClass)} aria-hidden />
              {job?.status?.trim() ? job.status : tone.label}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{subline}</p>
        </div>
      </header>

      {!job && implementationUnlocked ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/80 p-3">
          <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoDeployAfterCursor}
              onChange={(e) => onToggleAutoDeploy(e.target.checked)}
            />
            <span>
              After Cursor <strong className="font-medium">finishes</strong>, trigger the production
              deploy hook. You still need to merge the PR if production should include the agent&apos;s
              changes.
            </span>
          </label>
          <Button
            type="button"
            variant="gradientCta"
            size="sm"
            onClick={onStart}
            disabled={!!busy}
            className="w-full sm:w-auto"
          >
            {busy === "cursor" ? "Starting…" : "Start Cursor agent"}
          </Button>
        </div>
      ) : null}

      {job ? (
        <>
          {/* Progress stepper */}
          <ol className="flex items-stretch gap-0.5" aria-label="Cursor Cloud progress">
            {STEPS.map((step, i) => {
              const reached = phase === "error" ? i === 0 : stepIdx >= i;
              const current = stepIdx === i && phase !== "finished" && phase !== "error";
              const errored = phase === "error" && i === stepIdx + 1;
              const Icon = step.icon;
              return (
                <li
                  key={step.key}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px]",
                    reached && phase === "error"
                      ? "border-destructive/40 bg-destructive/[0.05] text-destructive"
                      : reached
                        ? "border-primary/35 bg-primary/[0.06] text-primary"
                        : errored
                          ? "border-destructive/40 bg-destructive/[0.05] text-destructive"
                          : "border-border/60 bg-muted/20 text-muted-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3 w-3 shrink-0",
                      current && "animate-pulse",
                    )}
                    aria-hidden
                  />
                  <span className="truncate font-medium">{step.label}</span>
                </li>
              );
            })}
          </ol>

          {/* Live activity */}
          <div
            className={cn(
              "rounded-md border px-2.5 py-2 text-[11px] leading-relaxed",
              isActive
                ? "border-primary/30 bg-primary/[0.04]"
                : "border-border/60 bg-muted/20",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActive ? "bg-primary animate-pulse" : "bg-muted-foreground/60",
                )}
                aria-hidden
              />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isActive ? "Live activity" : "Last activity"}
              </span>
              {job.updatedAt ? (
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {relativeTime(job.updatedAt)}
                </span>
              ) : null}
            </div>
            {job.cursorSummary?.trim() ? (
              <p className="mt-1 break-words text-foreground">{job.cursorSummary.trim()}</p>
            ) : isActive ? (
              <p className="mt-1 italic text-muted-foreground">
                Waiting for the first update from Cursor… this panel polls every few seconds.
              </p>
            ) : (
              <p className="mt-1 italic text-muted-foreground">
                Cursor didn&apos;t stream a summary for this run. Open the agent for the full log.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5">
            {job.agentUrl ? (
              <Button type="button" variant="outline" size="sm" asChild className="h-7 text-[11px]">
                <a href={job.agentUrl} target="_blank" rel="noreferrer">
                  Open agent <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                </a>
              </Button>
            ) : null}
            {job.prUrl ? (
              <Button type="button" variant="outline" size="sm" asChild className="h-7 text-[11px]">
                <a href={job.prUrl} target="_blank" rel="noreferrer">
                  Pull request <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                </a>
              </Button>
            ) : null}
            {job.vercelPreviewUrl?.trim() ? (
              <Button type="button" variant="outline" size="sm" asChild className="h-7 text-[11px]">
                <a href={job.vercelPreviewUrl} target="_blank" rel="noreferrer">
                  Preview <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                </a>
              </Button>
            ) : null}
            {branchTreeUrl ? (
              <Button type="button" variant="ghost" size="sm" asChild className="h-7 text-[11px]">
                <a href={branchTreeUrl} target="_blank" rel="noreferrer">
                  Branch <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                </a>
              </Button>
            ) : null}
            {implementationUnlocked && finished ? (
              <Button
                type="button"
                size="sm"
                variant="gradientCta"
                onClick={onStart}
                disabled={!!busy}
                className="h-7 text-[11px]"
              >
                {busy === "cursor" ? "…" : "Re-run"}
              </Button>
            ) : null}
          </div>

          {/* Meta + auto-deploy re-run checkbox when there's a prior job but we can still start again */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {job.targetBranch?.trim() ? (
              <span className="inline-flex items-center gap-1">
                <span className="opacity-70">branch:</span>
                <span className="font-mono text-foreground">{job.targetBranch.trim()}</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <span className="opacity-70">job:</span>
              <span className="font-mono">{job.cursorAgentId.slice(0, 18)}…</span>
            </span>
            {job.autoDeploy ? (
              <span>
                auto-deploy:{" "}
                <span className="text-foreground">{job.deployTriggered ? "triggered" : "on"}</span>
              </span>
            ) : null}
          </div>

          {implementationUnlocked && finished ? (
            <label className="flex cursor-pointer items-start gap-2 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={autoDeployAfterCursor}
                onChange={(e) => onToggleAutoDeploy(e.target.checked)}
              />
              <span>
                After a re-run <strong className="font-medium text-foreground">finishes</strong>,
                trigger the production deploy hook.
              </span>
            </label>
          ) : null}

          {/* Details disclosure */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="flex items-center gap-1 self-start text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                detailsOpen ? "rotate-180" : "rotate-0",
              )}
              aria-hidden
            />
            {detailsOpen ? "Hide details" : "Show details"}
          </button>

          {detailsOpen ? (
            <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                Cursor opens a branch like <code className="font-mono text-foreground">apop/…</code>.
                Vercel builds a preview for that branch automatically. The production deploy hook
                rebuilds <strong className="text-foreground">main</strong>, not the agent branch —
                merge the PR when you want production to include the changes.
              </p>
              {!job.vercelPreviewUrl?.trim() ? (
                <p>
                  No live preview URL yet — APOP needs <code className="font-mono">VERCEL_TOKEN</code>{" "}
                  and <code className="font-mono">VERCEL_PROJECT_ID</code> to resolve one. Use the PR
                  / Vercel dashboard meanwhile.
                </p>
              ) : null}
              <p>
                Full agent id: <span className="font-mono text-foreground">{job.cursorAgentId}</span>
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
