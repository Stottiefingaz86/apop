import type { RoadmapFeatureRow } from "@/lib/data/features";

export type RoadmapImpact = {
  /** True when the feature is live on production (has a "ready" release or a deployedAt date). */
  isLive: boolean;
  /** True when we have at least one real interaction metric from site-apop. */
  hasMetrics: boolean;
  impressions: number;
  clicks: number;
  /** Click-through rate as a 0..1 fraction, or null if we can't compute one. */
  ctr: number | null;
  /** Expected lift percent from roadmap economics (e.g. 8 = 8%). */
  expectedLiftPercent: number | null;
  /** Human label for the KPI we were trying to move. */
  expectedLiftMetric: string | null;
  /** Verdict string from the latest PerformanceInsight `review` row (e.g. "Positive", "Negative", "Needs iteration"). */
  verdict: string | null;
  /** One-line summary from the latest review. */
  verdictSummary: string | null;
  /** ISO string of when the latest snapshot / review was taken. */
  lastReviewAt: string | null;
  /** Simple traffic-light tone derived from verdict + metrics (for UI chips). */
  tone: "positive" | "neutral" | "negative" | "unknown";
};

function toneFromVerdict(verdict: string | null, hasMetrics: boolean): RoadmapImpact["tone"] {
  if (!verdict) return hasMetrics ? "neutral" : "unknown";
  const v = verdict.toLowerCase();
  if (/(positive|on[- ]track|beat|success|strong)/.test(v)) return "positive";
  if (/(negative|regress|drop|worse|hurt|harm|decline|below)/.test(v)) return "negative";
  if (/(needs|iterate|mixed|flat|watch|monitor|unclear)/.test(v)) return "neutral";
  return "neutral";
}

/**
 * Derive a simple "live impact" object for a roadmap card.
 *
 * This intentionally does not hit the LLM — it just summarises whatever the
 * PerformanceInsight / tracking pipeline has already produced. The UI uses it
 * to show hypothesis vs. actual at a glance on every card.
 */
export function roadmapImpactFromFeature(
  f: Pick<
    RoadmapFeatureRow,
    | "releases"
    | "deployedAt"
    | "roadmapExpectedLiftPercent"
    | "roadmapExpectedLiftMetric"
    | "performanceInsights"
  >,
  tracking?: { impressions: number; clicks: number },
): RoadmapImpact {
  const deployed =
    f.deployedAt != null ||
    (f.releases ?? []).some((r) => r.status === "ready" && !!r.vercelUrl?.trim());

  const review =
    (f.performanceInsights ?? []).find((p) => p.kind === "review") ?? null;
  const snapshot =
    (f.performanceInsights ?? []).find((p) => p.kind === "snapshot") ?? null;

  const impressions =
    tracking?.impressions ??
    snapshot?.impressions ??
    review?.impressions ??
    0;
  const clicks = tracking?.clicks ?? snapshot?.clicks ?? review?.clicks ?? 0;
  const ctr =
    impressions > 0
      ? clicks / impressions
      : typeof review?.ctr === "number"
        ? review.ctr
        : typeof snapshot?.ctr === "number"
          ? snapshot.ctr
          : null;

  const expectedLiftPercent =
    typeof f.roadmapExpectedLiftPercent === "number" &&
    Number.isFinite(f.roadmapExpectedLiftPercent)
      ? f.roadmapExpectedLiftPercent
      : null;
  const expectedLiftMetric = f.roadmapExpectedLiftMetric?.trim() || null;

  const verdict = review?.verdict?.trim() || null;
  const verdictSummary = review?.summary?.trim() || null;

  const hasMetrics = impressions > 0 || clicks > 0;
  const tone = toneFromVerdict(verdict, hasMetrics);

  const lastReviewAt =
    review?.createdAt instanceof Date
      ? review.createdAt.toISOString()
      : snapshot?.createdAt instanceof Date
        ? snapshot.createdAt.toISOString()
        : null;

  return {
    isLive: deployed,
    hasMetrics,
    impressions,
    clicks,
    ctr,
    expectedLiftPercent,
    expectedLiftMetric,
    verdict,
    verdictSummary,
    lastReviewAt,
    tone,
  };
}

export function formatCtr(ctr: number | null): string {
  if (ctr == null || !Number.isFinite(ctr)) return "—";
  return `${(ctr * 100).toFixed(ctr >= 0.1 ? 1 : 2)}%`;
}
