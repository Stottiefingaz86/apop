export function getVercelToken(): string | null {
  return process.env.VERCEL_TOKEN?.trim() || null;
}

export function getVercelProjectId(): string | null {
  return process.env.VERCEL_PROJECT_ID?.trim() || null;
}

export function getVercelTeamId(): string | null {
  return process.env.VERCEL_TEAM_ID?.trim() || null;
}

/** Explicit production-only hook (optional fallback when generic hook is unset). */
export function getVercelProductionDeployHookUrl(): string | null {
  return process.env.VERCEL_PRODUCTION_DEPLOY_HOOK_URL?.trim() || null;
}

/**
 * Hook URL for APOP **Deploy** and auto-deploy after Cursor.
 * Prefers `VERCEL_DEPLOY_HOOK_URL` first so a Preview / staging-branch hook in Vercel is not overridden
 * when you also set `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` (e.g. from docs). Each hook rebuilds whatever
 * branch it was created for in Vercel — Cursor’s Preview builds still come from Git integration on apop/… branches.
 */
export function getVercelDeployHookUrl(): string | null {
  const generic = process.env.VERCEL_DEPLOY_HOOK_URL?.trim() || null;
  return generic || getVercelProductionDeployHookUrl();
}

export function getVercelWebhookSecret(): string | null {
  return process.env.VERCEL_WEBHOOK_SECRET?.trim() || null;
}
