import { prisma } from "@/lib/prisma";

export type JourneyTrackingMetrics = {
  clicks: number;
  impressions: number;
};

/** Aggregate journey map events by feature. */
export async function getJourneyTrackingCounts(
  featureIds: string[],
): Promise<Map<string, JourneyTrackingMetrics>> {
  if (featureIds.length === 0) return new Map();

  const rows = await prisma.journeyTrackingEvent.groupBy({
    by: ["featureId", "eventType"],
    where: { featureId: { in: featureIds } },
    _count: { id: true },
  });

  const map = new Map<string, JourneyTrackingMetrics>();
  for (const id of featureIds) {
    map.set(id, { clicks: 0, impressions: 0 });
  }
  for (const r of rows) {
    const m = map.get(r.featureId) ?? { clicks: 0, impressions: 0 };
    if (r.eventType === "click") m.clicks = r._count.id;
    else if (r.eventType === "impression") m.impressions = r._count.id;
    map.set(r.featureId, m);
  }
  return map;
}
