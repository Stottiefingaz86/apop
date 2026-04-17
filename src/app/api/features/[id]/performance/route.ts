import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPerformanceSnapshot } from "@/lib/domain/performance-review";
import { generatePerformanceReview } from "@/lib/llm/performance-review-llm";
import { latestArtifactByType } from "@/lib/artifact-utils";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const feature = await prisma.feature.findUnique({
    where: { id },
    include: { performanceInsights: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await buildPerformanceSnapshot(id);

  return NextResponse.json({
    snapshot,
    insights: feature.performanceInsights,
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const feature = await prisma.feature.findUnique({
    where: { id },
    include: { artifacts: true },
  });
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await buildPerformanceSnapshot(id);

  const latest = latestArtifactByType(feature.artifacts);
  const prdArt = latest.get(ARTIFACT_TYPES.PRD);
  const prdSummary = prdArt?.contentMarkdown?.slice(0, 3000) ?? null;

  const review = await generatePerformanceReview(snapshot, feature.title, prdSummary);

  const insight = await prisma.performanceInsight.create({
    data: {
      featureId: id,
      kind: "review",
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      ctr: snapshot.ctr,
      expectedLiftPercent: snapshot.expectedLiftPercent,
      expectedLiftMetric: snapshot.expectedLiftMetric,
      verdict: review.verdict,
      summary: review.summary,
      recommendations: review.recommendations.join("\n"),
      contentJson: review as object,
    },
  });

  return NextResponse.json({ insight, snapshot, review });
}
