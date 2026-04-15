/**
 * Ground truth about the delivery / preview site (site-apop).
 * Source repo: https://github.com/Stottiefingaz86/site-apop
 *
 * Keep in sync when routes or product positioning change. Agents should treat
 * this as organizational context, not a substitute for user-supplied feature scope.
 */

export const SITE_APOP_REPO = "https://github.com/Stottiefingaz86/site-apop.git";

/** Public site (Vercel production). */
export const SITE_APOP_PRODUCTION_URL = "https://site-apop.vercel.app";

/** Live component / block catalog (audited library UI). */
export const SITE_APOP_LIBRARY_URL = `${SITE_APOP_PRODUCTION_URL}/library`;

/**
 * shadcn/ui + Radix inventory as surfaced on the delivery library page.
 * Agents should name these when recommending implementation — paths live under `src/components/ui` unless noted.
 */
export const SITE_APOP_SHADCN_LIBRARY_ITEMS = [
  { name: "Accordion", primitive: "Radix", note: "Vertically collapsing sections" },
  { name: "Avatar", primitive: "Radix", note: "Circular image with fallback" },
  { name: "Badge", primitive: null, note: "Status / label pill" },
  { name: "Button", primitive: null, note: "Variants: default, destructive, outline, secondary, ghost, link" },
  { name: "Card", primitive: null, note: "Header, content, footer, title, description" },
  { name: "Carousel", primitive: null, note: "Embla horizontal carousel, prev/next" },
  { name: "Checkbox", primitive: "Radix", note: "Indeterminate support" },
  { name: "Dotted Glow BG", primitive: null, note: "Animated dotted radial glow background" },
  { name: "Drawer", primitive: null, note: "Vaul bottom sheet / side panel" },
  { name: "Dropdown Menu", primitive: "Radix", note: "Sub-menus" },
  { name: "Empty State", primitive: null, note: "Empty data placeholder" },
  { name: "Family Drawer", primitive: null, note: "Multi-view drawer, shared layout animations" },
  { name: "Input", primitive: null, note: "Text input, focus ring" },
  { name: "Label", primitive: "Radix" },
  { name: "Navigation Menu", primitive: "Radix", note: "Top nav with dropdowns" },
  { name: "Pagination", primitive: null },
  { name: "Popover", primitive: "Radix" },
  { name: "Progress", primitive: "Radix" },
  { name: "Select", primitive: "Radix", note: "Search & groups" },
  { name: "Separator", primitive: "Radix" },
  { name: "Sheet", primitive: "Radix", note: "Slide-in from any edge" },
  { name: "Sidebar", primitive: null, note: "Collapsible, icon mode, mobile sheet, tooltip" },
  { name: "Skeleton", primitive: null },
  { name: "Sonner (Toast)", primitive: null },
  { name: "Table", primitive: null },
  { name: "Tabs", primitive: "Radix" },
  { name: "Toggle", primitive: "Radix" },
  { name: "Tooltip", primitive: "Radix" },
] as const;

/** Product-specific or composite components (not generic shadcn primitives). */
export const SITE_APOP_CUSTOM_COMPONENT_PATHS = [
  { name: "AnimateTabs", path: "components/animate-ui/", note: "Framer-motion tabs, spring physics" },
  { name: "ChatNavToggle", path: "components/chat/chat-nav-toggle.tsx", note: "Chat toggle, unread dot" },
  { name: "ChatPanel", path: "components/chat/chat-panel.tsx", note: "Desktop panel + mobile drawer" },
  { name: "GlobalBetslip", path: "components/betslip/global-betslip.tsx", note: "Bottom betslip, stake pad" },
  { name: "DesignCustomizer", path: "components/design-customizer.tsx", note: "Runtime theme / brand panel" },
  { name: "StreakCounter", path: "components/vip/streak-counter.tsx" },
  { name: "BetAndGet", path: "components/vip/bet-and-get.tsx" },
  { name: "ReloadClaim", path: "components/vip/reload-claim.tsx" },
  { name: "CashDropCode", path: "components/vip/cash-drop-code.tsx" },
  { name: "JackpotOverlay", path: "components/casino/jackpot-overlay.tsx" },
  { name: "SportsTracker", path: "components/sports-tracker-widget.tsx" },
  { name: "NumberFlow", path: "@number-flow/react", note: "Animated numeric transitions" },
] as const;

