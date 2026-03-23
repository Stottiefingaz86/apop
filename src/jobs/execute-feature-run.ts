import type { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseContextPack } from "@/lib/domain/context-pack";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import {
  featureStatusAfterSuccessfulRun,
  featureStatusForArtifactReview,
  featureStatusForQuestions,
  STAGE_DEFAULT_AGENT,
} from "@/lib/domain/run-lifecycle";
import { getAgent } from "@/agents/registry";
import type { AgentContext, AgentName } from "@/agents/types";
import { agentQuestionsPayloadSchema } from "@/lib/domain/agent-questions";

export type ExecuteRunOptions = {
  featureId: string;
  stage: FeatureStage;
  agentNameOverride?: AgentName;
};

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

export async function executeFeatureRun(options: ExecuteRunOptions): Promise<{ runId: string }> {
  const { featureId, stage } = options;
  const defaultName = STAGE_DEFAULT_AGENT[stage];
  const agentName = options.agentNameOverride ?? defaultName;

  if (!agentName) {
    throw new Error(`No agent configured for stage ${stage}`);
  }

  const agent = getAgent(agentName as AgentName);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  const feature = await prisma.feature.findUniqueOrThrow({ where: { id: featureId } });
  const designRow =
    (await prisma.designInputs.findUnique({ where: { featureId } })) ??
    (await prisma.designInputs.create({ data: { featureId } }));

  const artifactsByType = await loadArtifactsMap(featureId);

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
  };

  const run = await prisma.run.create({
    data: {
      featureId,
      stage,
      agentName,
      status: "running",
    },
  });

  const log = async (message: string) => {
    await prisma.runEvent.create({
      data: { runId: run.id, message },
    });
  };

  await log(`Run started for ${agentName} @ ${stage}`);

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
        data: { status: "failed", updatedAt: new Date() },
      });
      return { runId: run.id };
    }

    if (result.kind === "questions") {
      const parsed = agentQuestionsPayloadSchema.safeParse(result.payload);
      if (!parsed.success) {
        await log(`Invalid questions payload: ${parsed.error.message}`);
        await prisma.run.update({
          where: { id: run.id },
          data: { status: "failed", completedAt: new Date() },
        });
        await prisma.feature.update({
          where: { id: featureId },
          data: { status: "failed" },
        });
        return { runId: run.id };
      }

      await prisma.agentQuestion.create({
        data: {
          featureId,
          stage,
          agentName,
          questionJson: parsed.data as object,
          status: "open",
        },
      });

      await prisma.artifact.create({
        data: {
          featureId,
          stage,
          type: ARTIFACT_TYPES.AGENT_QUESTIONS,
          contentJson: parsed.data as object,
          contentMarkdown: null,
        },
      });

      await log("Agent requested structured input — feature set to awaiting_input");
      await prisma.run.update({
        where: { id: run.id },
        data: { status: "completed", completedAt: new Date() },
      });
      await prisma.feature.update({
        where: { id: featureId },
        data: {
          status: featureStatusForQuestions(),
          updatedAt: new Date(),
        },
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
        stage,
        type: result.type,
        contentJson: result.contentJson as object,
        contentMarkdown: result.contentMarkdown,
        version: latestVersion + 1,
      },
    });

    await log(`Artifact saved: ${result.type} v${latestVersion + 1}`);

    const nextStage = result.nextStage;
    const reviewStatus = result.needsReview
      ? featureStatusForArtifactReview()
      : featureStatusAfterSuccessfulRun();

    await prisma.run.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date() },
    });

    await prisma.feature.update({
      where: { id: featureId },
      data: {
        status: reviewStatus,
        score: result.score ?? feature.score,
        stage: nextStage ?? feature.stage,
        updatedAt: new Date(),
      },
    });

    await log("Run completed");
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
      data: { status: "failed" },
    });
    return { runId: run.id };
  }
}

