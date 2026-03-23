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
  octalysisFocus: z.array(z.string()).optional(),
  constraints: z.string().optional(),
});

export type ContextPack = z.infer<typeof contextPackSchema>;

export function parseContextPack(raw: unknown): ContextPack {
  const r = contextPackSchema.safeParse(raw);
  return r.success ? r.data : {};
}
