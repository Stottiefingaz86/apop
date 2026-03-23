import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  tokenJson: z.unknown().optional(),
  figmaUrl: z.string().optional().nullable(),
  competitorUrls: z.array(z.string()).optional(),
  screenshots: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  brandDescription: z.string().optional().nullable(),
  uxDirection: z.string().optional().nullable(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.feature.findUniqueOrThrow({ where: { id } });

  const { tokenJson, ...rest } = parsed.data;
  const jsonFields: Pick<Prisma.DesignInputsUpdateInput, "tokenJson"> = {};
  if (tokenJson !== undefined) {
    jsonFields.tokenJson = tokenJson as Prisma.InputJsonValue;
  }

  const row = await prisma.designInputs.upsert({
    where: { featureId: id },
    create: { featureId: id, ...rest, ...jsonFields },
    update: { ...rest, ...jsonFields },
  });

  return NextResponse.json(row);
}
