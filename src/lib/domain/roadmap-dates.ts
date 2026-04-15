/** Avoid `RangeError` from `Date#toISOString()` on invalid dates (can 500 the roadmap page). */
export function parseFeatureDate(value: unknown): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallbackDate() : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallbackDate() : d;
  }
  return fallbackDate();
}

function fallbackDate(): Date {
  return new Date();
}

export function formatRoadmapShortDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function roadmapDateTimeAttr(d: Date): string {
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
