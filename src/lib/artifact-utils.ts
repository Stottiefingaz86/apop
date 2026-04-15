import type { Artifact } from "@prisma/client";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

export function latestArtifactByType(artifacts: Artifact[]): Map<string, Artifact> {
  const map = new Map<string, Artifact>();
  for (const a of artifacts) {
    const cur = map.get(a.type);
    if (!cur || a.version > cur.version) map.set(a.type, a);
  }
  return map;
}

/** Cursor / implementation only after value, design, and Cursor prompt (`prd`) artifacts exist with body text. */
export function canStartCursorImplementation(artifacts: Artifact[]): boolean {
  const m = latestArtifactByType(artifacts);
  return Boolean(
    m.get(ARTIFACT_TYPES.VALUE_ANALYSIS)?.contentMarkdown?.trim() &&
      m.get(ARTIFACT_TYPES.PRD)?.contentMarkdown?.trim() &&
      m.get(ARTIFACT_TYPES.DESIGN_SPEC)?.contentMarkdown?.trim(),
  );
}
