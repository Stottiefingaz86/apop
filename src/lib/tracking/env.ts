/**
 * APOP app URL — used in Cursor prompt so site-apop knows where to POST tracking events.
 * Set APOP_APP_URL in production (e.g. https://your-apop.vercel.app).
 */
export function getApopAppUrl(): string {
  const env = process.env.APOP_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");

  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v}`;

  return "https://localhost:3000";
}
