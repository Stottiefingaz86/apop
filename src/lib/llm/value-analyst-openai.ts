import OpenAI from "openai";
import { z } from "zod";
import type { AgentContext } from "@/agents/types";
import { competitiveLandscapeBriefForLlm } from "@/lib/domain/competitive-landscape";
import { OCTALYSIS_DRIVES } from "@/lib/domain/octalysis";
import { buildValueAnalysisMarkdown } from "@/lib/llm/value-analyst-markdown";
import { contextPackForLlmJson, referenceImagesForVision } from "@/lib/llm/context-pack-llm";

const riceSchema = z.object({
  reach: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  effort: z.number().min(1).max(10),
});

const responseSchema = z.object({
  summary: z.string(),
  audience: z.string(),
  primaryKpi: z.string(),
  secondaryKpis: z.array(z.string()).optional().default([]),
  strategicPriority: z.string().nullable().optional(),
  constraints: z.string().nullable().optional(),
  businessScore: z.number().min(1).max(10),
  octalysisProfile: z.record(z.string(), z.number()).optional(),
  note: z.string().optional(),
  markdownBody: z.string().optional(),
  competitorAnalysis: z.string().nullable().optional(),
  effortEstimate: z.string().nullable().optional(),
  riceScore: riceSchema.nullable().optional(),
  valueRationale: z.string().nullable().optional(),
});

function normalizeProfile(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of OCTALYSIS_DRIVES) {
    const v = raw?.[d];
    out[d] = typeof v === "number" && v >= 1 && v <= 5 ? Math.round(v) : 2;
  }
  return out;
}

