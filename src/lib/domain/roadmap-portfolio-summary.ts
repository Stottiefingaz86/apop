import type { RoadmapFeatureRow } from "@/lib/data/features";
import { averageValueScore, roadmapValueOutlook } from "@/lib/domain/roadmap-value";

export type PortfolioValueSummary = {
  headline: string;
  detail: string;
};

/**
 * High-level copy for the roadmap header — blends explicit lift fields with artifact KPIs / scores.
 * Everything is explicitly directional, not booked revenue.
 */
export function buildPortfolioValueSummary(rows: RoadmapFeatureRow[]): PortfolioValueSummary {
  if (rows.length === 0) {
    return { headline: "", detail: "" };
  }

  const withLift = rows.filter(
    (r) =>
      r.roadmapExpectedLiftPercent != null &&
      Number.isFinite(r.roadmapExpectedLiftPercent) &&
      r.roadmapExpectedLiftMetric?.trim(),
  );

  if (withLift.length >= 1) {
    const avg =
      Math.round(
        (withLift.reduce((a, r) => a + (r.roadmapExpectedLiftPercent ?? 0), 0) / withLift.length) * 10,
      ) / 10;
    const metrics = [...new Set(withLift.map((r) => r.roadmapExpectedLiftMetric!.trim()))];
    const metricPhrase =
      metrics.length === 1
        ? metrics[0]!
        : `${metrics.slice(0, 3).join(", ")}${metrics.length > 3 ? ", …" : ""}`;
    return {
      headline: `Across initiatives with explicit targets, modeled expectation averages about ${avg}% improvement on ${metricPhrase}.`,
      detail: `Based on ${withLift.length} item${withLift.length === 1 ? "" : "s"} with both a % and a metric set on the feature Roadmap block. Directional planning only — not a forecast.`,
    };
  }

  const kpis = new Set<string>();
  for (const r of rows) {
    const k = roadmapValueOutlook(r.artifacts).kpi;
    if (k?.trim()) kpis.add(k.trim());
  }
  const avgScore = averageValueScore(rows);

  if (kpis.size > 0 && avgScore != null) {
    return {
      headline: `Across ${rows.length} roadmap item${rows.length === 1 ? "" : "s"}, average value analyst score is ${avgScore}/10.`,
      detail: `KPI themes from value / PRD artifacts: ${[...kpis].slice(0, 5).join("; ")}${kpis.size > 5 ? "…" : ""}. Add expected % and target metric on each feature for a combined lift line.`,
    };
  }

  if (avgScore != null) {
    return {
      headline: `Average directional value score: ${avgScore}/10 across ${rows.length} item${rows.length === 1 ? "" : "s"}.`,
      detail: "Set lane, cost, and expected lift (% + metric) on each feature to build a portfolio-level lift story.",
    };
  }

  return {
    headline: `${rows.length} initiative${rows.length === 1 ? "" : "s"} on the roadmap.`,
    detail: "Run value analysis and fill the Roadmap block on each feature (lane, cost, expected % and KPI) for cost / lift visibility.",
  };
}
