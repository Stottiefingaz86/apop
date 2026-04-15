import { OCTALYSIS_DRIVES } from "@/lib/domain/octalysis";

export type ParsedValueAnalysis = {
  summary: string;
  audience: string;
  primaryKpi: string;
  secondaryKpis?: string[];
  strategicPriority?: string | null;
  constraints?: string | null;
  businessScore: number;
  note?: string;
  competitorAnalysis?: string | null;
  effortEstimate?: string | null;
  riceScore?: { reach: number; impact: number; confidence: number; effort: number } | null;
  valueRationale?: string | null;
};

export function buildValueAnalysisMarkdown(
  p: ParsedValueAnalysis,
  octalysisProfile: Record<string, number>,
  apiFooter: string,
): string {
  const rice = p.riceScore;
  const ricePriority =
    rice && rice.effort > 0
      ? ((rice.reach * rice.impact * rice.confidence) / rice.effort).toFixed(1)
      : null;

  const sections: string[] = [
    `## Value analysis`,
    ``,
    p.summary,
    ``,
    `**Audience:** ${p.audience}`,
    `**Primary outcome / KPI:** ${p.primaryKpi}`,
    p.secondaryKpis?.length
      ? `**Secondary KPIs:** ${p.secondaryKpis.join(", ")}`
      : "",
    `**Business score:** ${p.businessScore} / 10`,
    ``,
    "### Behavioral drivers (inferred from the idea)",
    ``,
    "| Drive | Weight |",
    "|---|---:|",
    ...OCTALYSIS_DRIVES.map((d) => `| ${d.replace(/_/g, " ")} | ${octalysisProfile[d]} |`),
    ``,
    "_Weights are inferred from the feature description and context._",
  ];

  if (p.competitorAnalysis?.trim()) {
    sections.push(``, `### Competitor analysis`, ``, p.competitorAnalysis.trim());
  }

  if (p.effortEstimate?.trim()) {
    sections.push(``, `### Effort estimate`, ``, p.effortEstimate.trim());
  }

  if (rice && ricePriority) {
    sections.push(
      ``,
      `### RICE score`,
      ``,
      `| Reach | Impact | Confidence | Effort | Priority |`,
      `|---|---:|---:|---:|---:|`,
      `| ${rice.reach} | ${rice.impact} | ${(rice.confidence * 100).toFixed(0)}% | ${rice.effort} | ${ricePriority} |`,
      ``,
      `_Higher R×I×C and lower Effort = higher priority._`,
    );
  }

  if (p.valueRationale?.trim()) {
    sections.push(``, `### Implications`, ``, p.valueRationale.trim());
  }

  return sections.filter(Boolean).join("\n") + apiFooter;
}
