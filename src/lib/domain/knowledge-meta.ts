import { z } from "zod";
import type { KnowledgeIntegrationMeta } from "@/lib/domain/knowledge-integration";

const envVarRowSchema = z.object({
  label: z.string().min(1).max(120),
  envVarName: z
    .string()
    .min(2)
    .max(64)
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Use SCREAMING_SNAKE_CASE (e.g. INTERCOM_ACCESS_TOKEN). Never paste secret values.",
    ),
});

const integrationSchema = z
  .object({
    provider: z.enum(["intercom", "mixpanel", "saga", "other"]),
    providerLabel: z.string().max(120).optional(),
    docsUrl: z
      .string()
      .max(500)
      .optional()
      .refine((s) => !s?.trim() || /^https:\/\//i.test(s.trim()), "Docs URL must start with https://"),
    envVars: z.array(envVarRowSchema).max(16),
    publicWorkspaceId: z.string().max(400).optional(),
    notes: z.string().max(6000).optional(),
  })
  .strict();

/**
 * Validates optional `meta.integration` and rejects unknown keys (no smuggled secrets).
 */
export function sanitizeKnowledgeMeta(
  raw: Record<string, unknown>,
): { ok: true; meta: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = { ...raw };

  if (out.integration === undefined || out.integration === null) {
    delete out.integration;
    return { ok: true, meta: out };
  }

  const parsed = integrationSchema.safeParse(out.integration);
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ??
      parsed.error.flatten().fieldErrors.docsUrl?.[0] ??
      "Invalid integration metadata.";
    return { ok: false, error: msg };
  }

  const data = parsed.data;

  out.integration = {
    ...data,
    docsUrl: data.docsUrl?.trim() || undefined,
    providerLabel: data.providerLabel?.trim() || undefined,
    publicWorkspaceId: data.publicWorkspaceId?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
  };

  return { ok: true, meta: out };
}

export function parseKnowledgeIntegrationMeta(raw: unknown): KnowledgeIntegrationMeta | null {
  const r = integrationSchema.safeParse(raw);
  return r.success ? r.data : null;
}
