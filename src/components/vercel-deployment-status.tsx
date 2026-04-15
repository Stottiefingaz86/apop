"use client";

import type { Release } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deploymentWhereLine,
  isLikelyVercelPreviewUrl,
  normalizeVercelDeploymentUrl,
  releaseEffectivelyReady,
} from "@/lib/vercel/deployment-display";

const RELEASE_STATUS_LABEL: Record<Release["status"], string> = {
  pending: "Pending",
  building: "Building",
  ready: "Ready",
  error: "Failed",
  canceled: "Canceled",
};

export type VercelDeploymentStatusRelease = Pick<
  Release,
  "status" | "vercelUrl" | "vercelDeploymentId" | "inspectorUrl" | "errorMessage" | "readyState"
>;

export function VercelDeploymentStatus({
  release,
  compact,
}: {
  release: VercelDeploymentStatusRelease | null | undefined;
  /** Smaller type for quick-view pop-up */
  compact?: boolean;
}) {
  const text = compact ? "text-[11px]" : "text-[12px]";
  const title = compact ? "text-[12px]" : "text-[13px]";
  const mono = compact ? "text-[11px]" : "text-[13px]";

  if (!release) {
    return (
      <p className={`${text} text-muted-foreground`}>No deployment triggered yet.</p>
    );
  }

  const url = normalizeVercelDeploymentUrl(release.vercelUrl);
  const preview = isLikelyVercelPreviewUrl(release.vercelUrl);
  const effectivelyReady = releaseEffectivelyReady(release);

  if (effectivelyReady && url) {
    return (
      <div
        className={`space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-3 py-2.5 dark:bg-emerald-500/[0.09]`}
      >
        <p className={`${title} font-semibold text-emerald-900 dark:text-emerald-100`}>Deployed</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`block break-all ${mono} font-mono text-primary underline underline-offset-2 hover:text-primary/90`}
        >
          {url}
        </a>
        <p className={`${text} leading-relaxed text-muted-foreground`}>
          {deploymentWhereLine(release.vercelUrl)}
        </p>
        {preview ? (
          <p
            className={`${text} leading-relaxed text-amber-950/90 dark:text-amber-100/90`}
          >
            <strong className="font-medium">Preview</strong> — this URL is unique to this build. Your main
            production hostname only updates when Vercel runs a{" "}
            <strong className="font-medium">production</strong> deploy (correct deploy hook / branch).
          </p>
        ) : (
          <p className={`${text} text-muted-foreground`}>
            This deployment is associated with your assigned / production-style hostname.
          </p>
        )}
        {release.inspectorUrl ? (
          <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
            <a href={release.inspectorUrl} target="_blank" rel="noreferrer">
              Open in Vercel dashboard
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  if (effectivelyReady && !url) {
    return (
      <div
        className={`space-y-2 rounded-lg border border-amber-500/45 bg-amber-500/[0.07] px-3 py-2.5 dark:bg-amber-500/[0.09]`}
      >
        <p className={`${title} font-semibold text-amber-950 dark:text-amber-100`}>
          Preview deployment ready
        </p>
        <p className={`${text} leading-relaxed text-muted-foreground`}>
          Vercel finished this build on a{" "}
          <strong className="font-medium text-foreground">preview</strong> URL — it is{" "}
          <strong className="font-medium text-foreground">not</strong> your main production site until you
          ship to production. APOP could not read a hostname yet; use{" "}
          <strong className="font-medium text-foreground">Refresh status</strong> or open the deployment below
          — the Domains section lists every preview link (branch URL + deployment URL).
        </p>
        {release.inspectorUrl ? (
          <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
            <a href={release.inspectorUrl} target="_blank" rel="noreferrer">
              Open deployment (see Domains)
            </a>
          </Button>
        ) : (
          <p className={`${text} text-muted-foreground`}>
            Set <code className="rounded bg-muted px-1 font-mono text-[10px]">VERCEL_TOKEN</code> and refresh
            so we can fill the preview link automatically.
          </p>
        )}
      </div>
    );
  }

  if (release.status === "error") {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2.5">
        <p className={`${title} font-semibold text-destructive`}>Deploy failed</p>
        {release.errorMessage ? (
          <p className={`${text} text-muted-foreground`}>{release.errorMessage}</p>
        ) : null}
        {url ? (
          <a
            href={url}
            className={`block break-all ${mono} text-primary underline`}
            target="_blank"
            rel="noreferrer"
          >
            {url}
          </a>
        ) : null}
        {release.inspectorUrl ? (
          <Button variant="outline" size="sm" asChild>
            <a href={release.inspectorUrl} target="_blank" rel="noreferrer">
              View in Vercel
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/45 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default" className="font-normal">
          {RELEASE_STATUS_LABEL[release.status]}
        </Badge>
        {release.readyState ? (
          <span className={`${text} text-muted-foreground`}>Vercel: {release.readyState}</span>
        ) : null}
      </div>
      {!release.vercelDeploymentId ? (
        <p className={`${text} leading-relaxed text-muted-foreground`}>
          Deploy hook ran — still <strong className="font-medium text-foreground">linking</strong> this release to
          a Vercel deployment. Click <strong className="font-medium text-foreground">Refresh status</strong>. If a
          URL never appears, set{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10px] text-foreground">VERCEL_TOKEN</code> and{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10px] text-foreground">VERCEL_PROJECT_ID</code>{" "}
          on the APOP server so we can read deployments from the Vercel API.
        </p>
      ) : (
        <p className={`${text} text-muted-foreground`}>
          Deployment ID:{" "}
          <span className="font-mono text-foreground">{release.vercelDeploymentId}</span>
        </p>
      )}
      {url ? (
        <a
          href={url}
          className={`block break-all ${mono} text-primary underline`}
          target="_blank"
          rel="noreferrer"
        >
          {url}
        </a>
      ) : release.status === "building" || release.status === "pending" ? (
        <p className={`${text} text-muted-foreground`}>
          Vercel is building — the live URL appears here when their API reports it (use Refresh status).
        </p>
      ) : null}
      {release.inspectorUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={release.inspectorUrl} target="_blank" rel="noreferrer">
            Vercel deployment page
          </a>
        </Button>
      ) : null}
    </div>
  );
}
