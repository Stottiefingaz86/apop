import type { FeatureAgent, AgentRunResult, AgentContext } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import { inferRoadmapLaneForPrd } from "@/lib/domain/roadmap-lane-infer";
import { runPrdWriterWithAnthropic } from "@/lib/llm/prd-writer-anthropic";
import { runPrdWriterWithOpenAI } from "@/lib/llm/prd-writer-openai";

function questions(): AgentQuestionsPayload {
  return {
    agent: "prd-writer-agent",
    questions: [
      {
        id: "design_spec_required",
        label: "Finish Design (tokens, brand, UX) and approve so a design spec artifact exists",
        type: "textarea",
        required: true,
        reason: "The Cursor prompt is generated from value research + design — not the other way around",
      },
    ],
  };
}

function buildTemplateCursorPrompt(ctx: AgentContext): {
  contentJson: Record<string, unknown>;
  contentMarkdown: string;
} {
  const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS)!;
  const design = ctx.artifactsByType.get(ARTIFACT_TYPES.DESIGN_SPEC)!;
  const v = value.contentJson as Record<string, unknown>;
  const d = design.contentJson as Record<string, unknown>;
  const cp = ctx.contextPack;

  const brand = typeof d.brand === "string" ? d.brand : "";
  const ux = typeof d.uxDirection === "string" ? d.uxDirection : "";
  const figma = typeof d.figmaUrl === "string" ? d.figmaUrl.trim() : "";

  const roadmapLane = inferRoadmapLaneForPrd(ctx);

  const contentJson = {
    title: ctx.feature.title,
    problem: ctx.feature.description,
    roadmapLane,
    goals: {
      primaryKpi: v.primaryKpi,
      secondaryKpis: v.secondaryKpis ?? cp.secondaryKpis ?? [],
    },
    users: v.audience,
    scope: {
      inScope: [cp.productArea ?? "Feature scope from context pack and value analysis"],
      outOfScope: ["Anything not implied by value + design below"],
    },
    useCases: [
      {
        id: "UC1",
        title: "Primary happy path",
        actor: String(v.audience),
        situation: "User lands on the relevant surface with a clear intent tied to this feature.",
        mainFlow: [
          "User opens the target page or section described in the feature.",
          "User completes the main interaction (tap, scroll, select) per design spec.",
          "System shows the expected content or state; no errors or dead ends.",
        ],
        expectedOutcome: "User achieves the outcome measured by the primary KPI without confusion.",
      },
      {
        id: "UC2",
        title: "Edge or constrained state",
        actor: String(v.audience),
        situation: "User hits a boundary case (empty data, slow load, partial permissions, or mobile viewport).",
        mainFlow: [
          "User triggers the edge condition while using the same feature.",
          "System surfaces a clear empty state, skeleton, or message aligned with brand voice.",
          "User can recover or understand next steps without breaking the layout.",
        ],
        expectedOutcome: "Experience degrades gracefully; no broken UI or silent failures.",
      },
    ],
    requirements: [
      {
        id: "C0",
        priority: "P0" as const,
        text: "Search the delivery repo for an existing component with the same UI pattern (e.g. another carousel, game rail, or promo strip). Reuse or extend it with props (title, items, variant) so styling matches siblings; do not add a parallel one-off with a different look.",
      },
      {
        id: "C1",
        priority: "P0" as const,
        text: `Implement for ${String(v.audience)}; optimize for ${String(v.primaryKpi)}.`,
      },
      {
        id: "C2",
        priority: "P0" as const,
        text: `Match design: ${brand.slice(0, 200)}${brand.length > 200 ? "…" : ""} · UX: ${ux.slice(0, 200)}${ux.length > 200 ? "…" : ""}`,
      },
      {
        id: "C3",
        priority: "P1" as const,
        text: "Next.js App Router + shadcn/ui (`src/components/ui`); add components via `npx shadcn@latest add`.",
      },
    ],
    successMetrics: [String(v.primaryKpi)],
    risks: cp.constraints ? [{ text: String(cp.constraints) }] : [],
    openQuestions: [] as string[],
    prdSource: "cursor_prompt_template",
    valueHypothesis:
      typeof v.summary === "string" ? String(v.summary).slice(0, 280) : "See value analysis artifact.",
    cursorHandoff: {
      implementationChecklist: [
        "Search `app/` and `src/components` for an existing block with the same pattern (carousel, scroller, grid, etc.); extend it if found.",
        "Implement UI and behavior end-to-end per design spec JSON + markdown.",
        "Use tokens from design inputs; do not invent a new palette.",
        "Lint + typecheck before PR; note in the PR summary which component you extended.",
      ],
      implementationTasks: [
        {
          id: "T1",
          title: "Search repo for existing analogous component",
          steps: [
            "Search `src/components` and `app/` for a carousel, rail, grid, or similar block.",
            "If one exists, note the file path — you will extend it in T2.",
            "If none, plan a new component under `src/components/`.",
          ],
          done: false as const,
        },
        {
          id: "T2",
          title: "Create or extend the UI component",
          steps: [
            "Build (or extend) the component per the design spec brand/UX/tokens above.",
            `Target audience: ${String(v.audience)}. Primary KPI: ${String(v.primaryKpi)}.`,
            "Use shadcn/ui primitives from `src/components/ui`. Match sibling styling.",
          ],
          done: false as const,
        },
        {
          id: "T3",
          title: "Wire component into the page route",
          steps: [
            "Import the component into the appropriate `app/` page.",
            "Pass real or mock data props; ensure server/client boundary is correct.",
          ],
          done: false as const,
        },
        {
          id: "T4",
          title: "Add journey map tracking",
          steps: [
            `Add \`data-apop-feature-id="${ctx.feature.id}"\` to the root element.`,
            "Fire impression event on mount and click events on interactions.",
          ],
          done: false as const,
        },
        {
          id: "T5",
          title: "Verify build",
          steps: [
            "Run `npm run build` and fix any TypeScript or lint errors.",
            "Confirm the component renders correctly at desktop and mobile widths.",
          ],
          done: false as const,
        },
      ],
      suggestedFilesOrRoutes: ["`app/` routes inferred from feature title / product area."],
      dependenciesNotes:
        "Align spacing, motion, and card chrome with sibling rails on the same surface (e.g. match an existing casino carousel if this is another themed carousel).",
    },
  };

  const md = [
    `# Cursor — ${ctx.feature.title}`,
    ``,
    `Use this as the implementation brief. Do not expand scope beyond what is here and the linked artifacts in APOP.`,
    ``,
    `## Product`,
    ctx.feature.description || "_No description._",
    ``,
    `## Value (why)`,
    `- **KPI:** ${String(v.primaryKpi)}`,
    `- **Audience:** ${String(v.audience)}`,
    ``,
    `## User cases`,
    ...((contentJson.useCases as { id: string; title: string }[]).map(
      (uc) => `- **${uc.id}** ${uc.title}`,
    )),
    ``,
    `## Design (how it should feel)`,
    `- **Brand:** ${brand || "_See design spec._"}`,
    `- **UX direction:** ${ux || "_See design spec._"}`,
    figma ? `- **Figma:** ${figma}` : "",
    `- **Tokens / structure:** see design spec artifact JSON (\`tokenJson\`, shadcn notes).`,
    ``,
    `## Build`,
    ...((contentJson.requirements as { id: string; priority: string; text: string }[]).map(
      (r) => `- **${r.id}** ${r.text}`,
    )),
    cp.constraints ? `\n## Constraints\n${cp.constraints}` : "",
    ``,
    `---`,
    `_Template build prompt (no LLM). Add API keys for an AI-tightened version._`,
  ]
    .filter(Boolean)
    .join("\n");

  return { contentJson, contentMarkdown: md };
}

