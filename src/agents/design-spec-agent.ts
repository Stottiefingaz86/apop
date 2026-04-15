import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import { runDesignSpecEnhancementWithAnthropic } from "@/lib/llm/design-spec-anthropic";
import { runDesignSpecEnhancementWithOpenAI } from "@/lib/llm/design-spec-openai";
import { getApopDeliveryTarget } from "@/lib/domain/delivery-target";
import {
  SHADCN_INSTALLED_COMPONENTS,
  shadcnPortalBriefMarkdown,
  shadcnPortalBriefPlain,
} from "@/lib/ui-agent/shadcn-portal";

function designInputsHaveTokens(d: AgentContext["designInputs"]): boolean {
  const v = d.tokenJson;
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

/** When designers skip APOP forms, infer handoff from value + context pack + delivery repo layout. */
function inferredDesignHandoff(ctx: AgentContext, valueJson: Record<string, unknown>) {
  const d = ctx.designInputs;
  const cp = ctx.contextPack;
  const { repositoryWebUrl } = getApopDeliveryTarget();
  const audience = typeof valueJson.audience === "string" ? valueJson.audience.trim() : "";
  const priority =
    typeof valueJson.strategicPriority === "string" ? valueJson.strategicPriority.trim() : "";

  const brandFromForm = d.brandDescription?.trim() ?? "";
  const brand =
    brandFromForm ||
    [
      cp.designFramework?.trim() && `Design framework note: ${cp.designFramework.trim()}`,
      cp.constraints?.trim() && `Constraints: ${cp.constraints.trim()}`,
      `**Source of truth for visuals:** the delivery repo (${repositoryWebUrl}) — use existing Tailwind theme (\`src/app/globals.css\`), shadcn/ui under \`src/components/ui\`, and \`components.json\`. Match shipped patterns; do not invent a second token system.`,
    ]
      .filter(Boolean)
      .join("\n\n") ||
    `_Follow existing global styles and components in the delivery repository._`;

  const uxFromForm = d.uxDirection?.trim() ?? "";
  const ux =
    uxFromForm ||
    (priority ? `Align with strategic priority: ${priority}` : null) ||
    (cp.productArea?.trim()
      ? `UX consistent with product area: ${cp.productArea.trim()}`
      : null) ||
    (audience ? `Appropriate for audience: ${audience}` : null) ||
    "Practical, consistent with the live app shell and existing routes.";

  const tokensMd = designInputsHaveTokens(d)
    ? "`tokenJson` attached as structured data (see JSON artifact)."
    : `_No token JSON pasted in APOP — implementers read theme variables and Tailwind config from the **delivery repo** (\`globals.css\`, tailwind config, shadcn theme)._`;

  const tokenPrinciple = designInputsHaveTokens(d)
    ? "Respect supplied tokens for spacing, color, and type scales only."
    : "Use the delivery repo's existing Tailwind + shadcn theme only; do not add a parallel design system.";

  return { brand, ux, tokensMd, tokenPrinciple };
}

export const designSpecAgent: FeatureAgent = {
  name: "design-spec-agent",
  stages: ["DESIGN_SPEC"],
  async run(ctx): Promise<AgentRunResult> {
    const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
    if (!value?.contentJson || typeof value.contentJson !== "object") {
      return {
        kind: "questions",
        payload: {
          agent: "design-spec-agent",
          questions: [
            {
              id: "value_required",
              label: "Run value analysis first — design follows research",
              type: "textarea",
              required: true,
              reason: "Design aligns to the value / audience / KPI artifact",
            },
          ],
        },
      };
    }

    const d = ctx.designInputs;
    const valueJson = value.contentJson as Record<string, unknown>;
    const octalysis = (valueJson.octalysisProfile as Record<string, number> | undefined) ?? {};
    const inferred = inferredDesignHandoff(ctx, valueJson);

    const contentJson = {
      tokens: d.tokenJson,
      brand: d.brandDescription?.trim() ? d.brandDescription : inferred.brand,
      uxDirection: d.uxDirection?.trim() ? d.uxDirection : inferred.ux,
      brandSource: d.brandDescription?.trim() ? "design_inputs" : "inferred_delivery_repo",
      uxSource: d.uxDirection?.trim() ? "design_inputs" : "inferred_context",
      figmaUrl: d.figmaUrl,
      competitorUrls: d.competitorUrls ?? [],
      screenshots: d.screenshots ?? [],
      octalysisAlignment: Object.entries(octalysis).map(([drive, weight]) => ({
        drive,
        weight,
        uxImplication:
          weight >= 4
            ? "Surface patterns that reinforce this motivational drive."
            : "Keep neutral; avoid heavy mechanics unless product scope demands it.",
      })),
      layoutPrinciples: [
        inferred.tokenPrinciple,
        `Tone: ${d.uxDirection?.trim() ? d.uxDirection : inferred.ux}`,
        shadcnPortalBriefPlain(),
      ],
      shadcn: {
        componentsJson: "components.json",
        uiDirectory: "src/components/ui",
        installedComponents: [...SHADCN_INSTALLED_COMPONENTS],
        addCommand: "npx shadcn@latest add <component>",
        docsUrl: "https://ui.shadcn.com/docs",
      },
    };

    const md = [
      `# Design specification`,
      ``,
      `## Brand`,
      (d.brandDescription?.trim() ? d.brandDescription : inferred.brand) ?? "",
      ``,
      `## UX direction`,
      (d.uxDirection?.trim() ? d.uxDirection : inferred.ux) ?? "",
      ``,
      `## Tokens`,
      inferred.tokensMd,
      ``,
      `## Motivation alignment (inferred from value analysis)`,
      `_Drive weights come from value analysis (model-inferred), not from manual labeling._`,
      ...contentJson.octalysisAlignment.map(
        (o: { drive: string; weight: number; uxImplication: string }) =>
          `- **${o.drive.replace(/_/g, " ")}** (${o.weight}): ${o.uxImplication}`,
      ),
      d.figmaUrl ? `\n## Figma\n${d.figmaUrl}` : "",
      (d.competitorUrls?.length ?? 0) > 0
        ? `\n## References\n${d.competitorUrls!.join("\n")}`
        : "",
      "\n",
      shadcnPortalBriefMarkdown(),
    ].join("\n");

    const enhancement =
      (await runDesignSpecEnhancementWithOpenAI(
        ctx,
        md,
        contentJson as unknown as Record<string, unknown>,
      )) ??
      (await runDesignSpecEnhancementWithAnthropic(
        ctx,
        md,
        contentJson as unknown as Record<string, unknown>,
      ));

    const finalJson = enhancement
      ? { ...contentJson, llmAugmentation: enhancement.llm }
      : { ...contentJson, llmAugmentation: null };
    const finalMd = enhancement
      ? `${md}${enhancement.markdownAppendix}`
      : `${md}\n\n---\n_Base design spec from rules only — set \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` for an AI-written Cursor implementation narrative._`;

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.DESIGN_SPEC,
      contentJson: finalJson,
      contentMarkdown: finalMd,
      needsReview: true,
      /** Stay in Design until human approves; approval route then starts PRD. */
      nextStage: "DESIGN_SPEC",
    };
  },
};
