import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseContextPack } from "@/lib/domain/context-pack";
import { enrichContextPackFromFeature } from "@/lib/domain/context-pack-inference";
import { mergeAnswersIntoStores } from "@/lib/apply-agent-answers";
import { executeFeatureRun } from "@/jobs/execute-feature-run";

const bodySchema = z.object({
  questionRecordId: z.string().min(1),
  answers: z.record(z.string()),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const qRow = await prisma.agentQuestion.findFirst({
    where: { id: parsed.data.questionRecordId, featureId: id, status: "open" },
  });
  if (!qRow) {
    return NextResponse.json({ error: "Question record not found" }, { status: 404 });
  }

  const feature = await prisma.feature.findUniqueOrThrow({ where: { id } });
  const cp = parseContextPack(feature.contextPack);
  const { contextPatch, designPatch } = mergeAnswersIntoStores(cp, parsed.data.answers);

  await prisma.$transaction([
    prisma.agentQuestion.update({
      where: { id: qRow.id },
      data: {
        status: "answered",
        answers: parsed.data.answers as object,
      },
    }),
    prisma.feature.update({
      where: { id },
      data: {
        contextPack: contextPatch,
        status: "idle",
      },
    }),
    prisma.designInputs.upsert({
      where: { featureId: id },
      create: {
        featureId: id,
        ...designPatch,
      },
      update: designPatch,
    }),
  ]);

  const updated = await prisma.feature.findUniqueOrThrow({ where: { id } });
  const enriched = enrichContextPackFromFeature(parseContextPack(updated.contextPack), {
    title: updated.title,
    description: updated.description ?? "",
  });
  const contextComplete =
    !!enriched.productArea?.trim() &&
    !!enriched.targetAudience?.trim() &&
    !!enriched.primaryKpi?.trim();

  if (contextComplete) {
    void executeFeatureRun({ featureId: id, stage: updated.stage }).catch((e) => {
      console.error("[answer] auto re-run after structured answers failed", e);
    });
  }

  return NextResponse.json({ ok: true, feature: updated, resumed: contextComplete });
}
