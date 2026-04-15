import type { KnowledgeCategory, KnowledgeEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listKnowledgeEntries(options?: {
  category?: KnowledgeCategory;
  q?: string;
}): Promise<KnowledgeEntry[]> {
  const { category, q } = options ?? {};
  return prisma.knowledgeEntry.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
}

export async function listKnowledgeEntriesSafe(options?: {
  category?: KnowledgeCategory;
  q?: string;
}): Promise<{ entries: KnowledgeEntry[]; databaseAvailable: boolean }> {
  try {
    const entries = await listKnowledgeEntries(options);
    return { entries, databaseAvailable: true };
  } catch {
    return { entries: [], databaseAvailable: false };
  }
}
