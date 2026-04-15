import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { KnowledgeCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sanitizeKnowledgeMeta } from "@/lib/domain/knowledge-meta";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  body: z.string().optional(),
  category: z.nativeEnum(KnowledgeCategory).optional(),
  meta: z.record(z.unknown()).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  let metaJson: Prisma.InputJsonValue | undefined;
  if (p.meta !== undefined) {
    const rawMeta =
      typeof p.meta === "object" && p.meta !== null
        ? { ...(p.meta as Record<string, unknown>) }
        : {};
    const sanitized = sanitizeKnowledgeMeta(rawMeta);
    if (!sanitized.ok) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    metaJson = sanitized.meta as Prisma.InputJsonValue;
  }

  try {
    const row = await prisma.knowledgeEntry.update({
      where: { id },
      data: {
        ...(p.title !== undefined ? { title: p.title } : {}),
        ...(p.summary !== undefined ? { summary: p.summary } : {}),
        ...(p.body !== undefined ? { body: p.body } : {}),
        ...(p.category !== undefined ? { category: p.category } : {}),
        ...(metaJson !== undefined ? { meta: metaJson } : {}),
      },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await prisma.knowledgeEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 404 });
  }
}
