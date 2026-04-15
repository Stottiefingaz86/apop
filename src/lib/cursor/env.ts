/** Cursor Cloud Agents API — https://cursor.com/docs/background-agent/api/endpoints */

import { getApopDeliveryTarget } from "@/lib/domain/delivery-target";

export function getCursorApiKey(): string | null {
  const k = process.env.CURSOR_API_KEY?.trim();
  return k || null;
}

/** Full GitHub repo URL, e.g. https://github.com/org/repo — defaults to site-apop delivery repo */
export function getCursorBuildRepository(): string | null {
  const r = process.env.CURSOR_BUILD_REPOSITORY?.trim();
  if (r) return r;
  return getApopDeliveryTarget().repositoryWebUrl || null;
}

export function getCursorBuildRef(): string {
  return process.env.CURSOR_BUILD_REF?.trim() || "main";
}

/** Model id or omit / "default" — see Cursor /v0/models */
export function getCursorAgentModel(): string | undefined {
  const m = process.env.CURSOR_AGENT_MODEL?.trim();
  if (!m || m === "default") return undefined;
  return m;
}

export function isCursorBuildConfigured(): boolean {
  return !!(getCursorApiKey() && getCursorBuildRepository());
}

/**
 * Shared secret used to verify Cursor Cloud webhook payloads.
 * Must be >= 32 chars. Auto-generated from CURSOR_API_KEY if not set explicitly.
 */
export function getCursorWebhookSecret(): string | null {
  const explicit = process.env.CURSOR_WEBHOOK_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;
  const apiKey = getCursorApiKey();
  if (!apiKey || apiKey.length < 32) return null;
  return apiKey;
}
