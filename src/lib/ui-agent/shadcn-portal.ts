/**
 * shadcn/ui conventions for this repo — use for in-app agents (design spec, PRD)
 * and for human implementers. Official docs: https://ui.shadcn.com/docs
 */

export const SHADCN_COMPONENTS_JSON = "components.json";

/** Where CLI installs primitives; import as `@/components/ui/...`. */
export const SHADCN_UI_DIR = "src/components/ui";

/** Shared helpers: `cn()` → `@/lib/utils/cn`. */
export const SHADCN_UTILS = "@/lib/utils/cn";

/**
 * Installed primitives in this portal (add more with CLI; keep list updated or run glob).
 * Do not hand-roll duplicate patterns when a component exists here or can be added.
 */
export const SHADCN_INSTALLED_COMPONENTS = [
  "badge",
  "button",
  "card",
  "input",
  "label",
  "scroll-area",
  "separator",
  "tabs",
  "textarea",
] as const;

/** Standard shadcn project layout (Next.js App Router). */
export const SHADCN_DIRECTORY_MAP = {
  ui: `${SHADCN_UI_DIR}/`,
  components: "src/components/",
  libUtils: "src/lib/utils/",
  hooks: "src/hooks/",
  globalStyles: "src/app/globals.css",
  config: SHADCN_COMPONENTS_JSON,
  tailwindConfig: "tailwind.config.ts",
} as const;

/**
 * Pick the right primitive for the job before writing custom divs.
 * Names match `npx shadcn@latest add <name>` registry IDs.
 */
export const SHADCN_COMPONENT_BY_JOB: { job: string; components: string[]; notes?: string }[] = [
  { job: "Page / panel layout", components: ["card", "separator", "scroll-area"] },
  { job: "Primary actions", components: ["button"] },
  { job: "Status / labels", components: ["badge"] },
  { job: "Text fields", components: ["input", "textarea", "label"] },
  { job: "Switch between views", components: ["tabs"] },
  {
    job: "Modal / drawer",
    components: ["dialog", "sheet"],
    notes: "Add via CLI if not in repo; Dialog/Sheet need Title for a11y.",
  },
  {
    job: "Menus / pickers",
    components: ["dropdown-menu", "select", "popover"],
    notes: "Use Select for 8+ options; ToggleGroup for small fixed sets per shadcn guidance.",
  },
  {
    job: "Data tables",
    components: ["table"],
    notes: "Compose with TanStack Table if needed; add `table` from registry.",
  },
  {
    job: "Forms (validation, groups)",
    components: ["field", "input-group"],
    notes: "Prefer Field + FieldGroup when using the latest shadcn form patterns; add if missing.",
  },
  {
    job: "Feedback",
    components: ["alert", "sonner", "skeleton"],
    notes: "Toast via sonner; loading rows → Skeleton; callouts → Alert.",
  },
  {
    job: "Navigation shell",
    components: ["sidebar", "breadcrumb", "navigation-menu"],
    notes: "Dashboard-style layouts → Sidebar + Card.",
  },
];

export const SHADCN_CLI = "npx shadcn@latest add <component>";

export const SHADCN_IMPLEMENTATION_RULES = [
  "Import from `@/components/ui/*` after adding components; never copy-paste from node_modules.",
  "Use semantic tokens: `bg-background`, `text-muted-foreground`, `border-border` — not raw palette classes for chrome.",
  "Layout spacing: `flex` / `grid` with `gap-*`, not `space-x-*` / `space-y-*`.",
  "Conditional classes: `cn()` from `@/lib/utils/cn`.",
  "Compose Card with CardHeader, CardTitle, CardDescription, CardContent (and Footer when needed).",
  "Overlay components: include an accessible Title (sr-only if hidden).",
  "Icons: pass Lucide components as elements; in Buttons use `data-icon` per shadcn icon rules.",
] as const;

export function shadcnPortalBriefMarkdown(): string {
  const jobs = SHADCN_COMPONENT_BY_JOB.map(
    (row) =>
      `- **${row.job}** → ${row.components.map((c) => `\`${c}\``).join(", ")}${row.notes ? ` — _${row.notes}_` : ""}`,
  ).join("\n");

  return [
    "## shadcn/ui (APOP portal)",
    "",
    `- Registry config: \`${SHADCN_COMPONENTS_JSON}\` (style: new-york, RSC, Lucide).`,
    `- UI primitives directory: \`${SHADCN_UI_DIR}/\` — import alias \`@/components/ui/<name>\`.`,
    `- Utilities: \`${SHADCN_UTILS}\`.`,
    `- Add missing primitives: \`${SHADCN_CLI}\` then implement features using those imports.`,
    "",
    "### Currently installed",
    SHADCN_INSTALLED_COMPONENTS.map((c) => `- \`${c}\``).join("\n"),
    "",
    "### Component selection",
    jobs,
    "",
    "### Implementation rules",
    ...SHADCN_IMPLEMENTATION_RULES.map((r) => `- ${r}`),
    "",
    "Docs: https://ui.shadcn.com/docs",
  ].join("\n");
}

export function shadcnPortalBriefPlain(): string {
  return [
    `shadcn: config ${SHADCN_COMPONENTS_JSON}; UI dir ${SHADCN_UI_DIR}; add via ${SHADCN_CLI}.`,
    `Installed: ${SHADCN_INSTALLED_COMPONENTS.join(", ")}.`,
    ...SHADCN_IMPLEMENTATION_RULES,
  ].join(" ");
}
