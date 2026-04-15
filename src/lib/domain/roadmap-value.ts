import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

type ArtifactSlice = {
  type: string;
  contentJson: unknown;
  version: number;
};

function latestOfType(rows: ArtifactSlice[], type: string): ArtifactSlice | null {
  const matches = rows.filter((r) => r.type === type);
  if (!matches.length) return null;
  return matches.reduce((a, b) => (a.version >= b.version ? a : b));
}

export type RoadmapValueOutlook = {
  valueScore: number | null;
  kpi: string | null;
  hypothesis: string | null;
  hypothesisSource: "prd" | "value" | null;
};

/**
 * Pulls directional “why this is on the roadmap” copy from stored artifacts.
 * Not a financial model — qualitative + value analyst score when present.
 */
export function roadmapValueOutlook(artifacts: ArtifactSlice[]): RoadmapValueOutlook {
  const value = latestOfType(artifacts, ARTIFACT_TYPES.VALUE_ANALYSIS);
  const prd = latestOfType(artifacts, ARTIFACT_TYPES.PRD);

  const vj =
    value?.contentJson && typeof value.contentJson === "object"
      ? (value.contentJson as Record<string, unknown>)
      : null;
  const pj =
    prd?.contentJson && typeof prd.contentJson === "object"
      ? (prd.contentJson as Record<string, unknown>)
      : null;

  const valueScore =
    typeof vj?.businessScore === "number" ? (vj.businessScore as number) : null;

  let kpi: string | null =
    typeof vj?.primaryKpi === "string" ? (vj.primaryKpi as string) : null;
  if (!kpi && pj?.goals && typeof pj.goals === "object") {
    const g = pj.goals as Record<string, unknown>;
    if (typeof g.primaryKpi === "string") kpi = g.primaryKpi;
  }

  const prdHyp =
    typeof pj?.valueHypothesis === "string" ? (pj.valueHypothesis as string) : null;
  const valSummary = typeof vj?.summary === "string" ? (vj.summary as string) : null;

  const hypothesis = prdHyp?.trim() || valSummary?.trim() || null;
  const hypothesisSource: "prd" | "value" | null = prdHyp?.trim()
    ? "prd"
    : valSummary?.trim()
      ? "value"
      : null;

  return { valueScore, kpi, hypothesis, hypothesisSource };
}

export function averageValueScore(rows: { artifacts: ArtifactSlice[] }[]): number | null {
  const scores = rows
    .map((r) => roadmapValueOutlook(r.artifacts).valueScore)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}
