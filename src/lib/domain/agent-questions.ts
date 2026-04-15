import { z } from "zod";

export const questionFieldTypeSchema = z.enum([
  "text",
  "textarea",
  "file_or_json",
  "url",
  "multi_url",
  "choice",
]);

export type QuestionFieldType = z.infer<typeof questionFieldTypeSchema>;

export const structuredQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: questionFieldTypeSchema,
  required: z.boolean(),
  reason: z.string().min(1),
  choices: z.array(z.string()).optional(),
});

export type StructuredQuestion = z.infer<typeof structuredQuestionSchema>;

export const agentQuestionsPayloadSchema = z.object({
  agent: z.string().min(1),
  questions: z.array(structuredQuestionSchema).min(1),
});

export type AgentQuestionsPayload = z.infer<typeof agentQuestionsPayloadSchema>;

function normalizeJsonField(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

export function parseAgentQuestionsPayload(
  raw: unknown,
): AgentQuestionsPayload | null {
  const normalized = normalizeJsonField(raw);
  if (normalized == null) return null;
  const r = agentQuestionsPayloadSchema.safeParse(normalized);
  return r.success ? r.data : null;
}
