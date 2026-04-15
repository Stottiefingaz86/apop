import {
  fetchDeployment,
  listDeploymentsForBranch,
  listRecentDeployments,
  resolveDeploymentVisitHostname,
  vercelTimestampToMs,
  type VercelDeploymentSummary,
} from "@/lib/vercel/api";

function deploymentCreatedMs(d: VercelDeploymentSummary): number {
  return vercelTimestampToMs(d.createdAt ?? d.created);
}

function normalizeBranchRef(s: string): string {
  return s.trim().replace(/^refs\/heads\//i, "");
}

function gitBranchFromDeploymentMeta(d: VercelDeploymentSummary): string | null {
  const m = d.meta;
  if (!m || typeof m !== "object") return null;
  const rec = m as Record<string, string>;
  const raw = rec.githubCommitRef ?? rec.branch;
  if (typeof raw === "string" && raw.trim()) return normalizeBranchRef(raw);
  return null;
}

/**
 * Best-effort https URL for the latest non-failed Vercel Preview deployment on the given Git branch.
 */
export async function resolveCursorBranchPreviewVisitUrl(
  projectId: string,
  branchName: string,
): Promise<string | null> {
  const want = normalizeBranchRef(branchName).toLowerCase();
  if (!want) return null;

  let rows: VercelDeploymentSummary[] = [];
  try {
    rows = await listDeploymentsForBranch(projectId, branchName, 25);
  } catch {
    rows = [];
  }
  if (rows.length === 0) {
    try {
      const recent = await listRecentDeployments(projectId, 60);
      rows = recent.filter((d) => {
        const b = gitBranchFromDeploymentMeta(d);
        return b != null && b.toLowerCase() === want;
      });
    } catch {
      rows = [];
    }
  }

  const sorted = [...rows]
    .filter((d) => d.uid || d.id)
    .sort((a, b) => deploymentCreatedMs(b) - deploymentCreatedMs(a));

  for (const dep of sorted) {
    const id = dep.uid ?? dep.id;
    if (!id) continue;
    const rs = (dep.readyState ?? "").toUpperCase();
    if (rs === "ERROR" || rs === "CANCELED") continue;
    try {
      const full = await fetchDeployment(id);
      const fullRs = (full.readyState ?? "").toUpperCase();
      if (fullRs === "ERROR" || fullRs === "CANCELED") continue;
      const host = await resolveDeploymentVisitHostname(id, full);
      if (host) return `https://${host}`;
      const u = full.url ?? dep.url;
      if (typeof u === "string" && u.trim()) {
        const t = u.trim();
        return t.startsWith("http") ? t : `https://${t.replace(/^https?:\/\//i, "").split("/")[0]}`;
      }
    } catch {
      continue;
    }
  }
  return null;
}
