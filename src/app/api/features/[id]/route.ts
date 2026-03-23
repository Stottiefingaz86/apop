import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  contextPack: z.record(z.unknown()).optional(),
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
    const { contextPack, ...rest } = parsed.data;
    const f = await prisma.feature.update({
      where: { id },
      data: {
        ...rest,
        ...(contextPack !== undefined && {
          contextPack: contextPack as Prisma.InputJsonValue,
        }),
      },
    });
    return NextResponse.json(f);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
