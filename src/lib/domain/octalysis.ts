import { z } from "zod";

/** Octalysis core drives — used for scoring and design alignment checks. */
export const OCTALYSIS_DRIVES = [
  "epic_meaning",
  "accomplishment",
  "creativity",
  "ownership",
  "social_influence",
  "scarcity",
  "curiosity",
  "loss_avoidance",
] as const;

export type OctalysisDrive = (typeof OCTALYSIS_DRIVES)[number];

export const octalysisProfileSchema = z.record(
  z.enum(OCTALYSIS_DRIVES),
  z.number().min(1).max(5),
);

export type OctalysisProfile = Partial<Record<OctalysisDrive, number>>;
