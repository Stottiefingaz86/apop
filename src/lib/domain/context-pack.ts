import { z } from "zod";

/**
 * Context Pack — user/org supplied truth. Agents MUST NOT invent these fields.
 * Stored on Feature.contextPack (JSON).
 */
export const contextPackSchema = z.object({
  productArea: z.string().min(1).optional(),
  targetAudience: z.string().min(1).optional(),
  primaryKpi: z.string().min(1).optional(),
  secondaryKpis: z.array(z.string()).optional(),
  strategicPriority: z.string().optional(),
  designFramework: z.string().optional(),
  /** Optional legacy hint only; models infer drives from the idea by default */
  octalysisFocus: z.array(z.string()).optional(),
  constraints: z.string().optional(),
  /** Vercel Preview / branch URL or staging — reviewers open this from APOP without a production deploy */
  previewUrl: z.string().optional(),
  /** Optional screenshots (base64 without data URL prefix) for vision-capable value analysis */
  referenceImages: z
    .array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        dataBase64: z.string(),
      }),
    )
    .max(3)
    .optional(),
  /** Optional PRD PDF (base64) — filename + note to model; full parsing not automated yet */
  referencePrdPdf: z
    .object({
      name: z.string(),
      dataBase64: z.string(),
    })
    .optional(),
}).passthrough();

export type ContextPack = z.infer<typeof contextPackSchema>;

export function parseContextPack(raw: unknown): ContextPack {
  const r = contextPackSchema.safeParse(raw);
  return r.success ? r.data : {};
}