export const prdWriterAgent: FeatureAgent = {
  name: "prd-writer-agent",
  stages: ["PRD"],
  async run(ctx): Promise<AgentRunResult> {
    const value = ctx.artifactsByType.get(ARTIFACT_TYPES.VALUE_ANALYSIS);
    if (!value?.contentJson || typeof value.contentJson !== "object") {
      return { kind: "questions", payload: questions() };
    }

    const v = value.contentJson as Record<string, unknown>;
    if (!v.primaryKpi || !v.audience) {
      return { kind: "questions", payload: questions() };
    }

    const design = ctx.artifactsByType.get(ARTIFACT_TYPES.DESIGN_SPEC);
    if (!design?.contentJson || typeof design.contentJson !== "object") {
      return { kind: "questions", payload: questions() };
    }

    const llm =
      (await runPrdWriterWithOpenAI(ctx)) ?? (await runPrdWriterWithAnthropic(ctx));
    if (llm) {
      return {
        kind: "artifact",
        type: ARTIFACT_TYPES.PRD,
        contentJson: llm.contentJson,
        contentMarkdown: llm.contentMarkdown,
        needsReview: true,
        /** Stay on Cursor prompt until human approves; approval route then moves to Ready for build. */
        nextStage: "PRD",
      };
    }

    const fallback = buildTemplateCursorPrompt(ctx);
    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.PRD,
      contentJson: fallback.contentJson,
      contentMarkdown: fallback.contentMarkdown,
      needsReview: true,
      nextStage: "PRD",
    };
  },
};