function stripJsonFence(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

/**
 * When `OPENAI_API_KEY` is set, value analysis via OpenAI (ChatGPT-class models).
 * Returns null if no key or call/parse fails (caller tries Anthropic or rules).
 */
export async function runValueAnalysisWithOpenAI(ctx: AgentContext): Promise<{
  contentJson: Record<string, unknown>;
  contentMarkdown: string;
  score: number;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      console.info("[apop] OPENAI_API_KEY is not set — value analyst will try Anthropic, then heuristic.");
    }
    return null;
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const client = new OpenAI({ apiKey });

  const refImages = referenceImagesForVision(ctx.contextPack);
  const payload = {
    featureTitle: ctx.feature.title,
    featureDescription: ctx.feature.description,
    contextPack: contextPackForLlmJson(ctx.contextPack),
    workspaceKnowledgeBrief: ctx.workspaceKnowledgeBrief?.trim() || null,
  };

  const driveList = OCTALYSIS_DRIVES.join(", ");

  const system = `You are a senior product value analyst for consumer and gaming-adjacent products (e.g. sportsbook, casino, loyalty).

Ground rules:
- When workspaceKnowledgeBrief is non-null, treat it as curated org knowledge (KPIs, research, surveys, **reference URLs** to journey maps / dashboards, file extracts, integration notes). Mine it for themes, risks, and opportunities — do not contradict it without noting conflict with the feature idea. When **Reference URL** or **Live fetch** sections appear, weight those behavior and KPI signals in **summary**, **constraints**, and **markdownBody**.
- Use contextPack and feature text as source of truth for audience, stated KPI/outcome, and constraints. Do not invent compliance facts or specific numbers not implied by input.
- Frame business value around impact levers when helpful: revenue, engagement, conversion, and brand trust. The user names a primary outcome/KPI; you may tie analysis to those levers without asking them to label gamification theory.
- Infer octalysisProfile yourself from the idea and context (which motivational patterns this feature leans on). Keys must be EXACTLY: ${driveList}. Integer weights 1-5. The user does NOT need to name Octalysis drives — you derive weights from copy alone. Optional contextPack.octalysisFocus is a legacy hint only; if absent, still produce a full profile.
- Produce **competitorAnalysis**: a focused paragraph comparing this feature to the reference operators (core comps and benchmarks). How do Stake, FanDuel, DraftKings, etc. handle this pattern? What differentiates our approach? Stay qualitative; never invent current offers or odds.
- Produce **effortEstimate**: Cursor will build it; estimate complexity and Cursor build time (e.g. "~20 mins" for simple, "30–45 mins" for moderate, "45–90 mins" for complex). Reflect solution complexity.
- Produce **riceScore** for prioritization: reach 1–10 (users/quarter scale), impact 1–10 (per-user impact), confidence 0–1 (how sure we are), effort 1–10 (person-weeks). Higher R×I×C and lower E = higher priority.
- Produce **valueRationale**: 1–2 sentences on why this will deliver business value (revenue, engagement, conversion, trust).
- **businessScore** must reflect this specific idea’s strength, risk, and clarity — use the full 1-10 range. Do not collapse every feature to the same score; weak or vague ideas should score lower than crisp, high-leverage ones.

${competitiveLandscapeBriefForLlm()}

Respond with ONLY a single JSON object (no markdown fences, no commentary). Required shape:
{
  "summary": string,
  "audience": string (must align with contextPack.targetAudience if present),
  "primaryKpi": string (must align with contextPack.primaryKpi if present — may restate as outcome language),
  "secondaryKpis": string[],
  "strategicPriority": string | null,
  "constraints": string | null,
  "businessScore": number (1-10, your holistic assessment),
  "octalysisProfile": object whose keys are EXACTLY those drives with integer weights 1-5,
  "note": string (brief caveats),
  "markdownBody": string (markdown for humans: include Business score, Behavioral drivers table, Competitor analysis, Effort estimate, RICE score, Implications/value rationale — no outer JSON),
  "competitorAnalysis": string | null (paragraph comparing to reference operators),
  "effortEstimate": string | null (Cursor build time e.g. "~20 mins", "30–45 mins" for complex solutions),
  "riceScore": { "reach": number, "impact": number, "confidence": number, "effort": number } | null,
  "valueRationale": string | null (why this delivers value)
}`;

  const userText =
    `Analyze this feature and context:\n\n${JSON.stringify(payload, null, 2)}` +
    (refImages.length
      ? "\n\nReference screenshots are attached as images immediately after this message."
      : "");

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: userText },
    ...refImages.map(
      (im): OpenAI.Chat.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url: `data:${im.mimeType};base64,${im.dataBase64}`, detail: "auto" },
      }),
    ),
  ];

  try {
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.45,
      response_format: { type: "json_object" },
      max_tokens: 6_000,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const text = resp.choices[0]?.message?.content;
    if (!text) return null;

    const parsedJson = JSON.parse(stripJsonFence(text));
    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) return null;

    const p = parsed.data;
    const octalysisProfile = normalizeProfile(p.octalysisProfile);

    const contentJson = {
      summary: p.summary,
      audience: p.audience,
      primaryKpi: p.primaryKpi,
      secondaryKpis: p.secondaryKpis,
      strategicPriority: p.strategicPriority ?? null,
      constraints: p.constraints ?? null,
      businessScore: p.businessScore,
      octalysisProfile,
      note: p.note ?? "",
      competitorAnalysis: p.competitorAnalysis ?? null,
      effortEstimate: p.effortEstimate ?? null,
      riceScore: p.riceScore ?? null,
      valueRationale: p.valueRationale ?? null,
      model,
      provider: "openai",
      valueAnalysisSource: "openai",
    };

    const apiFooter = `\n\n---\n_Value analysis generated via **OpenAI API** (model \`${model}\`) — this usage appears in [platform.openai.com](https://platform.openai.com) → Usage (API), not ChatGPT Plus billing._`;

    const md =
      (p.markdownBody?.trim() ? `${p.markdownBody.trim()}${apiFooter}` : null) ||
      buildValueAnalysisMarkdown(p, octalysisProfile, apiFooter);

    return {
      contentJson,
      contentMarkdown: md,
      score: p.businessScore,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[apop] OpenAI value analysis failed (${msg}) — trying Anthropic / heuristic.`);
    return null;
  }
}
