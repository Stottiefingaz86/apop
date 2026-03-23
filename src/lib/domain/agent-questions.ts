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

export function parseAgentQuestionsPayload(
  raw: unknown,
): AgentQuestionsPayload | null {
  const r = agentQuestionsPayloadSchema.safeParse(raw);
  return r.success ? r.data : null;
}
