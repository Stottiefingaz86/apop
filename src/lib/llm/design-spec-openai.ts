import OpenAI from "openai";
import type { AgentContext } from "@/agents/types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { contextPackForLlmJson, referenceImagesForVision } from "@/lib/llm/context-pack-llm";
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

export async function runDesignSpecEnhancementWithOpenAI(
  ctx: AgentContext,
  baseMarkdown: string,
  baseContentJson: Record<string, unknown>,
): Promise<DesignSpecLlmExtras | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
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
    `Produce the design-spec JSON. Base spec (for reference, do not repeat verbatim):\n\n${baseMarkdown.slice(0, 4_000)}\n\n---\nStructured base JSON keys: ${Object.keys(baseContentJson).join(", ")}\n\nFull payload:\n${JSON.stringify(payload, null, 2)}` +
    (refImages.length
      ? "\n\nReference UI screenshots are attached as images immediately after this message — align design language, tokens, and component picks with what you see."
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
      max_tokens: 6_000,
      messages: [
        { role: "system", content: designSpecWriterSystemPrompt() },
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const text = resp.choices[0]?.message?.content;
    if (!text) return null;

    const raw = JSON.parse(stripJsonFence(text));
    const parsed = designSpecLlmSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[apop] Design spec OpenAI JSON failed:", parsed.error.flatten());
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
      `---\n_Design augmentation via **OpenAI** (\`${model}\`)._`,
    ].join("\n");

    return {
      llm: {
        ...p,
        designSpecSource: "openai",
        model,
      },
      markdownAppendix: appendix,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[apop] OpenAI design spec failed (${msg})`);
    return null;
  }
}