/** Brand + layout tokens documented on the library / design system. */
export const SITE_APOP_BRAND_TOKENS = {
  fontFamily: "Figtree (next/font, CSS var --font-figtree, Tailwind font-figtree; weights 300–900)",
  colors: {
    primaryBetOnlineRed: "#ee3536 (CSS --ds-primary)",
    navigationBg: "#2D2E2C (--ds-nav-bg)",
    sidebarBg: "#2d2d2d (--ds-sidebar-bg)",
    pageBg: "#0a0a0a (--ds-page-bg)",
  },
  semantic: "Dark theme semantic tokens: --background, --foreground, --card, --primary, --muted, --accent, --destructive",
  radius: { roundedSmall: "6px", tailwindBaseUnit: "4px" },
} as const;

/** Major dependency versions (delivery repo; align recommendations with these). */
export const SITE_APOP_DEPENDENCY_PROFILE = {
  next: "14.x App Router",
  react: "18.x",
  tailwind: "3.x",
  framerMotion: "11.x",
  radix: "latest (per shadcn)",
  shadcnUi: "default style, neutral baseColor",
  icons: "Tabler Icons 3.x, Lucide React ~0.56",
  emblaCarousel: "8.x",
  vaul: "1.x (Drawer)",
  zustand: "4.x",
  numberFlow: "0.5.x",
  sonner: "2.x",
  cva: "0.7.x",
  registries: "animate-ui, billingsdk, limeplay, aceternity (components.json)",
} as const;

/** Structured block for LLM prompts (design + PRD). */
export function siteApopDesignSystemForLlm(): Record<string, unknown> {
  return {
    libraryUrl: SITE_APOP_LIBRARY_URL,
    shadcnAndPrimitives: SITE_APOP_SHADCN_LIBRARY_ITEMS,
    customComponents: SITE_APOP_CUSTOM_COMPONENT_PATHS,
    brandTokens: SITE_APOP_BRAND_TOKENS,
    dependencies: SITE_APOP_DEPENDENCY_PROFILE,
    guidance:
      "Prefer naming real delivery primitives (shadcn/Radix above) and existing composite components before inventing new patterns. Reference screenshots should be described using these tokens and component names where they match.",
  };
}

/** HTTPS GitHub URL without `.git` (for humans + Cursor API). */
export function siteApopRepositoryWebUrl(): string {
  return SITE_APOP_REPO.replace(/\.git\/?$/i, "");
}

/** Top-level App Router segments under `app/` (main verticals & tools). */
export const SITE_APOP_APP_ROUTES = [
  { segment: "", note: "Root `page.tsx` is very large — likely primary hub / sportsbook-style shell" },
  { segment: "account", note: "My account / logged-in user surfaces" },
  { segment: "casino", note: "Casino product area" },
  { segment: "poker", note: "Poker product area" },
  { segment: "sports", note: "Sportsbook product area" },
  { segment: "live-betting", note: "In-play / live betting" },
  { segment: "esports", note: "Esports betting / content" },
  { segment: "community", note: "Community / social-adjacent" },
  { segment: "vip-rewards", note: "Loyalty / VIP / rewards" },
  { segment: "library", note: "Content / games library style browsing" },
  { segment: "mobile", note: "Mobile-specific flows or preview" },
  { segment: "player", note: "Media / streaming player (Shaka in dependencies)" },
  {
    segment: "journey-map",
    note: "Journey / UX mapping tooling — track clicks/impressions; POST to APOP /api/tracking/events with data-apop-feature-id",
  },
  { segment: "studio", note: "Brand Book Studio (creative workflow) under route group `(studio)`" },
  { segment: "navtest", note: "Internal navigation test" },
] as const;

