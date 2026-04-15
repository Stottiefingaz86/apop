import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { KnowledgeCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { listKnowledgeEntries } from "@/lib/data/knowledge";
import { buildAttachmentExtractFromUploads } from "@/lib/domain/knowledge-extract";
import { validateKnowledgeAttachments } from "@/lib/domain/knowledge-attachment-limits";
import { sanitizeKnowledgeMeta } from "@/lib/domain/knowledge-meta";

const attachmentSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  dataBase64: z.string().min(1),
});

const createSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().default(""),
  category: z.nativeEnum(KnowledgeCategory).optional(),
  meta: z.record(z.unknown()).optional(),
  attachments: z.array(attachmentSchema).max(2).optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const catRaw = searchParams.get("category");
  const category =
    catRaw && (Object.values(KnowledgeCategory) as string[]).includes(catRaw)
      ? (catRaw as KnowledgeCategory)
      : undefined;
  try {
    const rows = await listKnowledgeEntries({ q, category });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const att = parsed.data.attachments;
  const attOk = validateKnowledgeAttachments(att);
  if (!attOk.ok) {
    return NextResponse.json({ error: attOk.error }, { status: 400 });
  }

  const rawMeta =
    typeof parsed.data.meta === "object" && parsed.data.meta !== null
      ? { ...(parsed.data.meta as Record<string, unknown>) }
      : {};

  const sanitized = sanitizeKnowledgeMeta(rawMeta);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }
  const metaBase = sanitized.meta;

  let attachmentExtract: string | null = null;
  if (att?.length) {
    const built = await buildAttachmentExtractFromUploads(att);
    if (built.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    attachmentExtract = built.extract;
    if (built.fileMeta.length) {
      metaBase.files = built.fileMeta;
    }
  }

  try {
    const row = await prisma.knowledgeEntry.create({
      data: {
        title: parsed.data.title,
        summary: parsed.data.summary?.trim() || null,
        body: parsed.data.body ?? "",
        category: parsed.data.category ?? "OTHER",
        meta: metaBase as Prisma.InputJsonValue,
        attachmentExtract,
      },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Could not save entry" }, { status: 503 });
  }
}
