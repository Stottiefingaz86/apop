import Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "@/agents/types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import {
  anthropicImageMediaType,
  contextPackForLlmJson,
  referenceImagesForVision,
} from "@/lib/llm/context-pack-llm";
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
    prdSource: "anthropic",
    model,
  };
}

export async function runPrdWriterWithAnthropic(ctx: AgentContext): Promise<PrdLlmResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-20241022";

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
    (refImages.length ? "\n\nReference UI screenshots follow as images in this message." : "");

  type AnthropicImageMedia = NonNullable<ReturnType<typeof anthropicImageMediaType>>;
  type UserBlock =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: AnthropicImageMedia; data: string };
      };
  const userBlocks: UserBlock[] = [{ type: "text", text: userText }];
  for (const im of refImages) {
    const media = anthropicImageMediaType(im.mimeType);
    if (!media) continue;
    userBlocks.push({
      type: "image",
      source: { type: "base64", media_type: media, data: im.dataBase64 },
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 8_000,
      system: prdWriterSystemPrompt(),
      messages: [
        {
          role: "user",
          content: userBlocks,
        },
      ],
    });

    const block = resp.content[0];
    if (block.type !== "text") return null;

    const raw = JSON.parse(stripJsonFence(block.text));
    const parsed = prdLlmResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[apop] PRD Anthropic JSON failed schema:", parsed.error.flatten());
      return null;
    }

    const p: PrdLlmParsed = {
      ...parsed.data,
      roadmapLane: parsed.data.roadmapLane ?? inferRoadmapLaneForPrd(ctx),
    };
    const md =
      p.markdownBody?.trim() ||
      prdMarkdownFromJson(p, ctx.feature.title);
    const footer = `\n\n---\n_Build prompt via **Anthropic** (\`${model}\`)._`;

    return {
      contentJson: toArtifactJson(p, model),
      contentMarkdown: `${md}${footer}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[apop] Anthropic PRD writer failed (${msg})`);
    return null;
  }
}
