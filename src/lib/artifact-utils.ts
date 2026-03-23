import type { Artifact } from "@prisma/client";

export function latestArtifactByType(artifacts: Artifact[]): Map<string, Artifact> {
  const map = new Map<string, Artifact>();
  for (const a of artifacts) {
    const cur = map.get(a.type);
    if (!cur || a.version > cur.version) map.set(a.type, a);
  }
  return map;
}
