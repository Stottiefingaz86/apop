import type { OctalysisDrive } from "./octalysis";

/**
 * Lightweight keyword lift for non-LLM value analysis fallback.
 * Models infer richer profiles from copy when APIs are available.
 */
const DRIVE_HINTS: [OctalysisDrive, string[]][] = [
  ["epic_meaning", ["brand", "trust", "mission", "purpose", "values", "fair", "integrity", "community"]],
  [
    "accomplishment",
    ["achievement", "tier", "level", "progress", "badge", "streak", "win", "reward", "complete", "rank"],
  ],
  ["creativity", ["custom", "build", "choose", "design", "configure", "personal", "editor", "avatar"]],
  ["ownership", ["wallet", "inventory", "collection", "my account", "profile", "save", "vault"]],
  ["social_influence", ["friend", "share", "leaderboard", "refer", "team", "chat", "social", "invite"]],
  ["scarcity", ["limited", "countdown", "exclusive", "flash", "timer", "drop", "only", "expires"]],
  ["curiosity", ["mystery", "reveal", "explore", "discover", "new", "teaser", "unlock", "secret"]],
  ["loss_avoidance", ["expire", "forfeit", "miss", "risk", "protect", "streak", "penalty", "lose"]],
];

export function inferOctalysisWeightsFromCopy(
  ...chunks: (string | null | undefined)[]
): Record<OctalysisDrive, number> {
  const text = chunks
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const out = {} as Record<OctalysisDrive, number>;
  for (const [drive, words] of DRIVE_HINTS) {
    const hits = words.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);
    out[drive] = Math.min(5, Math.max(2, 2 + Math.min(3, hits)));
  }
  return out;
}
