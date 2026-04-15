import type { ComposeShipBriefResult } from "@/lib/domain/ship-brief";
import { cursorPromptReferenceImagesPreamble } from "@/lib/cursor/cursor-prompt-images";

const CURSOR_INTRO = [
  "# Implement this feature",
  "",
  "Execute the tasks below. Do NOT re-plan or re-specify — the spec, plan, and tasks",
  "were already produced by APOP's research pipeline. Jump straight to implementation.",
  "",
  "Search the repo for similar UI first; extend existing components. Next.js App Router, shadcn/ui.",
  "Run `npm run build` when done and fix any errors before opening the PR.",
  "",
].join("\n");

function journeyMapTrackingSection(featureId: string, apopAppUrl: string): string {
  const base = apopAppUrl.replace(/\/$/, "");
  const endpoint = `${base}/api/tracking/events`;
  return [
    "",
    "## Journey map tracking (required)",
    `The site has a journey map at /journey-map that tracks clicks and impressions. Add tracking so APOP roadmap cards show live performance.`,
    "",
    "1. Add data-apop-feature-id to the root element of every new component/block you create:",
    `   \`data-apop-feature-id="${featureId}"\``,
    "",
    "2. Ensure the journey map (or your tracking layer) sends events to APOP:",
    `   POST ${endpoint}`,
    "   Body: { events: [{ featureId, eventType: \"impression\"|\"click\", route?, elementId? }] }",
    "",
    "3. Call this on component mount (impression) and on click handlers. Route = pathname; elementId = optional target id.",
  ].join("\n");
}

/**
 * Text body sent to Cursor Cloud (before optional image preamble).
 * Lean implementation-only prompt — spec/plan/tasks already done by APOP agents.
 */
export function buildCursorHandoffPromptText(
  ship: ComposeShipBriefResult,
  opts?: { featureId?: string; apopAppUrl?: string },
): string {
  const parts = [CURSOR_INTRO, ship.cursorPromptPlain];
  if (opts?.featureId && opts?.apopAppUrl) {
    parts.push(journeyMapTrackingSection(opts.featureId, opts.apopAppUrl));
  }
  return parts.join("\n");
}

/** Full string including the reference-screenshot preamble when images are attached. */
export function buildCursorHandoffPromptWithPreamble(
  ship: ComposeShipBriefResult,
  referenceImageCount: number,
  opts?: { featureId?: string; apopAppUrl?: string },
): string {
  return (
    cursorPromptReferenceImagesPreamble(referenceImageCount) +
    buildCursorHandoffPromptText(ship, opts)
  );
}
