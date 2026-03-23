import type { Prisma } from "@prisma/client";
import type { ContextPack } from "@/lib/domain/context-pack";

type AnswerMap = Record<string, string>;

function splitUrls(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Maps structured question answers into context pack and/or design fields.
 * Convention: question ids align with value/design agent question ids.
 */
export function mergeAnswersIntoStores(
  contextPack: ContextPack,
  answers: AnswerMap,
): {
  contextPatch: Prisma.InputJsonValue;
  designPatch: {
    tokenJson?: Prisma.InputJsonValue;
    brandDescription?: string;
    uxDirection?: string;
    figmaUrl?: string;
    competitorUrls?: Prisma.InputJsonValue;
  };
} {
  const next: ContextPack = { ...contextPack };
  const designPatch: {
    tokenJson?: Prisma.InputJsonValue;
    brandDescription?: string;
    uxDirection?: string;
    figmaUrl?: string;
    competitorUrls?: Prisma.InputJsonValue;
  } = {};

  const a = answers;

  if (a.product_area) next.productArea = a.product_area;
  if (a.target_audience) next.targetAudience = a.target_audience;
  if (a.primary_kpi) next.primaryKpi = a.primary_kpi;
  if (a.strategic_priority) next.strategicPriority = a.strategic_priority;
  if (a.octalysis_focus) {
    next.octalysisFocus = a.octalysis_focus
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (a.theme_tokens) {
    const raw = a.theme_tokens.trim();
    try {
      designPatch.tokenJson = JSON.parse(raw) as Prisma.InputJsonValue;
    } catch {
      designPatch.tokenJson = raw;
    }
  }
  if (a.brand_system) designPatch.brandDescription = a.brand_system;
  if (a.ux_direction) designPatch.uxDirection = a.ux_direction;
  if (a.figma) designPatch.figmaUrl = a.figma;
  if (a.competitors) designPatch.competitorUrls = splitUrls(a.competitors);

  return { contextPatch: next as Prisma.InputJsonValue, designPatch };
}
