import { NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalRecordStatus, FeatureStage, FeatureStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { enqueueFeatureRun } from "@/jobs/queue";
import { isCursorBuildConfigured } from "@/lib/cursor/env";
import { launchSpecPhaseForFeature } from "@/lib/cursor/spec-phase";

const bodySchema = z.object({
  stage: z.nativeEnum(FeatureStage),
  status: z.nativeEnum(ApprovalRecordStatus),
  approvedBy: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.feature.findUniqueOrThrow({ where: { id } });

  await prisma.approval.create({
    data: {
      featureId: id,
      stage: parsed.data.stage,
      status: parsed.data.status,
      approvedBy: parsed.data.approvedBy ?? "user",
    },
  });

  const approved = parsed.data.status === "approved";
  const rejected = parsed.data.status === "rejected";
  const clientStage = parsed.data.stage;

  let runStage: FeatureStage | null = null;
  let updateData: { status: FeatureStatus; stage?: FeatureStage };

  if (rejected) {
    updateData = { status: "rejected", stage: "REJECTED" };
  } else if (approved) {
    const latestValue = await prisma.artifact.findFirst({
      where: { featureId: id, type: ARTIFACT_TYPES.VALUE_ANALYSIS },
      orderBy: { version: "desc" },
    });
    const latestDesign = await prisma.artifact.findFirst({
      where: { featureId: id, type: ARTIFACT_TYPES.DESIGN_SPEC },
      orderBy: { version: "desc" },
    });
    const latestPrd = await prisma.artifact.findFirst({
      where: { featureId: id, type: ARTIFACT_TYPES.PRD },
      orderBy: { version: "desc" },
    });

    if (clientStage === "READY_FOR_BUILD") {
      updateData = { status: "approved", stage: "IN_BUILD" };
    } else if (clientStage === "DESIGN_SPEC") {
      if (!latestDesign) {
        updateData = { status: "running", stage: "DESIGN_SPEC" };
        runStage = "DESIGN_SPEC";
      } else {
        updateData = { status: "running", stage: "PRD" };
        runStage = "PRD";
      }
    } else if (clientStage === "PRD") {
      if (!latestPrd) {
        updateData = { status: "running", stage: "PRD" };
        runStage = "PRD";
      } else {
        /**
         * PRD (Cursor prompt) approved — skip “Ready for build” drag; land in In build signed-off so
         * Deploy / Start Cursor can run immediately (same gates as the board).
         */
        updateData = { status: "approved", stage: "READY_FOR_BUILD" };
      }
    } else if (clientStage === "INBOX") {
      /** Inbox is backlog only — research starts when the card is moved to Research Analysis. */
      updateData = { status: "idle", stage: "INBOX" };
    } else if (clientStage === "VALUE_REVIEW") {
      if (!latestValue) {
        updateData = { status: "running", stage: "VALUE_REVIEW" };
        runStage = "VALUE_REVIEW";
      } else {
        /** Value approved — advance to Design and start the design-spec agent. */
        updateData = { status: "running", stage: "DESIGN_SPEC" };
        runStage = "DESIGN_SPEC";
      }
    } else {
      updateData = { status: "approved" };
    }
  } else {
    updateData = { status: "awaiting_review" };
  }

  const f = await prisma.feature.update({
    where: { id },
    data: updateData,
  });

  if (runStage) {
    if (runStage === "PRD" && isCursorBuildConfigured()) {
      void launchSpecPhaseForFeature(id).catch(async (e) => {
        console.error("[approval] spec-kit launch failed, falling back to PRD agent", e);
        void enqueueFeatureRun({ featureId: id, stage: "PRD" }).catch(async (e2) => {
          console.error("[approval] PRD fallback also failed", e2);
          await prisma.feature.update({
            where: { id },
            data: { status: "failed" },
          });
        });
      });
    } else {
      void enqueueFeatureRun({ featureId: id, stage: runStage }).catch(async (e) => {
        console.error("[approval] enqueueFeatureRun failed", e);
        await prisma.feature.update({
          where: { id },
          data: { status: "failed" },
        });
      });
    }
  }

  return NextResponse.json({ feature: f });
}
