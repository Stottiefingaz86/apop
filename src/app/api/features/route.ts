import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaErrorToHttpResponse } from "@/lib/prisma-http-error";
import { listFeatures } from "@/lib/data/features";
import { parseContextPack } from "@/lib/domain/context-pack";
import { enrichContextPackFromFeature } from "@/lib/domain/context-pack-inference";
import { extractContextPackAttachments } from "@/lib/domain/context-pack-api";
import { validateFeatureAttachments } from "@/lib/domain/feature-attachments";

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
  const extracted = extractContextPackAttachments(parsed.data.contextPack ?? {});
  if (extracted.attachmentError) {
    return NextResponse.json({ error: extracted.attachmentError }, { status: 400 });
  }
  const basePack = parseContextPack(extracted.clean);
  const mergedPack = enrichContextPackFromFeature(basePack, {
    title: parsed.data.title,
    description: parsed.data.description ?? "",
  });
  const withAttachments = {
    ...mergedPack,
    ...(extracted.referenceImages?.length ? { referenceImages: extracted.referenceImages } : {}),
    ...(extracted.referencePrdPdf ? { referencePrdPdf: extracted.referencePrdPdf } : {}),
  };
  const attOk = validateFeatureAttachments({
    referenceImages: withAttachments.referenceImages,
    referencePrdPdf: withAttachments.referencePrdPdf,
  });
  if (!attOk.ok) {
    return NextResponse.json({ error: attOk.error }, { status: 400 });
  }

  try {
    const f = await prisma.feature.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? "",
        contextPack: withAttachments as Prisma.InputJsonValue,
        stage: "INBOX",
        status: "idle",
      },
    });
    await prisma.designInputs.create({ data: { featureId: f.id } });

    const after = await prisma.feature.findUnique({ where: { id: f.id } });
    return NextResponse.json(after ?? f);
  } catch (e) {
    console.error("[features/POST]", e);
    const mapped = prismaErrorToHttpResponse(e);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json(
      { error: "Could not create feature. Check the server terminal for details." },
      { status: 500 },
    );
  }
}
