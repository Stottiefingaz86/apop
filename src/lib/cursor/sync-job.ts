import { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCursorCloudAgent } from "@/lib/cursor/cloud-agents";
import { isCursorAgentFinished, isCursorAgentSucceeded } from "@/lib/cursor/agent-status";
import { resolveCursorBranchPreviewVisitUrl } from "@/lib/vercel/cursor-branch-preview";
import { getVercelProjectId, getVercelToken } from "@/lib/vercel/env";
import { syncLatestReleaseForFeature } from "@/lib/vercel/release-sync";
import { fetchSpecKitFilesFromBranch } from "@/lib/cursor/fetch-spec-files";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

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

  if (isCursorAgentSucceeded(status) && fresh.jobPhase === "spec") {
    const existingPrd = await prisma.artifact.findFirst({
      where: { featureId, type: ARTIFACT_TYPES.PRD },
      orderBy: { version: "desc" },
    });
    const alreadyHasSpecKit =
      existingPrd?.contentJson &&
      typeof existingPrd.contentJson === "object" &&
      (existingPrd.contentJson as Record<string, unknown>).specKitSource === true;

    if (!alreadyHasSpecKit && fresh.targetBranch?.trim()) {
      console.log(`[sync-job] spec phase succeeded — fetching spec-kit files from ${fresh.targetBranch}`);
      try {
        const files = await fetchSpecKitFilesFromBranch(fresh.targetBranch.trim());
        const specMd = files.spec?.trim() || null;
        const planMd = files.plan?.trim() || null;
        const tasksMd = files.tasks?.trim() || null;
        const reqMd = files.requirements?.trim() || null;
        const resMd = files.research?.trim() || null;

        if (specMd || planMd || tasksMd) {
          const combinedMarkdown = [
            specMd ? `# Specification\n\n${specMd}` : null,
            reqMd ? `# Requirements\n\n${reqMd}` : null,
            resMd ? `# Research\n\n${resMd}` : null,
            planMd ? `# Plan\n\n${planMd}` : null,
            tasksMd ? `# Tasks\n\n${tasksMd}` : null,
          ]
            .filter(Boolean)
            .join("\n\n---\n\n");

          const contentJson = {
            specKitSource: true,
            branch: fresh.targetBranch.trim(),
            prUrl: fresh.prUrl || null,
            spec: specMd,
            plan: planMd,
            tasks: tasksMd,
            requirements: reqMd,
            research: resMd,
            fetchedAt: new Date().toISOString(),
          };

          const nextVersion = (existingPrd?.version ?? 0) + 1;
          await prisma.artifact.create({
            data: {
              featureId,
              stage: "PRD",
              type: ARTIFACT_TYPES.PRD,
              version: nextVersion,
              contentMarkdown: combinedMarkdown,
              contentJson,
            },
          });

          await prisma.feature.update({
            where: { id: featureId },
            data: { status: "awaiting_review", stage: "PRD" },
          });

          console.log(
            `[sync-job] spec-kit PRD artifact created for feature=${featureId} (v${nextVersion}): ` +
            `spec=${!!specMd} plan=${!!planMd} tasks=${!!tasksMd}`,
          );
        } else {
          console.warn("[sync-job] spec phase done but no md files found on branch");
          await prisma.cursorAgentJob.update({
            where: { id: job.id },
            data: {
              errorMessage: "Spec phase finished but no spec.md/plan.md/tasks.md found on the branch.",
            },
          });
        }
      } catch (e) {
        console.error("[sync-job] failed to fetch spec-kit files", e);
      }
    }
  }

  if (isCursorAgentSucceeded(status) && fresh.jobPhase !== "spec") {
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
