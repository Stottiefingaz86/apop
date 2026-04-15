import type { RoadmapLane } from "@prisma/client";
import type { AgentContext } from "@/agents/types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

/**
 * Keyword heuristics for org swimlanes (Sports, Casino, Marketing, PAM).
 * Used when the PRD model omits `roadmapLane` and for template PRD without LLM.
 */
export function inferRoadmapLaneFromText(blob: string): RoadmapLane {
  const t = blob.trim();
  if (!t) return "UNCATEGORIZED";

  const casino =
    /\b(casino|games\b|game lobby|slots?\b|jackpot|poker room|live casino|roulette|blackjack|table games|crash game)\b/i;
  const sports =
    /\b(sportsbook|sports book|same game parlay|sgp\b|parlay|live betting|in-?play|odds\b|nba\b|nfl\b|mlb\b|nhl\b|premier league|soccer betting|esports betting|sports nav|racebook)\b/i;
  const marketing =
    /\b(marketing|promo(tion)?s?\b|campaign|email blast|crm\b|acquisition|retention|seo\b|sem\b|affiliate|banner ad|paid media|social ads?|brand campaign)\b/i;
  const pam =
    /\b(pam\b|player account|account management|wallet|deposit|withdraw|kyc\b|verification|responsible gaming|rg\b|self-?exclusion|vip rewards|loyalty tier|rg tools)\b/i;

  if (casino.test(t)) return "CASINO";
  if (sports.test(t)) return "SPORTS";
  if (marketing.test(t)) return "MARKETING";
  if (pam.test(t)) return "PAM";
  return "UNCATEGORIZED";
}

/** Concatenate BA-relevant strings from the feature, value, design, and context pack for lane inference. */
export function inferRoadmapLaneForPrd(ctx: AgentContext): RoadmapLane {
  const parts: string[] = [
    ctx.feature.title,
    ctx.feature.description ?? "",
    ctx.contextPack.productArea ?? "",
    ctx.contextPack.constraints ?? "",
  ];
  const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
  if (value?.contentJson && typeof value.contentJson === "object") {
    const j = value.contentJson as Record<string, unknown>;
    for (const k of ["summary", "primaryKpi", "audience", "strategicPriority", "constraints"] as const) {
      const v = j[k];
      if (typeof v === "string") parts.push(v);
    }
  }
  const design = ctx.artifactsByType.get(ARTIFACT_TYPES.DESIGN_SPEC);
  if (design?.contentJson && typeof design.contentJson === "object") {
    const d = design.contentJson as Record<string, unknown>;
    if (typeof d.brand === "string") parts.push(d.brand);
    if (typeof d.uxDirection === "string") parts.push(d.uxDirection);
  }
  return inferRoadmapLaneFromText(parts.join("\n"));
}
