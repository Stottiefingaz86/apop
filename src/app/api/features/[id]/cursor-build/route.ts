import { NextResponse } from "next/server";
import { z } from "zod";
import { getFeatureById } from "@/lib/data/features";
import { canStartCursorImplementation, latestArtifactByType } from "@/lib/artifact-utils";
import { parseContextPack } from "@/lib/domain/context-pack";
import { composeShipBriefCore } from "@/lib/domain/ship-brief";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { cursorPromptImagesFromContextPack } from "@/lib/cursor/cursor-prompt-images";
import { buildCursorHandoffPromptWithPreamble } from "@/lib/cursor/build-cursor-handoff-prompt-text";
import { getApopAppUrl } from "@/lib/tracking/env";
import { launchCursorCloudAgent } from "@/lib/cursor/cloud-agents";
import {
  getCursorBuildRef,
  getCursorBuildRepository,
  getCursorWebhookSecret,
  isCursorBuildConfigured,
} from "@/lib/cursor/env";
import { prisma } from "@/lib/prisma";
import { syncLatestCursorJobForFeature } from "@/lib/cursor/sync-job";

const postBodySchema = z.object({
  autoDeploy: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;
  if (!isCursorBuildConfigured()) {
    return NextResponse.json(
      {
        error:
          "Cursor Cloud Agents not configured. Set CURSOR_API_KEY and CURSOR_BUILD_REPOSITORY (GitHub URL) in .env.",
      },
      { status: 501 },
    );
  }

  const repository = getCursorBuildRepository()!;
  const ref = getCursorBuildRef();

  const json = await req.json().catch(() => ({}));
  const parsed = postBodySchema.safeParse(json);
  const autoDeploy = parsed.success ? (parsed.data.autoDeploy ?? false) : false;

  const feature = await getFeatureById(featureId);
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canStartCursorImplementation(feature.artifacts)) {
    return NextResponse.json(
      {
        error:
          "Complete Value analysis, PRD, and Design specification (with content) before starting Cursor. Approve each stage on the pipeline first.",
      },
      { status: 409 },
    );
  }

  const latest = latestArtifactByType(feature.artifacts);
  const value = latest.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  const prd = latest.get(ARTIFACT_TYPES.PRD);
  const design = latest.get(ARTIFACT_TYPES.DESIGN_SPEC);

  const ship = composeShipBriefCore({
    featureTitle: feature.title,
    featureDescription: feature.description,
    contextPack: parseContextPack(feature.contextPack),
    value: value
      ? { contentMarkdown: value.contentMarkdown, contentJson: value.contentJson }
      : null,
    prd: prd ? { contentMarkdown: prd.contentMarkdown, contentJson: prd.contentJson } : null,
    design: design
      ? { contentMarkdown: design.contentMarkdown, contentJson: design.contentJson }
      : null,
  });

  const pack = parseContextPack(feature.contextPack);
  const promptImages = cursorPromptImagesFromContextPack(pack);
  const promptText = buildCursorHandoffPromptWithPreamble(ship, promptImages.length, {
    featureId,
    apopAppUrl: getApopAppUrl(),
  });
  const branchName = `apop/${featureId.slice(0, 10)}-${Date.now().toString(36)}`;

  const appUrl = getApopAppUrl();
  const webhookUrl =
    appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/webhooks/cursor`
      : undefined;
  const webhookSecret = webhookUrl ? getCursorWebhookSecret() ?? undefined : undefined;

  const launched = await launchCursorCloudAgent({
    promptText,
    promptImages: promptImages.length ? promptImages : undefined,
    repository,
    ref,
    branchName,
    autoCreatePr: true,
    webhookUrl,
    webhookSecret,
  });

  if (!launched.ok) {
    return NextResponse.json(
      { error: launched.error, status: launched.status },
      { status: launched.status && launched.status < 500 ? launched.status : 502 },
    );
  }

  const targetBranch =
    launched.agent.target?.branchName?.trim() || branchName;

  const job = await prisma.cursorAgentJob.create({
    data: {
      featureId,
      cursorAgentId: launched.agent.id,
      status: launched.agent.status ?? "CREATING",
      cursorSummary: launched.agent.summary?.trim() || null,
      agentUrl: launched.agent.target?.url ?? null,
      prUrl: launched.agent.target?.prUrl ?? null,
      targetBranch,
      autoDeploy,
    },
  });

  if (feature.stage === "READY_FOR_BUILD") {
    await prisma.feature.update({
      where: { id: featureId },
      data: { stage: "IN_BUILD" },
    });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      cursorAgentId: job.cursorAgentId,
      status: job.status,
      cursorSummary: job.cursorSummary,
      agentUrl: job.agentUrl,
      prUrl: job.prUrl,
      targetBranch: job.targetBranch,
      vercelPreviewUrl: job.vercelPreviewUrl,
      autoDeploy: job.autoDeploy,
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;
  const { job, deployTriggered } = await syncLatestCursorJobForFeature(featureId);
  return NextResponse.json({ job, deployTriggered });
}