export const SITE_APOP_PRODUCT_VERTICALS = [
  {
    id: "sportsbook",
    routes: ["/sports", "/live-betting", "/esports"],
    signals: ["react-mlb-logos", "react-nfl-logos", "react-nhl-logos", "live-betting", "esports"],
  },
  {
    id: "casino",
    routes: ["/casino", "/poker", "/library"],
    signals: ["casino", "poker", "library"],
  },
  {
    id: "account",
    routes: ["/account"],
    signals: ["account", "profile", "wallet", "KYC", "responsible gambling"],
  },
  {
    id: "rewards",
    routes: ["/vip-rewards"],
    signals: ["VIP", "loyalty", "rewards", "promotions"],
  },
  {
    id: "studio",
    routes: ["/studio"],
    signals: ["brand book", "creative agency", "brief", "brand pillars"],
  },
] as const;

export const SITE_APOP_STACK = {
  framework: "Next.js 14 App Router (per package.json in site-apop)",
  styling: "Tailwind CSS + tailwindcss-animate; shadcn-style semantic tokens in tailwind.config (CSS variables)",
  typography: "Figtree (see `app/layout.tsx` — `--font-figtree`)",
  theming: "next-themes (ThemeProvider in root layout)",
  motion: "Framer Motion",
  data: "Supabase client (`@supabase/supabase-js`); migrations under `supabase/migrations`",
  ai: "OpenAI SDK present (`openai` dependency) — wire-up varies by route",
  media: "shaka-player; sports league logo React packages",
  uiPrimitives: "Radix UI family, Lucide / Tabler / Phosphor icons",
} as const;

/**
 * Global shell capabilities wired in root `layout.tsx` (site-apop).
 * Use when classifying “cross-cutting” features vs page-specific work.
 */
export const SITE_APOP_GLOBAL_SHELL = [
  "Global chat wrapper (`GlobalChatWrapper`)",
  "Global betslip (`GlobalBetslip`)",
  "Design customizer overlay (`DesignCustomizer`)",
  "Esports link fix helper (`EsportsLinkFix`)",
  "Prevent overscroll behavior",
] as const;

export const SITE_APOP_README_CAVEAT =
  "The site-apop README describes “Brand Book Studio” prominently, but the repo also contains large iGaming/sportsbook-style surfaces (casino, sports, live betting, account, betslip). Treat README as partially descriptive; route structure and dependencies are the source of truth for product shape.";

/** Short paragraph for injecting into PRD/design context when building for site-apop. */
export function siteApopDnaSummary(): string {
  const routes = SITE_APOP_APP_ROUTES.map((r) => (r.segment ? `/${r.segment}` : "/")).join(", ");
  return [
    `Delivery site repo: ${SITE_APOP_REPO}`,
    `Design library (live catalog): ${SITE_APOP_LIBRARY_URL}`,
    `Primary App Router areas include: ${routes}.`,
    `Product clusters: sportsbook (sports, live-betting, esports), casino (casino, poker, library), account (/account), rewards (/vip-rewards), studio (/studio).`,
    `Stack: ${SITE_APOP_STACK.framework}; ${SITE_APOP_STACK.styling}; font ${SITE_APOP_STACK.typography}.`,
    `Global shell: ${SITE_APOP_GLOBAL_SHELL.join("; ")}.`,
    SITE_APOP_README_CAVEAT,
    "Reuse policy: before building a new carousel, game row, promo strip, or hero, search the delivery repo for an existing implementation (e.g. another vertical’s carousel). Prefer extending or parameterizing that component (title, items, theme key) so layout, motion, and typography stay consistent — do not fork a parallel component with a new style.",
  ].join(" ");
}
