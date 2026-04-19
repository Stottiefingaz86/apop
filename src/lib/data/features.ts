import type { Artifact, Feature, FeatureStage, PerformanceInsight, Release } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { PipelineListFeature } from "@/lib/domain/pipeline-card-state";

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

/** UI-first local dev: empty list when Postgres is not running or `DATABASE_URL` is unset. */
export async function listFeaturesSafe(options: {
  q?: string;
  stage?: FeatureStage;
}): Promise<{ features: Feature[]; databaseAvailable: boolean }> {
  try {
    const features = await listFeatures(options);
    return { features, databaseAvailable: true };
  } catch {
    return { features: [], databaseAvailable: false };
  }
}

/** Pipeline Kanban: open questions + latest run (for failure hints). */
export async function listPipelineFeatures(options: {
  q?: string;
  stage?: FeatureStage;
}): Promise<PipelineListFeature[]> {
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
    include: {
      agentQuestions: {
        where: { status: "open" },
        orderBy: { createdAt: "asc" },
      },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          events: { orderBy: { timestamp: "desc" }, take: 1 },
        },
      },
      cursorAgentJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      artifacts: {
        where: {
          type: {
            in: [
              ARTIFACT_TYPES.VALUE_ANALYSIS,
              ARTIFACT_TYPES.PRD,
              ARTIFACT_TYPES.DESIGN_SPEC,
            ],
          },
        },
        orderBy: { version: "desc" },
        take: 24,
      },
      releases: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

export async function listPipelineFeaturesSafe(options: {
  q?: string;
  stage?: FeatureStage;
}): Promise<{ features: PipelineListFeature[]; databaseAvailable: boolean }> {
  try {
    const features = await listPipelineFeatures(options);
    return { features, databaseAvailable: true };
  } catch {
    return { features: [], databaseAvailable: false };
  }
}

export async function getFeatureById(id: string) {
  return prisma.feature.findUnique({
    where: { id },
    include: {
      artifacts: { orderBy: [{ type: "asc" }, { version: "desc" }] },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 25,
        include: { events: { orderBy: { timestamp: "asc" } } },
      },
      agentQuestions: { orderBy: { createdAt: "desc" }, take: 10 },
      designInputs: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 20 },
      releases: { orderBy: { createdAt: "desc" }, take: 15 },
      cursorAgentJobs: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
}

export async function getFeatureByIdSafe(id: string) {
  try {
    const data = await getFeatureById(id);
    return { data, databaseAvailable: true as const };
  } catch {
    return { data: null, databaseAvailable: false as const };
  }
}

export type RoadmapFeatureRow = Feature & {
  releases: Pick<Release, "id" | "status" | "vercelUrl" | "createdAt">[];
  /** Value + PRD slices for roadmap (filtered in query) */
  artifacts: Pick<Artifact, "type" | "contentJson" | "version">[];
  /** Latest review + latest snapshot from post-launch performance loop */
  performanceInsights: Pick<
    PerformanceInsight,
    "id" | "kind" | "verdict" | "summary" | "recommendations" | "impressions" | "clicks" | "ctr" | "expectedLiftPercent" | "expectedLiftMetric" | "createdAt"
  >[];
};

/**
 * Full product roadmap: every feature except rejected (in-flight, done, and shipped all stay visible).
 */
export async function listRoadmapFeatures(): Promise<RoadmapFeatureRow[]> {
  return prisma.feature.findMany({
    where: { stage: { not: "REJECTED" } },
    include: {
      releases: {
        select: { id: true, status: true, vercelUrl: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      artifacts: {
        where: {
          type: { in: [ARTIFACT_TYPES.VALUE_ANALYSIS, ARTIFACT_TYPES.PRD] },
        },
        orderBy: [{ type: "asc" }, { version: "desc" }],
        take: 12,
        select: { type: true, contentJson: true, version: true },
      },
      performanceInsights: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          kind: true,
          verdict: true,
          summary: true,
          recommendations: true,
          impressions: true,
          clicks: true,
          ctr: true,
          expectedLiftPercent: true,
          expectedLiftMetric: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
}

export async function listRoadmapFeaturesSafe(): Promise<{
  features: RoadmapFeatureRow[];
  databaseAvailable: boolean;
}> {
  try {
    const features = await listRoadmapFeatures();
    return { features, databaseAvailable: true };
  } catch {
    return { features: [], databaseAvailable: false };
  }
}
