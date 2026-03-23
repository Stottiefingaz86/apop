import type { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listFeatures(options: { q?: string; stage?: FeatureStage }) {
  const { q, stage } = options;
  return prisma.feature.findMany({
    where: {
      ...(stage ? { stage } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function getFeatureById(id: string) {
  return prisma.feature.findUnique({
    where: { id },
    include: {
      artifacts: { orderBy: [{ type: "asc" }, { version: "desc" }] },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 15,
        include: { events: { orderBy: { timestamp: "asc" } } },
      },
      agentQuestions: { orderBy: { createdAt: "desc" }, take: 10 },
      designInputs: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}
