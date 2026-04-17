import { prisma } from "@/lib/prisma";
import { getJourneyTrackingCounts } from "@/lib/data/journey-tracking";
import { latestArtifactByType } from "@/lib/artifact-utils";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

export type PerformanceSnapshot = {
  featureId: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  daysSinceDeployed: number | null;
  hypothesis: string | null;
  hypothesisKpi: string | null;
  expectedLiftPercent: number | null;
  expectedLiftMetric: string | null;
  valueScore: number | null;
  primaryKpi: string | null;
};

export async function buildPerformanceSnapshot(
  featureId: string,
): Promise<PerformanceSnapshot> {
  const feature = await prisma.feature.findUniqueOrThrow({
    where: { id: featureId },
    include: { artifacts: true },
  });

  const counts = await getJourneyTrackingCounts([featureId]);
  const metrics = counts.get(featureId) ?? { clicks: 0, impressions: 0 };
  const ctr =
    metrics.impressions > 0
      ? Math.round((metrics.clicks / metrics.impressions) * 10000) / 100
      : null;

  const daysSinceDeployed = feature.deployedAt
    ? Math.floor((Date.now() - feature.deployedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const latest = latestArtifactByType(feature.artifacts);
  const valueArt = latest.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  const valueJson =
    valueArt?.contentJson && typeof valueArt.contentJson === "object"
      ? (valueArt.contentJson as Record<string, unknown>)
      : null;

  const prdArt = latest.get(ARTIFACT_TYPES.PRD);
  const prdJson =
    prdArt?.contentJson && typeof prdArt.contentJson === "object"
      ? (prdArt.contentJson as Record<string, unknown>)
      : null;

  return {
    featureId,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    ctr,
    daysSinceDeployed,
    hypothesis: feature.hypothesis,
    hypothesisKpi: feature.hypothesisKpi,
    expectedLiftPercent: feature.roadmapExpectedLiftPercent,
    expectedLiftMetric: feature.roadmapExpectedLiftMetric,
    valueScore: typeof valueJson?.businessScore === "number" ? valueJson.businessScore as number : feature.score,
    primaryKpi:
      feature.hypothesisKpi ??
      (typeof prdJson?.primaryKpi === "string" ? prdJson.primaryKpi : null) ??
      (typeof valueJson?.primaryKpi === "string" ? valueJson.primaryKpi : null),
  };
}

export function verdictFromMetrics(snapshot: PerformanceSnapshot): string {
  if (snapshot.impressions === 0) return "no_data";
  if (snapshot.ctr !== null && snapshot.ctr < 0.5) return "underperforming";
  if (snapshot.ctr !== null && snapshot.ctr > 5) return "strong";
  if (snapshot.ctr !== null && snapshot.ctr > 2) return "on_track";
  return "needs_attention";
}

export const VERDICT_LABEL: Record<string, string> = {
  no_data: "No data yet",
  underperforming: "Underperforming",
  needs_attention: "Needs attention",
  on_track: "On track",
  strong: "Strong performance",
};

export const VERDICT_COLOR: Record<string, string> = {
  no_data: "text-muted-foreground",
  underperforming: "text-red-500",
  needs_attention: "text-amber-500",
  on_track: "text-blue-500",
  strong: "text-emerald-500",
};
