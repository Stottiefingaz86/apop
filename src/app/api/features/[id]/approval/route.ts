import { NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalRecordStatus, FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  const f = await prisma.feature.update({
    where: { id },
    data: {
      status: approved ? "approved" : rejected ? "rejected" : "awaiting_review",
      ...(rejected ? { stage: "REJECTED" } : {}),
    },
  });

  return NextResponse.json({ feature: f });
}
