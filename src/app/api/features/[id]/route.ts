import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { FeatureStage, RoadmapLane } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractContextPackAttachments } from "@/lib/domain/context-pack-api";
import { parseContextPack } from "@/lib/domain/context-pack";
import type { ReferenceImageInput, ReferencePdfInput } from "@/lib/domain/feature-attachment-limits";
import { validateFeatureAttachments } from "@/lib/domain/feature-attachments";
import { STAGE_DEFAULT_AGENT } from "@/lib/domain/run-lifecycle";
import { executeFeatureRun } from "@/jobs/execute-feature-run";
import { isCursorBuildConfigured } from "@/lib/cursor/env";
import { launchSpecPhaseForFeature } from "@/lib/cursor/spec-phase";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  contextPack: z.record(z.unknown()).optional(),
  roadmapLane: z.nativeEnum(RoadmapLane).optional(),
  roadmapCostEstimate: z.union([z.string().max(8000), z.null()]).optional(),
  roadmapTargetDate: z.union([z.string().datetime(), z.null()]).optional(),
  roadmapExpectedLiftPercent: z.union([z.number().min(-100).max(1e6), z.null()]).optional(),
  roadmapExpectedLiftMetric: z.union([z.string().max(500), z.null()]).optional(),
  stage: z.nativeEnum(FeatureStage).optional(),
  status: z
    .enum([
      "idle",
      "queued",
      "running",
      "awaiting_input",
      "awaiting_review",
      "approved",
      "rejected",
      "failed",
      "blocked",
    ])
    .optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = await prisma.feature.findUnique({ where: { id } });
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(f);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const before = await prisma.feature.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { contextPack, ...rest } = parsed.data;
    const nextStage = rest.stage;

    let mergedContextPack: Prisma.InputJsonValue | undefined;
    if (contextPack !== undefined) {
      const extracted = extractContextPackAttachments(contextPack);
      if (extracted.attachmentError) {
        return NextResponse.json({ error: extracted.attachmentError }, { status: 400 });
      }
      const prev = parseContextPack(before.contextPack) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...prev, ...extracted.clean };
      if (extracted.referenceImages !== undefined) {
        next.referenceImages = extracted.referenceImages;
      }
      if (extracted.referencePrdPdf !== undefined) {
        next.referencePrdPdf = extracted.referencePrdPdf;
      }
      const attOk = validateFeatureAttachments({
        referenceImages: next.referenceImages as ReferenceImageInput[] | undefined,
        referencePrdPdf: next.referencePrdPdf as ReferencePdfInput | undefined,
      });
      if (!attOk.ok) {
        return NextResponse.json({ error: attOk.error }, { status: 400 });
      }
      mergedContextPack = next as Prisma.InputJsonValue;
    }

    const data: Prisma.FeatureUpdateInput = {
      ...rest,
      ...(mergedContextPack !== undefined && { contextPack: mergedContextPack }),
    };

    const f = await prisma.feature.update({
      where: { id },
      data,
    });

    const stageChanged =
      typeof nextStage !== "undefined" && nextStage !== before.stage;
    if (stageChanged && nextStage) {
      const agent = STAGE_DEFAULT_AGENT[nextStage];
      const okToAutoRun = ["idle", "failed", "blocked"].includes(f.status);
      if (agent && okToAutoRun) {
        if (nextStage === "PRD" && isCursorBuildConfigured()) {
          void launchSpecPhaseForFeature(id).catch((e) => {
            console.error("[features/PATCH] spec-kit launch failed, falling back to PRD agent", e);
            void executeFeatureRun({ featureId: id, stage: nextStage }).catch((e2) => {
              console.error("[features/PATCH] PRD fallback also failed", e2);
            });
          });
          const fWithRunning = await prisma.feature.findUnique({ where: { id } });
          return NextResponse.json(fWithRunning ?? f);
        }
        await prisma.feature.update({
          where: { id },
          data: { status: "running" },
        });
        const fWithRunning = await prisma.feature.findUnique({ where: { id } });
        void executeFeatureRun({ featureId: id, stage: nextStage }).catch((e) => {
          console.error("[features/PATCH] auto-run after stage change failed", e);
        });
        return NextResponse.json(fWithRunning ?? f);
      }
    }

    return NextResponse.json(f);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await prisma.feature.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
