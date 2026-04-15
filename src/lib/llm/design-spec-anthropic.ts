import Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "@/agents/types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import {
  anthropicImageMediaType,
  contextPackForLlmJson,
  referenceImagesForVision,
} from "@/lib/llm/context-pack-llm";
import { designSpecWriterSystemPrompt } from "@/lib/llm/design-spec-llm-prompt";
import {
  designSpecLlmSchema,
  type DesignSpecLlmParsed,
} from "@/lib/llm/design-spec-llm-schema";

function stripJsonFence(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

export type DesignSpecLlmExtras = {
  llm: DesignSpecLlmParsed & { designSpecSource: string; model: string };
  markdownAppendix: string;
};

export async function runDesignSpecEnhancementWithAnthropic(
  ctx: AgentContext,
  baseMarkdown: string,
  baseContentJson: Record<string, unknown>,
): Promise<DesignSpecLlmExtras | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-20241022";

  const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  const d = ctx.designInputs;
  const refImages = referenceImagesForVision(ctx.contextPack);

  const payload = {
    featureTitle: ctx.feature.title,
    featureDescription: ctx.feature.description,
    contextPack: contextPackForLlmJson(ctx.contextPack),
    workspaceKnowledgeBrief: ctx.workspaceKnowledgeBrief?.trim() || null,
    designInputs: {
      brandDescription: d.brandDescription,
      uxDirection: d.uxDirection,
      figmaUrl: d.figmaUrl,
      competitorUrls: d.competitorUrls,
      tokenJson: d.tokenJson,
    },
    valueJson: value?.contentJson ?? null,
    valueMarkdownExcerpt:
      typeof value?.contentMarkdown === "string"
        ? value.contentMarkdown.slice(0, 10_000)
        : null,
  };

  const userText =
    `Produce the design-spec JSON. Base spec (for reference):\n\n${baseMarkdown.slice(0, 4_000)}\n\n---\nBase JSON keys: ${Object.keys(baseContentJson).join(", ")}\n\nPayload:\n${JSON.stringify(payload, null, 2)}` +
    (refImages.length
      ? "\n\nReference UI screenshots follow as images in this message — align design language with visible UI."
      : "");

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
      max_tokens: 6_000,
      system: designSpecWriterSystemPrompt(),
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
    const parsed = designSpecLlmSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[apop] Design spec Anthropic JSON failed:", parsed.error.flatten());
      return null;
    }

    const p = parsed.data;
    const appendix = [
      "",
      "## AI implementation narrative (for Cursor)",
      p.cursorImplementationNarrative,
      "",
      "## Recommended components",
      ...p.componentRecommendations.map((c) => `- ${c}`),
      "",
      "## UX patterns",
      ...p.uxPatterns.map((c) => `- ${c}`),
      "",
      "## States & edge cases",
      p.stateAndEdgeCases,
      p.accessibilityNotes ? `\n## Accessibility\n${p.accessibilityNotes}` : "",
      "",
      "## Roadmap value angle",
      p.roadmapValueAngle,
      "",
      `---\n_Design augmentation via **Anthropic** (\`${model}\`)._`,
    ].join("\n");

    return {
      llm: { ...p, designSpecSource: "anthropic", model },
      markdownAppendix: appendix,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[apop] Anthropic design spec failed (${msg})`);
    return null;
  }
}
