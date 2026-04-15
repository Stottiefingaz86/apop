import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

function stripJsonFence(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

const system = `You propose product feature ideas for a backlog (Inbox), grounded ONLY in the workspace knowledge brief provided.
Rules:
- Each idea must be actionable and specific enough to build or spike.
- Tie ideas to evidence in the brief (KPIs, research, data patterns, gaps). If the brief is thin, say so in idea descriptions and stay conservative.
- Do not invent confidential credentials or live metrics not implied by the text.
- Return ONLY valid JSON: { "ideas": [ { "title": string, "description": string } ] }`;

export async function suggestIdeasFromKnowledgeBrief(
  brief: string,
  maxIdeas: number,
): Promise<{ title: string; description: string }[] | null> {
  const capped = Math.min(8, Math.max(1, maxIdeas));
  const user = `Workspace knowledge (truncated):\n\n${brief.slice(0, 28_000)}\n\n---\nPropose up to ${capped} feature ideas as JSON.`;

  const apiKeyOpen = process.env.OPENAI_API_KEY?.trim();
  if (apiKeyOpen) {
    try {
      const client = new OpenAI({ apiKey: apiKeyOpen });
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
      const resp = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        max_tokens: 4_000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const text = resp.choices[0]?.message?.content;
      if (!text) return null;
      const raw = JSON.parse(stripJsonFence(text));
      const parsed = ideasSchema.safeParse(raw);
      if (!parsed.success) return null;
      return parsed.data.ideas.slice(0, capped);
    } catch (e) {
      console.warn("[apop] suggest ideas OpenAI failed", e);
    }
  }

  const apiKeyAnth = process.env.ANTHROPIC_API_KEY?.trim();
  if (apiKeyAnth) {
    try {
      const client = new Anthropic({ apiKey: apiKeyAnth });
      const model =
        process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-20241022";
      const resp = await client.messages.create({
        model,
        max_tokens: 4_000,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = resp.content[0];
      if (block.type !== "text") return null;
      const raw = JSON.parse(stripJsonFence(block.text));
      const parsed = ideasSchema.safeParse(raw);
      if (!parsed.success) return null;
      return parsed.data.ideas.slice(0, capped);
    } catch (e) {
      console.warn("[apop] suggest ideas Anthropic failed", e);
    }
  }

  return null;
}
