import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { isRoadmapLane } from "@/lib/domain/roadmap-lanes";
import { prisma } from "@/lib/prisma";

const patchSchema = z
  .object({
    contentJson: z.record(z.unknown()).optional(),
    contentMarkdown: z.string().optional().nullable(),
  })
  .refine((d) => d.contentJson !== undefined || d.contentMarkdown !== undefined, {
    message: "Provide contentJson and/or contentMarkdown",
  });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.feature.findUniqueOrThrow({ where: { id: featureId } });

  const latest = await prisma.artifact.findFirst({
    where: { featureId, type: ARTIFACT_TYPES.PRD },
    orderBy: { version: "desc" },
  });
  if (!latest) {
    return NextResponse.json({ error: "No PRD artifact for this feature" }, { status: 404 });
  }

  const data: Prisma.ArtifactUpdateInput = {};
  if (parsed.data.contentJson !== undefined) {
    data.contentJson = parsed.data.contentJson as Prisma.InputJsonValue;
  }
  if (parsed.data.contentMarkdown !== undefined) {
    data.contentMarkdown = parsed.data.contentMarkdown;
  }

  const artifact = await prisma.artifact.update({
    where: { id: latest.id },
    data,
  });

  if (parsed.data.contentJson !== undefined) {
    const prev =
      latest.contentJson && typeof latest.contentJson === "object" && !Array.isArray(latest.contentJson)
        ? (latest.contentJson as Record<string, unknown>)
        : {};
    const merged = { ...prev, ...(parsed.data.contentJson as Record<string, unknown>) };
    const lane = merged.roadmapLane;
    if (typeof lane === "string" && isRoadmapLane(lane)) {
      await prisma.feature.update({
        where: { id: featureId },
        data: { roadmapLane: lane },
      });
    }
  }

  return NextResponse.json({ artifact });
}
