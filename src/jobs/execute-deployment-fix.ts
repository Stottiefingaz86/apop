import { prisma } from "@/lib/prisma";
import { parseContextPack } from "@/lib/domain/context-pack";
import { featureStatusForArtifactReview } from "@/lib/domain/run-lifecycle";
import { getAgent } from "@/agents/registry";
import type { AgentContext } from "@/agents/types";
import { fetchDeploymentLogExcerpt } from "@/lib/vercel/api";
import { loadWorkspaceKnowledgeBriefSafe } from "@/lib/data/workspace-knowledge-load";

async function loadArtifactsMap(featureId: string) {
  const artifacts = await prisma.artifact.findMany({
    where: { featureId },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, { contentJson: unknown; contentMarkdown: string | null }>();
  for (const a of artifacts) {
    if (!map.has(a.type)) {
      map.set(a.type, { contentJson: a.contentJson, contentMarkdown: a.contentMarkdown });
    }
  }
  return map;
}

export type ExecuteDeploymentFixOptions = {
  featureId: string;
  releaseId: string;
};

/**
 * Runs deployment-fix-agent with logs pulled from Vercel (no user paste).
 * Does not advance pipeline stage; sets feature to awaiting_review on success.
 */
export async function executeDeploymentFixRun(
  options: ExecuteDeploymentFixOptions,
): Promise<{ runId: string }> {
  const { featureId, releaseId } = options;
  const release = await prisma.release.findFirst({
    where: { id: releaseId, featureId },
  });
  if (!release?.vercelDeploymentId) {
    throw new Error("Release has no vercelDeploymentId yet");
  }

  const agent = getAgent("deployment-fix-agent");
  if (!agent) throw new Error("deployment-fix-agent not registered");

  const feature = await prisma.feature.findUniqueOrThrow({ where: { id: featureId } });
  const designRow =
    (await prisma.designInputs.findUnique({ where: { featureId } })) ??
    (await prisma.designInputs.create({ data: { featureId } }));

  const buildLogExcerpt = await fetchDeploymentLogExcerpt(release.vercelDeploymentId);

  await prisma.release.update({
    where: { id: release.id },
    data: { buildLogExcerpt },
  });

  const artifactsByType = await loadArtifactsMap(featureId);
  const workspaceKnowledgeBrief = await loadWorkspaceKnowledgeBriefSafe();

  const ctx: AgentContext = {
    feature,
    contextPack: parseContextPack(feature.contextPack),
    designInputs: {
      tokenJson: designRow.tokenJson,
      figmaUrl: designRow.figmaUrl,
      competitorUrls: (designRow.competitorUrls as string[] | null) ?? null,
      screenshots: (designRow.screenshots as string[] | null) ?? null,
      notes: designRow.notes,
      brandDescription: designRow.brandDescription,
      uxDirection: designRow.uxDirection,
    },
    artifactsByType,
    deploymentDiagnostics: {
      releaseId: release.id,
      vercelDeploymentId: release.vercelDeploymentId,
      status: release.status,
      errorMessage: release.errorMessage,
      inspectorUrl: release.inspectorUrl,
      buildLogExcerpt,
    },
    workspaceKnowledgeBrief,
  };

  const run = await prisma.run.create({
    data: {
      featureId,
      stage: "IN_BUILD",
      agentName: agent.name,
      status: "running",
    },
  });

  const log = async (message: string) => {
    await prisma.runEvent.create({ data: { runId: run.id, message } });
  };

  await log("Deployment fix run started (logs from Vercel API)");

  try {
    const result = await agent.run(ctx);

    if (result.kind === "failed") {
      await log(`Failed: ${result.error}`);
      await prisma.run.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date() },
      });
      await prisma.feature.update({
        where: { id: featureId },
        data: { status: "blocked", updatedAt: new Date() },
      });
      return { runId: run.id };
    }

    if (result.kind === "questions") {
      await log("Unexpected questions payload from deployment-fix-agent");
      await prisma.run.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date() },
      });
      await prisma.feature.update({
        where: { id: featureId },
        data: { status: "blocked" },
      });
      return { runId: run.id };
    }

    const latestVersion =
      (
        await prisma.artifact.findFirst({
          where: { featureId, type: result.type },
          orderBy: { version: "desc" },
        })
      )?.version ?? 0;

    await prisma.artifact.create({
      data: {
        featureId,
        stage: "IN_BUILD",
        type: result.type,
        contentJson: result.contentJson as object,
        contentMarkdown: result.contentMarkdown,
        version: latestVersion + 1,
      },
    });

    await log(`Saved ${result.type} v${latestVersion + 1}`);

    await prisma.run.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date() },
    });

    await prisma.feature.update({
      where: { id: featureId },
      data: {
        status: featureStatusForArtifactReview(),
        updatedAt: new Date(),
      },
    });

    await log("Deployment remediation artifact ready for review");
    return { runId: run.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(`Error: ${msg}`);
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date() },
    });
    await prisma.feature.update({
      where: { id: featureId },
      data: { status: "blocked" },
    });
    return { runId: run.id };
  }
}
