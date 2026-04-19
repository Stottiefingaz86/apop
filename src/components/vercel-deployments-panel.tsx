"use client";

import { useMemo, useState } from "react";
import type { Release } from "@prisma/client";
import { ChevronDown, ExternalLink, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VercelDeploymentStatus } from "@/components/vercel-deployment-status";
import { cn } from "@/lib/utils";
import {
  isLikelyVercelPreviewUrl,
  normalizeVercelDeploymentUrl,
  releaseEffectivelyReady,
} from "@/lib/vercel/deployment-display";

type Props = {
  releases: Release[];
  onDeploy: () => void;
  onRefresh: () => void;
  onRemediate?: (releaseId: string) => void;
  busy: string | null;
  /** When false the "Deploy to Vercel" button is hidden (e.g. history-only views). */
  canDeploy: boolean;
  /** Show the larger latest-deployment card at the top. Default true. */
  showLatestCard?: boolean;
};

type Tone = {
  pillClass: string;
  dotClass: string;
  label: string;
};

function toneFor(release: Release | null | undefined): Tone {
  if (!release) {
    return {
      pillClass: "border-border/70 bg-muted/40 text-muted-foreground",
      dotClass: "bg-muted-foreground/60",
      label: "No deploys",
    };
  }
  if (releaseEffectivelyReady(release)) {
    return {
      pillClass:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      dotClass: "bg-emerald-500",
      label: "Ready",
    };
  }
  if (release.status === "error") {
    return {
      pillClass: "border-destructive/40 bg-destructive/10 text-destructive",
      dotClass: "bg-destructive",
      label: "Failed",
    };
  }
  if (release.status === "canceled") {
    return {
      pillClass: "border-border/70 bg-muted/40 text-muted-foreground",
      dotClass: "bg-muted-foreground/60",
      label: "Canceled",
    };
  }
  return {
    pillClass: "border-primary/40 bg-primary/10 text-primary",
    dotClass: "bg-primary animate-pulse",
    label: release.status === "building" ? "Building" : "Queued",
  };
}

function relativeTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  if (d2 < 14) return `${d2}d ago`;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function absoluteTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hostnameOf(raw: string | null | undefined): string | null {
  const n = normalizeVercelDeploymentUrl(raw);
  if (!n) return null;
  try {
    return new URL(n).hostname;
  } catch {
    return null;
  }
}

export function VercelDeploymentsPanel({
  releases,
  onDeploy,
  onRefresh,
  onRemediate,
  busy,
  canDeploy,
  showLatestCard = true,
}: Props) {
  const sorted = useMemo(
    () =>
      [...releases].sort((a, b) => {
        const at = new Date(a.createdAt).getTime();
        const bt = new Date(b.createdAt).getTime();
        return bt - at;
      }),
    [releases],
  );
  const latest = sorted[0] ?? null;
  const history = sorted.slice(1, 6);
  const [historyOpen, setHistoryOpen] = useState(false);

  const latestTone = toneFor(latest);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/60 p-3 shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vercel
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                latestTone.pillClass,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", latestTone.dotClass)} aria-hidden />
              {latestTone.label}
            </span>
            {sorted.length > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                {sorted.length} deploy{sorted.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {latest
              ? latestSubline(latest)
              : canDeploy
                ? "No deploy recorded yet — push a Vercel deployment from the delivery repo when the build is ready."
                : "Deploy history will appear here once a build runs."}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {canDeploy ? (
          <Button
            type="button"
            size="sm"
            onClick={onDeploy}
            disabled={!!busy}
            className="h-7 text-[11px]"
          >
            <Rocket className="mr-1 h-3 w-3" aria-hidden />
            {busy === "release" ? "Starting…" : "Deploy to Vercel"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={!!busy}
          className="h-7 text-[11px]"
        >
          Refresh status
        </Button>
        {latest?.inspectorUrl ? (
          <Button type="button" size="sm" variant="ghost" asChild className="h-7 text-[11px]">
            <a href={latest.inspectorUrl} target="_blank" rel="noreferrer">
              Open in Vercel <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
            </a>
          </Button>
        ) : null}
      </div>

      {latest && showLatestCard ? (
        <VercelDeploymentStatus release={latest} compact />
      ) : null}

      {latest?.status === "error" && latest.vercelDeploymentId && onRemediate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onRemediate(latest.id)}
          disabled={!!busy}
          className="h-7 self-start text-[11px]"
        >
          {busy === `remediate-${latest.id}` ? "Running…" : "Auto-fix with agent"}
        </Button>
      ) : null}

      {history.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex items-center gap-1 self-start text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                historyOpen ? "rotate-180" : "rotate-0",
              )}
              aria-hidden
            />
            {historyOpen ? "Hide history" : `Show ${history.length} earlier deploy${history.length === 1 ? "" : "s"}`}
          </button>
          {historyOpen ? (
            <ol className="flex flex-col gap-1">
              {history.map((r) => {
                const tone = toneFor(r);
                const url = normalizeVercelDeploymentUrl(r.vercelUrl);
                const host = hostnameOf(r.vercelUrl);
                const preview = isLikelyVercelPreviewUrl(r.vercelUrl);
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[11px]"
                  >
                    <span
                      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dotClass)}
                      aria-hidden
                      title={tone.label}
                    />
                    <span
                      className="shrink-0 tabular-nums text-muted-foreground"
                      title={absoluteTime(r.createdAt)}
                    >
                      {relativeTime(r.createdAt)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wide",
                        tone.pillClass,
                      )}
                    >
                      {tone.label}
                    </span>
                    {preview ? (
                      <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        Preview
                      </span>
                    ) : null}
                    <span className="flex-1 min-w-0 truncate text-muted-foreground">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate font-mono text-primary underline underline-offset-2"
                          title={url}
                        >
                          {host || url}
                        </a>
                      ) : r.status === "error" ? (
                        <span className="italic text-destructive">
                          {r.errorMessage?.trim() || "Deploy failed"}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground/80">
                          Linking deployment…
                        </span>
                      )}
                    </span>
                    {r.inspectorUrl ? (
                      <a
                        href={r.inspectorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Open in Vercel dashboard"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function latestSubline(r: Release): string {
  const host = hostnameOf(r.vercelUrl);
  const preview = isLikelyVercelPreviewUrl(r.vercelUrl);
  const when = relativeTime(r.createdAt);
  if (releaseEffectivelyReady(r)) {
    if (host) return `${preview ? "Preview" : "Live"} · ${host} · ${when}`;
    return `Ready · ${when}`;
  }
  if (r.status === "error") {
    return r.errorMessage?.trim() || `Last deploy failed · ${when}`;
  }
  if (r.status === "canceled") return `Canceled · ${when}`;
  if (r.status === "building") {
    return r.readyState?.trim() ? `Vercel: ${r.readyState} · ${when}` : `Building · ${when}`;
  }
  return `Pending · ${when}`;
}
