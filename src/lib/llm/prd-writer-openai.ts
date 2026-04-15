import OpenAI from "openai";
import type { AgentContext } from "@/agents/types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { contextPackForLlmJson, referenceImagesForVision } from "@/lib/llm/context-pack-llm";
import { prdWriterSystemPrompt } from "@/lib/llm/prd-llm-prompt";
import { inferRoadmapLaneForPrd } from "@/lib/domain/roadmap-lane-infer";
import {
  prdLlmResponseSchema,
  prdMarkdownFromJson,
  type PrdLlmParsed,
} from "@/lib/llm/prd-schemas";

function stripJsonFence(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

export type PrdLlmResult = {
  contentJson: Record<string, unknown>;
  contentMarkdown: string;
};

function toArtifactJson(p: PrdLlmParsed, model: string): Record<string, unknown> {
  return {
    ...p,
    prdSource: "openai",
    model,
  };
}

/**
 * GPT-class PRD when OPENAI_API_KEY is set. Returns null if unset or call/parse fails.
 */
export async function runPrdWriterWithOpenAI(ctx: AgentContext): Promise<PrdLlmResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  if (!value?.contentJson || typeof value.contentJson !== "object") return null;
  const design = ctx.artifactsByType.get(ARTIFACT_TYPES.DESIGN_SPEC);
  if (!design?.contentJson || typeof design.contentJson !== "object") return null;

  const refImages = referenceImagesForVision(ctx.contextPack);
  const userPayload = {
    featureTitle: ctx.feature.title,
    featureDescription: ctx.feature.description,
    contextPack: contextPackForLlmJson(ctx.contextPack),
    workspaceKnowledgeBrief: ctx.workspaceKnowledgeBrief?.trim() || null,
    valueAnalysis: value.contentJson,
    valueAnalysisMarkdownExcerpt: value.contentMarkdown?.slice(0, 8000) ?? null,
    designSpec: design.contentJson,
    designSpecMarkdownExcerpt: design.contentMarkdown?.slice(0, 8000) ?? null,
  };

  const userText =
    `Write the Cursor build-prompt JSON from value + design (see system rules):\n\n${JSON.stringify(userPayload, null, 2)}` +
    (refImages.length
      ? "\n\nReference UI screenshots are attached as images immediately after this message."
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

  const client = new OpenAI({ apiKey });

  try {
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      max_tokens: 8_000,
      messages: [
        { role: "system", content: prdWriterSystemPrompt() },
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const text = resp.choices[0]?.message?.content;
    if (!text) return null;

    const raw = JSON.parse(stripJsonFence(text));
    const parsed = prdLlmResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[apop] PRD OpenAI JSON failed schema:", parsed.error.flatten());
      return null;
    }

    const p: PrdLlmParsed = {
      ...parsed.data,
      roadmapLane: parsed.data.roadmapLane ?? inferRoadmapLaneForPrd(ctx),
    };
    const md =
      p.markdownBody?.trim() ||
      prdMarkdownFromJson(p, ctx.feature.title);
    const footer = `\n\n---\n_Build prompt via **OpenAI** (\`${model}\`)._`;

    return {
      contentJson: toArtifactJson(p, model),
      contentMarkdown: `${md}${footer}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[apop] OpenAI PRD writer failed (${msg})`);
    return null;
  }
}
