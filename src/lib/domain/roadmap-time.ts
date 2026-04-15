/**
 * Roadmap time-axis: quarters, months, and "Current" period.
 * Features are grouped by target date (or createdAt fallback).
 */

export function getQuarter(d: Date): { year: number; quarter: number } {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { year: d.getFullYear(), quarter: q };
}

export function formatQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Month names for a quarter, e.g. "Jan–Mar" */
export function quarterMonthRange(year: number, quarter: number): string {
  const start = (quarter - 1) * 3;
  const m1 = new Date(year, start, 1).toLocaleDateString(undefined, { month: "short" });
  const m3 = new Date(year, start + 2, 1).toLocaleDateString(undefined, { month: "short" });
  return `${m1}–${m3}`;
}

export function isCurrentQuarter(d: Date): boolean {
  const now = new Date();
  const a = getQuarter(d);
  const b = getQuarter(now);
  return a.year === b.year && a.quarter === b.quarter;
}

export function isCurrentMonth(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export type TimeBucket = {
  key: string;
  label: string;
  isCurrent: boolean;
  year: number;
  quarter: number;
  /** Sort key: current first, then by date */
  sortKey: number;
};

/** Generate time buckets for roadmap: Current (if has items), then past/future quarters. */
export function buildRoadmapTimeBuckets(dates: Date[]): TimeBucket[] {
  const now = new Date();
  const currentQ = getQuarter(now);
  const seen = new Map<string, { year: number; quarter: number }>();

  for (const d of dates) {
    if (Number.isNaN(d.getTime())) continue;
    const { year, quarter } = getQuarter(d);
    const key = `${year}-Q${quarter}`;
    if (!seen.has(key)) seen.set(key, { year, quarter });
  }

  const buckets: TimeBucket[] = [];
  for (const [key, { year, quarter }] of seen) {
    const isCurrent = year === currentQ.year && quarter === currentQ.quarter;
    buckets.push({
      key,
      label: formatQuarterLabel(year, quarter),
      isCurrent,
      year,
      quarter,
      sortKey: isCurrent ? 0 : year * 4 + quarter,
    });
  }

  buckets.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.sortKey - b.sortKey;
  });

  return buckets;
}

/** Get the effective date for a feature (target or createdAt). */
export function featureEffectiveDate(
  roadmapTargetDate: Date | null | undefined,
  createdAt: Date
): Date {
  if (roadmapTargetDate && !Number.isNaN(roadmapTargetDate.getTime())) {
    return roadmapTargetDate;
  }
  return createdAt;
}
