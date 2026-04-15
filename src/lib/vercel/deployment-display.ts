/**
 * Human-facing helpers for Vercel deployment URLs in the APOP UI.
 */

import type { Release } from "@prisma/client";

/** True when Vercel reports a finished deployment (even if our `status` row lagged). */
export function releaseEffectivelyReady(
  r: Pick<Release, "status" | "readyState"> | null | undefined,
): boolean {
  if (!r) return false;
  if (r.status === "ready") return true;
  const rs = (r.readyState ?? "").toUpperCase();
  return rs === "READY" || rs === "SUCCESS" || rs === "CACHED";
}

export function normalizeVercelDeploymentUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return `https://${t}`;
}

/**
 * Vercel preview deployments use a long subdomain like
 * `project-abc123-teamslug.vercel.app`; production alias is usually `project.vercel.app`.
 */
export function isLikelyVercelPreviewUrl(raw: string | null | undefined): boolean {
  const n = normalizeVercelDeploymentUrl(raw);
  if (!n) return false;
  try {
    const host = new URL(n).hostname.toLowerCase();
    if (!host.endsWith(".vercel.app")) return false;
    const sub = host.replace(/\.vercel\.app$/i, "");
    const segments = sub.split("-");
    return segments.length >= 4;
  } catch {
    return false;
  }
}

/**
 * Prefer URLs users should bookmark: custom domain, then production-style `project.vercel.app`,
 * then unique preview hosts (last resort).
 *
 * When preferUniquePreview is true (e.g. for release display), prefer the deployment-specific
 * preview URL that changes every deploy, over the static production alias.
 */
export function pickPreferredPublicHostname(
  hostnames: (string | null | undefined)[],
  preferUniquePreview = false,
): string | null {
  const cleaned = [
    ...new Set(
      hostnames
        .map((h) => {
          if (!h?.trim()) return "";
          return h
            .trim()
            .replace(/^https?:\/\//i, "")
            .split("/")[0]!
            .split("?")[0]!
            .toLowerCase();
        })
        .filter(Boolean),
    ),
  ];
  if (cleaned.length === 0) return null;
  const custom = cleaned.find((h) => !h.endsWith(".vercel.app"));
  if (custom) return custom;
  if (preferUniquePreview) {
    const preview = cleaned.find((h) => isLikelyVercelPreviewUrl(`https://${h}`));
    if (preview) return preview;
  }
  const nonPreview = cleaned.find((h) => !isLikelyVercelPreviewUrl(`https://${h}`));
  if (nonPreview) return nonPreview;
  return cleaned[0] ?? null;
}

export function deploymentWhereLine(raw: string | null | undefined): string {
  const n = normalizeVercelDeploymentUrl(raw);
  if (!n) return "";
  try {
    const u = new URL(n);
    if (isLikelyVercelPreviewUrl(raw)) {
      return `Preview hostname: ${u.hostname} (production domain is unchanged until you deploy to production).`;
    }
    return `Live at: ${u.hostname}`;
  } catch {
    return "";
  }
}

/** One short line for Kanban / compact UI (status + hostname or phase). */
export function kanbanVercelSummary(
  latest: Pick<Release, "status" | "vercelUrl" | "vercelDeploymentId" | "readyState"> | null | undefined,
): string | null {
  if (!latest) return null;
  const url = normalizeVercelDeploymentUrl(latest.vercelUrl);
  const effectivelyReady = releaseEffectivelyReady(latest);
  if (effectivelyReady && url) {
    try {
      const host = new URL(url).hostname;
      const kind = isLikelyVercelPreviewUrl(latest.vercelUrl) ? "preview" : "live";
      return `${kind} · ${host}`;
    } catch {
      return "deployed · open workspace for URL";
    }
  }
  if (effectivelyReady && !url) {
    return latest.vercelDeploymentId
      ? "preview ready · refresh or open Vercel"
      : "preview ready · linking…";
  }
  if (latest.status === "error") return "deploy failed · see workspace";
  if (latest.status === "building" || latest.status === "pending") {
    if (latest.vercelDeploymentId) {
      const rs = latest.readyState?.trim();
      return rs ? `Vercel ${rs}` : "Vercel building…";
    }
    return "Vercel · linking deploy…";
  }
  if (latest.status === "canceled") return "deploy canceled";
  return null;
}
