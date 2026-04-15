import { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCursorCloudAgent } from "@/lib/cursor/cloud-agents";
import { isCursorAgentFinished, isCursorAgentSucceeded } from "@/lib/cursor/agent-status";
import { resolveCursorBranchPreviewVisitUrl } from "@/lib/vercel/cursor-branch-preview";
import { getVercelProjectId, getVercelToken } from "@/lib/vercel/env";
import { syncLatestReleaseForFeature } from "@/lib/vercel/release-sync";

export async function syncLatestCursorJobForFeature(featureId: string) {
  const job = await prisma.cursorAgentJob.findFirst({
    where: { featureId },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return { job: null as null, deployTriggered: false };

  const remote = await getCursorCloudAgent(job.cursorAgentId);
  if (!remote.ok) {
    const next = await prisma.cursorAgentJob.update({
      where: { id: job.id },
      data: {
        errorMessage: remote.error.slice(0, 4000),
      },
    });
    return { job: next, deployTriggered: false };
  }

  const a = remote.agent;
  const status = a.status ?? job.status;
  const agentUrl = a.target?.url ?? job.agentUrl;
  const prUrl = a.target?.prUrl ?? job.prUrl;
  const targetBranch = a.target?.branchName?.trim() || job.targetBranch?.trim() || undefined;

  const summary = a.summary?.trim() || undefined;

  await prisma.cursorAgentJob.update({
    where: { id: job.id },
    data: {
      status: status ?? undefined,
      cursorSummary: summary ?? undefined,
      agentUrl: agentUrl ?? undefined,
      prUrl: prUrl ?? undefined,
      ...(targetBranch ? { targetBranch } : {}),
    },
  });

  let deployTriggered = false;
  const fresh = await prisma.cursorAgentJob.findUniqueOrThrow({ where: { id: job.id } });

  let updated: typeof fresh | null = fresh;

  // Resolve the Vercel Preview URL for the Cursor branch (created automatically
  // by Vercel's GitHub integration when Cursor pushes). This is the real preview
  // — NOT the deploy hook, which rebuilds a fixed branch like main.
  if (
    updated.targetBranch?.trim() &&
    getVercelToken() &&
    getVercelProjectId()
  ) {
    const shouldLookup =
      !updated.vercelPreviewUrl?.trim() || shouldPollCursorJob(updated.status);
    if (shouldLookup) {
      try {
        const previewUrl = await resolveCursorBranchPreviewVisitUrl(
          getVercelProjectId()!,
          updated.targetBranch.trim(),
        );
        if (previewUrl) {
          updated = await prisma.cursorAgentJob.update({
            where: { id: job.id },
            data: { vercelPreviewUrl: previewUrl },
          });
        }
      } catch {
        /* Vercel API optional */
      }
    }
  }

  // When autoDeploy is on and Cursor succeeded, mark deployTriggered so the card
  // shows the preview URL. We no longer fire the deploy hook here — Vercel's
  // GitHub integration already created the preview when Cursor pushed the branch.
  // The deploy hook (which rebuilds main) only fires from explicit "Deploy" in the
  // workspace, after the user merges the PR.
  if (
    isCursorAgentSucceeded(status) &&
    fresh.autoDeploy &&
    !fresh.deployTriggered
  ) {
    deployTriggered = true;
    await prisma.cursorAgentJob.update({
      where: { id: job.id },
      data: { deployTriggered: true },
    });
  }

  if (
    getVercelToken() &&
    getVercelProjectId() &&
    updated &&
    (deployTriggered || isCursorAgentSucceeded(updated.status))
  ) {
    void syncLatestReleaseForFeature(featureId).catch(() => undefined);
  }

  if (isCursorAgentSucceeded(status)) {
    const feature = await prisma.feature.findUnique({ where: { id: featureId } });
    if (feature?.stage === FeatureStage.IN_BUILD) {
      await prisma.feature.update({
        where: { id: featureId },
        data: { stage: FeatureStage.DONE, status: "idle" },
      });
    }
  }

  return { job: updated, deployTriggered };
}

export function shouldPollCursorJob(status: string | null | undefined): boolean {
  return !isCursorAgentFinished(status);
}
