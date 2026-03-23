import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listFeatures } from "@/lib/data/features";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  contextPack: z.record(z.unknown()).optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const stageRaw = searchParams.get("stage");
  const stage =
    stageRaw && (Object.values(FeatureStage) as string[]).includes(stageRaw)
      ? (stageRaw as FeatureStage)
      : undefined;
  const rows = await listFeatures({ q, stage });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const f = await prisma.feature.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      ...(parsed.data.contextPack !== undefined && {
        contextPack: parsed.data.contextPack as Prisma.InputJsonValue,
      }),
      stage: "INBOX",
      status: "idle",
    },
  });
  await prisma.designInputs.create({ data: { featureId: f.id } });
  return NextResponse.json(f);
}
