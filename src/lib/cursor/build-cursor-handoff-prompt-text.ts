import type { ComposeShipBriefResult } from "@/lib/domain/ship-brief";
import { cursorPromptReferenceImagesPreamble } from "@/lib/cursor/cursor-prompt-images";

/**
 * When the PRD has spec-kit source files, use speckit-implement.
 * Otherwise fall back to the standard APOP implementation prompt.
 */
function buildIntro(prdJson: Record<string, unknown> | null): string {
  if (prdJson?.specKitSource) {
    return [
      "# Implement this feature using spec-kit",
      "",
      "This repo has spec-kit installed. The spec, plan, and tasks were already created",
      "in a previous spec-kit run and exist in the repo (or in this branch).",
      "",
      "Run the `speckit-implement` skill to execute all tasks from the existing tasks.md.",
      "Do NOT re-specify or re-plan. Just implement.",
      "",
      "After implementation, run `npm run build` and fix any errors before opening the PR.",
      "",
    ].join("\n");
  }

  return [
    "# Implement this feature",
    "",
    "Execute the tasks below. Do NOT re-plan or re-specify — the spec, plan, and tasks",
    "were already produced by APOP's research pipeline. Jump straight to implementation.",
    "",
    "Search the repo for similar UI first; extend existing components. Next.js App Router, shadcn/ui.",
    "Run `npm run build` when done and fix any errors before opening the PR.",
    "",
  ].join("\n");
}

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
 * Text body sent to Cursor Cloud for the build phase.
 * If the PRD was created by spec-kit (spec phase), tells Cursor to run speckit-implement.
 * Otherwise sends the standard APOP implementation brief.
 */
export function buildCursorHandoffPromptText(
  ship: ComposeShipBriefResult,
  opts?: { featureId?: string; apopAppUrl?: string; prdJson?: Record<string, unknown> | null },
): string {
  const intro = buildIntro(opts?.prdJson ?? null);
  const parts = [intro, ship.cursorPromptPlain];
  if (opts?.featureId && opts?.apopAppUrl) {
    parts.push(journeyMapTrackingSection(opts.featureId, opts.apopAppUrl));
  }
  return parts.join("\n");
}

/** Full string including the reference-screenshot preamble when images are attached. */
export function buildCursorHandoffPromptWithPreamble(
  ship: ComposeShipBriefResult,
  referenceImageCount: number,
  opts?: { featureId?: string; apopAppUrl?: string; prdJson?: Record<string, unknown> | null },
): string {
  return (
    cursorPromptReferenceImagesPreamble(referenceImageCount) +
    buildCursorHandoffPromptText(ship, opts)
  );
}
