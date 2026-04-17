import type { FeatureStage, Release, ReleaseStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getVercelProjectId, getVercelToken } from "@/lib/vercel/env";
import {
  fetchDeployment,
  fetchDeploymentLogExcerpt,
  listRecentDeployments,
  mapReadyStateToReleaseStatus,
  resolveDeploymentVisitHostname,
  vercelTimestampToMs,
} from "./api";
import { executeDeploymentFixRun } from "@/jobs/execute-deployment-fix";
import { releaseEffectivelyReady } from "@/lib/vercel/deployment-display";

export type VercelWebhookBody = {
  type?: string;
  payload?: {
    deployment?: {
      id?: string;
      uid?: string;
      url?: string;
      readyState?: string;
      state?: string;
      inspectorUrl?: string;
      errorMessage?: string;
      createdAt?: number;
      meta?: Record<string, unknown>;
    };
    target?: { deployment?: { id?: string; uid?: string } };
    links?: { deployment?: string };
  };
};

function deploymentIdFromPayload(d: VercelWebhookBody["payload"]): string | null {
  const dep = d?.deployment ?? d?.target?.deployment;
  const id = dep?.id ?? dep?.uid;
  return id ?? null;
}

export async function syncReleaseFromVercelWebhook(
  body: VercelWebhookBody,
  rawJson: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const deploymentId = deploymentIdFromPayload(body.payload);
  if (!deploymentId) {
    return { ok: true, message: "ignored: no deployment id" };
  }

  let release = await prisma.release.findUnique({ where: { vercelDeploymentId: deploymentId } });

  if (!release) {
    const orphans = await prisma.release.findMany({
      where: {
        vercelDeploymentId: null,
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    });
    if (orphans.length === 0) {
      return {
        ok: true,
        message: "no unlinked release in the last 30m — trigger deploy from APOP first",
      };
    }
    const depCreatedRaw = body.payload?.deployment?.createdAt;
    const depMs = depCreatedRaw != null ? vercelTimestampToMs(depCreatedRaw) : null;
    let chosen = orphans[0]!;
    if (orphans.length > 1 && depMs != null && depMs > 0) {
      chosen = orphans.reduce((best, o) => {
        const da = Math.abs(o.createdAt.getTime() - depMs);
        const db = Math.abs(best.createdAt.getTime() - depMs);
        return da < db ? o : best;
      });
    }
    release = await prisma.release.update({
      where: { id: chosen.id },
      data: { vercelDeploymentId: deploymentId },
    });
  }

  const dep = body.payload?.deployment;
  const readyState = dep?.readyState;
  const state = dep?.state;
  const status = mapReadyStateToReleaseStatus(readyState, state) as ReleaseStatus;

  const inspectorUrl =
    dep?.inspectorUrl ??
    (typeof body.payload?.links?.deployment === "string" ? body.payload.links.deployment : null);

  let vercelUrl: string | null = dep?.url?.trim() ? dep.url.trim() : null;
  const deploymentIdForFetch = dep?.uid ?? dep?.id ?? deploymentId;
  if (deploymentIdForFetch && getVercelToken()) {
    try {
      const full = await fetchDeployment(deploymentIdForFetch);
      const resolved = await resolveDeploymentVisitHostname(deploymentIdForFetch, full);
      if (resolved) vercelUrl = resolved;
      else if (!vercelUrl && full.url?.trim()) vercelUrl = full.url.trim();
    } catch {
      /* keep webhook-provided url; next refresh will retry */
    }
  }

  const updated = await prisma.release.update({
    where: { id: release.id },
    data: {
      status,
      readyState: readyState ?? null,
      vercelUrl,
      inspectorUrl,
      errorMessage: dep?.errorMessage ?? null,
      rawPayload: rawJson as object,
    },
  });

  if (status === "ready") {
    await prisma.feature.updateMany({
      where: { id: updated.featureId, deployedAt: null },
      data: { deployedAt: new Date() },
    });
  }

  if (status === "error" && !updated.fixRunTriggered) {
    await prisma.release.update({
      where: { id: updated.id },
      data: { fixRunTriggered: true },
    });
    void executeDeploymentFixRun({ featureId: updated.featureId, releaseId: updated.id }).catch((e) => {
      console.error("[apop] deployment fix run failed", e);
    });
  }

  return { ok: true, message: `updated release ${updated.id}` };
}

/**
 * After deploy hook, attach the **earliest unclaimed** deployment that started after this release row
 * was created. Picking “newest in window” races when several features trigger the same hook close
 * together — the wrong card can steal another feature’s preview URL.
 */
export async function attachLatestDeploymentToRelease(releaseId: string) {
  const projectId = getVercelProjectId();
  if (!projectId) return;
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release || release.vercelDeploymentId) return;

  const releaseMs = release.createdAt.getTime();
  /** Allow clock skew / hook latency: ignore builds that started long before we recorded the release. */
  const notBeforeMs = releaseMs - 120_000;
  /** Still link slow builds that start within this window after the release row. */
  const notAfterMs = releaseMs + 3_600_000;

  const deployments = await listRecentDeployments(projectId, 40);
  const claimedRows = await prisma.release.findMany({
    where: { vercelDeploymentId: { not: null } },
    select: { vercelDeploymentId: true },
  });
  const claimed = new Set(
    claimedRows.map((r) => r.vercelDeploymentId).filter((id): id is string => !!id?.trim()),
  );

  const candidates = deployments
    .map((d) => {
      const id = d.uid ?? d.id;
      if (!id) return null;
      const created = vercelTimestampToMs(d.createdAt);
      if (created < notBeforeMs || created > notAfterMs) return null;
      if (claimed.has(id)) return null;
      return { dep: d, id, created };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.created - b.created);

  for (const { id: pickId } of candidates) {
    const stillFree = await prisma.release.findFirst({
      where: { vercelDeploymentId: pickId },
      select: { id: true },
    });
    if (stillFree && stillFree.id !== releaseId) continue;

    try {
      const full = await fetchDeployment(pickId);
      const depKey = full.uid ?? pickId;

      const status = mapReadyStateToReleaseStatus(full.readyState, full.state) as ReleaseStatus;
      const visitHost = await resolveDeploymentVisitHostname(depKey, full);
      let updated;
      try {
        updated = await prisma.release.updateMany({
          where: { id: releaseId, vercelDeploymentId: null },
          data: {
            vercelDeploymentId: depKey,
            status,
            readyState: full.readyState ?? null,
            vercelUrl: visitHost ?? full.url ?? null,
            inspectorUrl: full.inspectorUrl ?? null,
            errorMessage: full.errorMessage ?? null,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          continue;
        }
        throw e;
      }
      if (updated.count === 0) return;

      if (status === "error") {
        const r = await prisma.release.findUnique({ where: { id: releaseId } });
        if (r && !r.fixRunTriggered) {
          await prisma.release.update({ where: { id: releaseId }, data: { fixRunTriggered: true } });
          void executeDeploymentFixRun({ featureId: r.featureId, releaseId: r.id }).catch(console.error);
        }
      }
      return;
    } catch (e) {
      console.error("[apop] attachLatestDeploymentToRelease", e);
      return;
    }
  }
}

export async function refreshReleaseFromVercel(release: Release): Promise<Release> {
  if (!release.vercelDeploymentId) return release;
  const full = await fetchDeployment(release.vercelDeploymentId);
  const status = mapReadyStateToReleaseStatus(full.readyState, full.state) as ReleaseStatus;
  const visitHost = await resolveDeploymentVisitHostname(release.vercelDeploymentId, full);
  let buildLogExcerpt = release.buildLogExcerpt;
  if (status === "error" && !buildLogExcerpt) {
    try {
      buildLogExcerpt = await fetchDeploymentLogExcerpt(release.vercelDeploymentId);
    } catch {
      buildLogExcerpt = null;
    }
  }
  return prisma.release.update({
    where: { id: release.id },
    data: {
      status,
      readyState: full.readyState ?? null,
      vercelUrl: visitHost ?? full.url ?? release.vercelUrl,
      inspectorUrl: full.inspectorUrl ?? null,
      errorMessage: full.errorMessage ?? null,
      buildLogExcerpt,
    },
  });
}

/** True while we expect Vercel API polling to change this row (board / workspace refresh). */
export function releaseNeedsVercelPolling(
  r: Pick<Release, "status" | "vercelUrl" | "readyState"> | null | undefined,
): boolean {
  if (!r) return false;
  if (r.status === "canceled" || r.status === "error") return false;
  // Any visitable hostname means deploy is done for UX — don’t keep “sync busy” if status lags as `building`.
  if (r.vercelUrl?.trim()) return false;
  if (r.status === "ready" || releaseEffectivelyReady(r)) return false;
  return true;
}

const PIPELINE_VERCEL_SYNC_STAGES: FeatureStage[] = ["IN_BUILD", "QA"];

/**
 * Refresh the latest release from Vercel for pipeline polling (requires VERCEL_TOKEN + VERCEL_PROJECT_ID).
 */
export async function syncLatestReleaseForFeature(featureId: string): Promise<void> {
  if (!getVercelToken() || !getVercelProjectId()) return;

  const releases = await prisma.release.findMany({
    where: { featureId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const latest = releases[0];
  if (!latest || !releaseNeedsVercelPolling(latest)) return;

  try {
    if (!latest.vercelDeploymentId) {
      await attachLatestDeploymentToRelease(latest.id);
    }
    const again = await prisma.release.findUnique({ where: { id: latest.id } });
    if (again?.vercelDeploymentId) {
      await refreshReleaseFromVercel(again);
    }
  } catch (e) {
    console.error("[apop] syncLatestReleaseForFeature", featureId, e);
  }
}

export function featureEligibleForPipelineVercelSync(stage: FeatureStage): boolean {
  return PIPELINE_VERCEL_SYNC_STAGES.includes(stage);
}
