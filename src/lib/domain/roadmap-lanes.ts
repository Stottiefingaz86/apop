import type { RoadmapLane } from "@prisma/client";

export const ROADMAP_LANE_COLUMN_ORDER: RoadmapLane[] = [
  "SPORTS",
  "CASINO",
  "MARKETING",
  "PAM",
  "UNCATEGORIZED",
];

export const ROADMAP_LANE_LABEL: Record<RoadmapLane, string> = {
  SPORTS: "Sports",
  CASINO: "Casino",
  MARKETING: "Marketing",
  PAM: "PAM",
  UNCATEGORIZED: "Uncategorized",
};

const LANE_SET = new Set<string>(ROADMAP_LANE_COLUMN_ORDER);

export function isRoadmapLane(value: string): value is RoadmapLane {
  return LANE_SET.has(value);
}
