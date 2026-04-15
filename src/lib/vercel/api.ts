import { pickPreferredPublicHostname } from "@/lib/vercel/deployment-display";
import { getVercelTeamId, getVercelToken } from "./env";

const BASE = "https://api.vercel.com";

function withTeamQuery(path: string): string {
  const team = getVercelTeamId();
  if (!team) return path;
  return path + (path.includes("?") ? "&" : "?") + `teamId=${encodeURIComponent(team)}`;
}

async function vercelGet<T>(path: string): Promise<T> {
  const token = getVercelToken();
  if (!token) throw new Error("VERCEL_TOKEN is not configured");
  const url = withTeamQuery(`${BASE}${path}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export type VercelDeploymentSummary = {
  uid: string;
  id?: string;
  url?: string;
  name?: string;
  readyState?: string;
  state?: string;
  /** Some list endpoints use `created` instead of `createdAt` */
  created?: number;
  createdAt?: number;
  inspectorUrl?: string;
  errorMessage?: string;
  meta?: Record<string, string>;
};

/** Vercel returns `createdAt` as seconds or ms depending on endpoint — normalize to ms. */
export function vercelTimestampToMs(t: number | undefined | null): number {
  if (t == null || !Number.isFinite(t)) return 0;
  return t < 10_000_000_000 ? t * 1000 : t;
}

function hostnameOnly(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]!
    .split("?")[0]!;
}

/** Prefer deployment `url`; otherwise list aliases (preview `.vercel.app` hostnames often appear here). */
export function pickHostnameFromDeploymentSummary(dep: VercelDeploymentSummary): string | null {
  const u = dep.url;
  if (typeof u === "string" && u.trim()) return hostnameOnly(u);
  return null;
}

export async function listDeploymentAliasHostnames(deploymentId: string): Promise<string[]> {
  const data = await vercelGet<{ aliases?: unknown[] }>(
    `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`,
  );
  const out: string[] = [];
  for (const row of data.aliases ?? []) {
    if (typeof row === "string") {
      const h = hostnameOnly(row);
      if (h) out.push(h);
      continue;
    }
    if (row && typeof row === "object") {
      const o = row as { domain?: string; alias?: string; name?: string };
      const dom = o.domain ?? o.alias ?? o.name;
      if (typeof dom === "string" && dom.trim()) out.push(hostnameOnly(dom));
    }
  }
  return [...new Set(out)];
}

/**
 * Resolves the hostname users should open: merges deployment `url` + alias API.
 * Prefers the unique preview URL (changes every deploy) for releases so we show the actual build URL.
 */
export async function resolveDeploymentVisitHostname(
  deploymentId: string,
  dep: VercelDeploymentSummary,
): Promise<string | null> {
  const candidates: string[] = [];
  const direct = pickHostnameFromDeploymentSummary(dep);
  if (direct) candidates.push(direct);
  try {
    candidates.push(...(await listDeploymentAliasHostnames(deploymentId)));
  } catch {
    /* ignore */
  }
  return pickPreferredPublicHostname(candidates, true);
}

export async function fetchDeployment(deploymentId: string): Promise<VercelDeploymentSummary> {
  const data = await vercelGet<{ deployment: VercelDeploymentSummary }>(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
  );
  return data.deployment;
}

export async function listRecentDeployments(projectId: string, limit = 8): Promise<VercelDeploymentSummary[]> {
  const team = getVercelTeamId();
  const params = new URLSearchParams({ projectId, limit: String(limit) });
  if (team) params.set("teamId", team);
  const data = await vercelGet<{ deployments: VercelDeploymentSummary[] }>(
    `/v6/deployments?${params.toString()}`,
  );
  return data.deployments ?? [];
}

/** List deployments for a Git branch (Vercel `branch` query param on GET /v6/deployments). */
export async function listDeploymentsForBranch(
  projectId: string,
  branch: string,
  limit = 25,
): Promise<VercelDeploymentSummary[]> {
  const team = getVercelTeamId();
  const params = new URLSearchParams({
    projectId,
    limit: String(limit),
    branch,
  });
  if (team) params.set("teamId", team);
  const data = await vercelGet<{ deployments: VercelDeploymentSummary[] }>(
    `/v6/deployments?${params.toString()}`,
  );
  return data.deployments ?? [];
}

/**
 * Best-effort build log text from deployment events (truncated).
 */
export async function fetchDeploymentLogExcerpt(
  deploymentId: string,
  maxChars = 24_000,
): Promise<string> {
  const token = getVercelToken();
  if (!token) throw new Error("VERCEL_TOKEN is not configured");
  const path = `/v2/deployments/${encodeURIComponent(deploymentId)}/events`;
  const url = withTeamQuery(`${BASE}${path}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text();
    return `[Could not fetch deployment events: ${res.status} ${text.slice(0, 2000)}]`;
  }
  const events = (await res.json()) as { payload?: { text?: string }; text?: string }[];
  const lines: string[] = [];
  for (const ev of Array.isArray(events) ? events : []) {
    const t = ev.payload?.text ?? ev.text;
    if (t) lines.push(t);
  }
  const out = lines.join("\n");
  if (out.length <= maxChars) return out;
  return `${out.slice(0, maxChars)}\n\n… [truncated ${out.length - maxChars} chars]`;
}

export function mapReadyStateToReleaseStatus(
  readyState?: string,
  state?: string,
): "pending" | "building" | "ready" | "error" | "canceled" {
  const rs = (readyState ?? "").toUpperCase();
  const st = (state ?? "").toUpperCase();
  if (rs === "ERROR" || st === "ERROR") return "error";
  if (rs === "CANCELED" || st === "CANCELED") return "canceled";
  if (rs === "READY" || rs === "SUCCESS" || rs === "CACHED") return "ready";
  if (rs === "BUILDING" || rs === "QUEUED" || rs === "INITIALIZING") return "building";
  return "pending";
}
