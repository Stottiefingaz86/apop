/**
 * Next.js page `searchParams` values may be `string | string[] | undefined`.
 * Calling `.trim()` on an array throws → 500. Always normalize first.
 */
export function pickQueryString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first !== "string") return undefined;
    const t = first.trim();
    return t || undefined;
  }
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  return undefined;
}
