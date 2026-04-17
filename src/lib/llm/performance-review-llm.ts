import type { PerformanceSnapshot } from "@/lib/domain/performance-review";

export type PerformanceReviewResult = {
  verdict: string;
  summary: string;
  recommendations: string[];
  hypothesisValidation: string;
  suggestedNextSteps: string[];
  shouldIterate: boolean;
  iterationBrief: string | null;
};

const SYSTEM_PROMPT = `You are a product analytics advisor for a sports betting / casino platform.
You receive post-launch performance data for a feature and must assess whether the original hypothesis was validated.

Be direct. Use data to justify your assessment. If the feature is underperforming, say so clearly and suggest specific actions.
If there's not enough data yet, say that — don't guess.

Return valid JSON matching this schema:
{
  "verdict": "strong" | "on_track" | "needs_attention" | "underperforming" | "no_data",
  "summary": "2-3 sentence executive summary of performance vs hypothesis",
  "recommendations": ["specific action 1", "specific action 2", ...],
  "hypothesisValidation": "Was the hypothesis validated? Why or why not? Reference the numbers.",
  "suggestedNextSteps": ["next step 1", "next step 2"],
  "shouldIterate": true/false,
  "iterationBrief": "If shouldIterate, a 2-sentence brief for the next PRD iteration. Null if not needed."
}`;

function buildUserPrompt(snapshot: PerformanceSnapshot, featureTitle: string, prdSummary: string | null): string {
  const parts = [
    `## Feature: ${featureTitle}`,
    "",
    "### Pre-launch hypothesis",
    snapshot.hypothesis || "(none recorded)",
    snapshot.hypothesisKpi ? `KPI: ${snapshot.hypothesisKpi}` : "",
    snapshot.expectedLiftPercent != null ? `Expected lift: ${snapshot.expectedLiftPercent}%` : "",
    snapshot.expectedLiftMetric ? `Lift metric: ${snapshot.expectedLiftMetric}` : "",
    snapshot.valueScore != null ? `Value analyst score: ${snapshot.valueScore}/10` : "",
    snapshot.primaryKpi ? `Primary KPI: ${snapshot.primaryKpi}` : "",
    "",
    "### Post-launch actuals",
    `Days since deployed: ${snapshot.daysSinceDeployed ?? "unknown"}`,
    `Impressions: ${snapshot.impressions.toLocaleString()}`,
    `Clicks: ${snapshot.clicks.toLocaleString()}`,
    snapshot.ctr != null ? `CTR: ${snapshot.ctr}%` : "CTR: n/a (no impressions)",
    "",
  ];

  if (prdSummary) {
    parts.push("### PRD context (abbreviated)", prdSummary.slice(0, 2000), "");
  }

  parts.push(
    "### Instructions",
    "Assess whether the feature is meeting its hypothesis. Provide actionable recommendations.",
    "If the feature is hurting a journey (low CTR, high impressions but no engagement), flag that clearly.",
    "If iteration would help, write a brief for the next PRD cycle.",
  );

  return parts.filter(Boolean).join("\n");
}

export async function generatePerformanceReview(
  snapshot: PerformanceSnapshot,
  featureTitle: string,
  prdSummary: string | null,
): Promise<PerformanceReviewResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return heuristicReview(snapshot);
  }

  const userPrompt = buildUserPrompt(snapshot, featureTitle, prdSummary);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("[performance-review-llm] OpenAI error", res.status);
      return heuristicReview(snapshot);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = JSON.parse(json.choices[0].message.content) as PerformanceReviewResult;
    return {
      verdict: raw.verdict || "needs_attention",
      summary: raw.summary || "",
      recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
      hypothesisValidation: raw.hypothesisValidation || "",
      suggestedNextSteps: Array.isArray(raw.suggestedNextSteps) ? raw.suggestedNextSteps : [],
      shouldIterate: !!raw.shouldIterate,
      iterationBrief: raw.iterationBrief || null,
    };
  } catch (e) {
    console.error("[performance-review-llm] failed", e);
    return heuristicReview(snapshot);
  }
}

function heuristicReview(snapshot: PerformanceSnapshot): PerformanceReviewResult {
  if (snapshot.impressions === 0) {
    return {
      verdict: "no_data",
      summary: "No journey tracking data has been recorded yet. The feature may not have tracking instrumented, or it hasn't received any traffic since deployment.",
      recommendations: [
        "Verify data-apop-feature-id is set on the feature's root element",
        "Check that the journey map tracking script is loaded on the page",
        "Wait for sufficient traffic before drawing conclusions",
      ],
      hypothesisValidation: "Cannot validate — no data available.",
      suggestedNextSteps: ["Instrument tracking if missing", "Check back after 7 days of traffic"],
      shouldIterate: false,
      iterationBrief: null,
    };
  }

  const ctr = snapshot.ctr ?? 0;
  const verdict = ctr < 0.5 ? "underperforming" : ctr > 5 ? "strong" : ctr > 2 ? "on_track" : "needs_attention";

  const recs: string[] = [];
  if (ctr < 1) {
    recs.push("Review feature placement — high impressions but low clicks suggests poor positioning or unclear CTA");
    recs.push("A/B test the call-to-action copy and visual treatment");
  }
  if (ctr > 5) {
    recs.push("Feature is performing well — consider expanding to more surfaces");
  }
  recs.push("Compare CTR against similar features in the same journey");

  return {
    verdict,
    summary: `Feature has ${snapshot.impressions.toLocaleString()} impressions and ${snapshot.clicks.toLocaleString()} clicks (${ctr}% CTR) over ${snapshot.daysSinceDeployed ?? "?"} days.` +
      (snapshot.expectedLiftPercent != null
        ? ` Expected lift was ${snapshot.expectedLiftPercent}%.`
        : ""),
    recommendations: recs,
    hypothesisValidation: snapshot.hypothesis
      ? `Hypothesis: "${snapshot.hypothesis}". ${ctr > 2 ? "Appears to be validated based on engagement." : "Not yet validated — engagement is below expectations."}`
      : "No hypothesis was recorded pre-launch.",
    suggestedNextSteps: ctr < 2
      ? ["Iterate on the feature with updated requirements", "Run A/B test with alternative design"]
      : ["Monitor for another 2 weeks", "Expand to additional journeys if stable"],
    shouldIterate: ctr < 1.5,
    iterationBrief: ctr < 1.5
      ? `The feature is underperforming (${ctr}% CTR). Revisit the PRD with focus on improving discoverability and engagement — the current placement/design isn't driving clicks.`
      : null,
  };
}
