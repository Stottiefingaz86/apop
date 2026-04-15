/**
 * Curated competitive / benchmark set for APOP agents (value, PRD, design).
 * This is **organizational knowledge**, not live site research — we do not crawl
 * these URLs at runtime yet. Agents should use it for **pattern-level** comparisons
 * (navigation, trust, promos, bet slip, live betting density) and must not invent
 * current offers, odds, or jurisdiction-specific compliance facts.
 */

export type CompetitiveOperator = {
  id: string;
  /** Canonical marketing site (https) */
  url: string;
  /** How we use them in prompts */
  tier: "core_comps" | "global_benchmark";
  /** Short, stable positioning for LLM context */
  lens: string;
};

/** Primary comps the product org tracks for research-style thinking */
export const APOP_CORE_COMPETITORS: CompetitiveOperator[] = [
  {
    id: "stake",
    url: "https://stake.com",
    tier: "core_comps",
    lens: "Crypto-forward sports + casino brand; strong community, creator, and sponsorship presence; study lobby density and promo framing patterns.",
  },
  {
    id: "fanduel",
    url: "https://www.fanduel.com",
    tier: "core_comps",
    lens: "US regulated omnichannel sportsbook; polished acquisition funnels, promos, and account/KYC flows; reference responsible-gambling surfacing norms.",
  },
  {
    id: "draftkings",
    url: "https://www.draftkings.com",
    tier: "core_comps",
    lens: "US regulated sportsbook + gaming cross-sell; app-first patterns, parlay/SSG merchandising, rewards integration — compare clarity of bet construction.",
  },
  {
    id: "bovada",
    url: "https://www.bovada.lv",
    tier: "core_comps",
    lens: "Long-running offshore-style US-facing sportsbook/casino UX legacy patterns; useful for contrast with regulated flows (disclosure, limits, identity).",
  },
];

/** “Best in business” directional benchmarks for future deep research */
export const APOP_GLOBAL_BENCHMARKS: CompetitiveOperator[] = [
  {
    id: "bet365",
    url: "https://www.bet365.com",
    tier: "global_benchmark",
    lens: "Global incumbent; often cited for in-play depth, bet slip discipline, and live event navigation — use as **UX density** reference, not copy-paste.",
  },
  {
    id: "roobet",
    url: "https://roobet.com",
    tier: "global_benchmark",
    lens: "Crypto casino positioning; younger skew, entertainment-led merchandising — compare onboarding, game discovery, and trust signals vs regulated sites.",
  },
];

export const APOP_ALL_REFERENCE_OPERATORS: CompetitiveOperator[] = [
  ...APOP_CORE_COMPETITORS,
  ...APOP_GLOBAL_BENCHMARKS,
];

/**
 * Compact block appended to LLM system prompts.
 */
export function competitiveLandscapeBriefForLlm(): string {
  const lines = [
    "",
    "## Reference operators (directional benchmarking only)",
    "APOP supplies these as **fixed research anchors**. You do **not** have live crawls of their sites.",
    "Use them for: navigation metaphors, bet slip / live betting patterns, promo surfaces, trust & compliance **patterns** at a high level.",
    "Do **not**: invent current bonuses, odds, geo rules, or legal claims. If the user did not supply a fact, note it in caveats or open questions.",
    "",
    "### Core comps (research set)",
    ...APOP_CORE_COMPETITORS.map(
      (o) => `- **${o.id}** (${o.url}) — ${o.lens}`,
    ),
    "",
    "### Global benchmarks (best-in-class lens)",
    ...APOP_GLOBAL_BENCHMARKS.map(
      (o) => `- **${o.id}** (${o.url}) — ${o.lens}`,
    ),
    "",
    "### Future",
    "Automated competitor analysis (screenshots, IA maps, component diff) may ingest these URLs later; until then stay qualitative and non-specific on live data.",
  ];
  return lines.join("\n");
}

/** Structured slice for JSON payloads (e.g. deliverySiteContextForLlm) */
export function competitiveLandscapeStructuredForLlm(): {
  coreCompetitors: CompetitiveOperator[];
  globalBenchmarks: CompetitiveOperator[];
  disclaimer: string;
} {
  return {
    coreCompetitors: APOP_CORE_COMPETITORS,
    globalBenchmarks: APOP_GLOBAL_BENCHMARKS,
    disclaimer:
      "Curated references only; no live crawl. Do not state current site facts not provided by the user.",
  };
}
