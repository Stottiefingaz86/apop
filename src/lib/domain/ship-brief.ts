import type { ContextPack } from "@/lib/domain/context-pack";
import { getApopDeliveryTarget } from "@/lib/domain/delivery-target";

export type ShipBriefArtifactInput = {
  contentMarkdown: string | null;
  contentJson?: unknown;
};

export type ShipBriefDeploymentInput = {
  previewUrl?: string | null;
  vercelUrl?: string | null;
  releaseStatus?: string | null;
};

function orPending(text: string | null | undefined, label: string): string {
  const t = text?.trim();
  if (t) return t;
  return `> **Waiting on pipeline** · Run the **${label}** stage so this block fills in.\n`;
}

/**
 * Prefer markdown; if empty, synthesize a short excerpt from structured JSON so Ship PRD / previews are never blank.
 */
function artifactBodyWithJsonFallback(
  art: ShipBriefArtifactInput | null | undefined,
  stageLabel: string,
  jsonExcerpt: ((j: Record<string, unknown>) => string | null) | null,
): string {
  const md = art?.contentMarkdown?.trim();
  if (md) return md;
  const j =
    art?.contentJson && typeof art.contentJson === "object"
      ? (art.contentJson as Record<string, unknown>)
      : null;
  if (j && jsonExcerpt) {
    const ex = jsonExcerpt(j)?.trim();
    if (ex) {
      return `_Markdown body was empty — excerpt from **${stageLabel}** structured data:_\n\n${ex}`;
    }
  }
  return orPending(undefined, stageLabel);
}

function stripLeadingH1(md: string): string {
  return md.replace(/^#\s+[^\n]+\n+/, "").trim();
}

/** Remove API provider footers and heuristic notes that clutter the PRD. */
function stripApiProviderFooters(md: string): string {
  return md
    .replace(
      /\n\n---\n_Value analysis generated via \*\*OpenAI API\*\*[\s\S]*?\._/g,
      "",
    )
    .replace(
      /\n\n---\n_Value analysis generated via \*\*Anthropic API\*\*[\s\S]*?\._/g,
      "",
    )
    .replace(/\n\n---\n_Heuristic value analysis[\s\S]*?\._/g, "")
    .replace(/\n*> \*\*Not ChatGPT \/ API:\*\*[^\n]*(?:\n> [^\n]*)*/g, "")
    .trim();
}

function buildCursorPromptPlain(opts: {
  title: string;
  description: string;
  contextPack: ContextPack;
  prdJson: Record<string, unknown> | null;
  designSummary: { brand: string | null; ux: string | null; figma: string | null };
  designJson: Record<string, unknown> | null;
  delivery: { repositoryWebUrl: string; productionUrl: string };
}): string {
  const { title, description, contextPack, prdJson, designSummary, designJson, delivery } = opts;
  const lane = prdJson?.roadmapLane ?? contextPack.productArea ?? "—";
  const audience = contextPack.targetAudience ?? (typeof prdJson?.users === "string" ? prdJson.users : "—");
  const roadmapLine = [lane, audience].filter((x) => x && x !== "—").length
    ? `Roadmap lane: ${String(lane)}. Audience: ${String(audience)}.`
    : "";

  const lines: string[] = [
    "You are implementing a scoped feature in our Next.js (App Router) codebase.",
    "",
    "## Where this ships",
    `- **Repository:** ${delivery.repositoryWebUrl}`,
    `- **Production:** ${delivery.productionUrl}`,
    "",
    "## Feature",
    `**${title}**`,
    description || "(none)",
    roadmapLine ? ["", roadmapLine] : [],
    "",
    "## Requirements",
  ].flat();

  const reqs = prdJson?.requirements;
  if (Array.isArray(reqs) && reqs.length > 0) {
    for (const r of reqs) {
      if (r && typeof r === "object" && "text" in r) {
        lines.push(`- ${String((r as { text?: string }).text ?? r)}`);
      }
    }
  } else {
    lines.push(
      "_Use the PRD artifact in APOP for full requirements; implement what is described there._",
    );
  }

  const ucs = prdJson?.useCases;
  if (Array.isArray(ucs) && ucs.length > 0) {
    const titles = ucs
      .filter((raw): raw is Record<string, unknown> => raw != null && typeof raw === "object")
      .map((u) => (typeof u.title === "string" ? u.title : "").trim())
      .filter(Boolean);
    if (titles.length) lines.push("", "Use cases:", ...titles.map((t) => `- ${t}`));
  }

  const ch = prdJson?.cursorHandoff;
  if (ch && typeof ch === "object") {
    const handoff = ch as Record<string, unknown>;

    const tasks = handoff.implementationTasks;
    if (Array.isArray(tasks) && tasks.length > 0) {
      lines.push("", "## Tasks (execute in order)");
      for (const raw of tasks) {
        if (!raw || typeof raw !== "object") continue;
        const t = raw as Record<string, unknown>;
        lines.push(`### ${String(t.id ?? "")}: ${String(t.title ?? "")}`);
        if (typeof t.file === "string" && t.file.trim()) lines.push(`File: \`${t.file.trim()}\``);
        const steps = Array.isArray(t.steps) ? t.steps : [];
        for (let i = 0; i < steps.length; i++) lines.push(`${i + 1}. ${String(steps[i])}`);
        lines.push("");
      }
    } else {
      const checklist = handoff.implementationChecklist;
      if (Array.isArray(checklist) && checklist.length > 0) {
        lines.push("", "Checklist:", ...checklist.map((x) => `- [ ] ${String(x)}`));
      }
    }
    const routes = handoff.suggestedFilesOrRoutes;
    if (Array.isArray(routes) && routes.length > 0) {
      lines.push("", "Routes:", ...routes.map((x) => `- ${String(x)}`));
    }
    const deps = handoff.dependenciesNotes;
    if (typeof deps === "string" && deps.trim()) lines.push("", deps.trim());
  }

  const designParts: string[] = [];
  if (designSummary.brand) designParts.push(designSummary.brand);
  if (designSummary.ux) designParts.push(designSummary.ux);
  if (designSummary.figma) designParts.push(designSummary.figma);
  const aug = designJson?.llmAugmentation;
  if (aug && typeof aug === "object") {
    const nar = (aug as Record<string, unknown>).cursorImplementationNarrative;
    if (typeof nar === "string" && nar.trim()) designParts.push(nar.trim());
    const rva = (aug as Record<string, unknown>).roadmapValueAngle;
    if (typeof rva === "string" && rva.trim()) designParts.push(rva.trim());
  }
  if (designParts.length) lines.push("", "Design:", ...designParts.map((p) => `- ${p}`));

  lines.push(
    "",
    "Reuse: search repo for similar UI (carousel, rail, grid); extend existing components. shadcn/ui under src/components/ui. Lint before PR.",
  );

  return lines.filter(Boolean).join("\n");
}

export type ComposeShipBriefResult = {
  markdown: string;
  cursorPromptPlain: string;
  contentJson: Record<string, unknown>;
};

/**
 * Single document for human sign-off: idea, value, PRD, design, Cursor prompt, deployment shell.
 * Deployment URLs are merged live in the UI via `formatDeploymentSection`.
 */
export function composeShipBriefCore(opts: {
  featureTitle: string;
  featureDescription: string | null;
  contextPack: ContextPack;
  value?: ShipBriefArtifactInput | null;
  prd?: ShipBriefArtifactInput | null;
  design?: ShipBriefArtifactInput | null;
}): ComposeShipBriefResult {
  const valueBodyRaw = artifactBodyWithJsonFallback(opts.value, "Value analysis", (j) =>
    typeof j.summary === "string" ? j.summary : null,
  );
  const valueBody = stripApiProviderFooters(valueBodyRaw);
  const designBody = artifactBodyWithJsonFallback(opts.design, "Design", (j) => {
    const parts: string[] = [];
    if (typeof j.brand === "string" && j.brand.trim()) parts.push(`**Brand:** ${j.brand.trim()}`);
    if (typeof j.uxDirection === "string" && j.uxDirection.trim()) {
      parts.push(`**UX direction:** ${j.uxDirection.trim()}`);
    }
    const llm = j.llmAugmentation;
    if (llm && typeof llm === "object" && llm !== null) {
      const nar = (llm as Record<string, unknown>).cursorImplementationNarrative;
      if (typeof nar === "string" && nar.trim()) {
        parts.push(`**Implementation narrative:**\n\n${nar.trim()}`);
      }
    }
    return parts.length ? parts.join("\n\n") : null;
  });
  const prdBody = artifactBodyWithJsonFallback(opts.prd, "Cursor prompt", (j) => {
    const title = typeof j.title === "string" ? j.title.trim() : "";
    const problem = typeof j.problem === "string" ? j.problem.trim() : "";
    const parts: string[] = [];
    if (title) parts.push(`**${title}**`);
    if (problem) parts.push(problem);
    const ucRaw = j.useCases;
    if (Array.isArray(ucRaw) && ucRaw.length > 0) {
      const ucLines = ucRaw
        .map((x) => {
          if (!x || typeof x !== "object") return "";
          const u = x as Record<string, unknown>;
          const id = typeof u.id === "string" ? u.id : "";
          const ut = typeof u.title === "string" ? u.title : "";
          return [id, ut].filter(Boolean).join(": ");
        })
        .filter(Boolean);
      if (ucLines.length) {
        parts.push(`**User cases:** ${ucLines.join("; ")}`);
      }
    }
    return parts.length ? parts.join("\n\n") : null;
  });

  const prdJson =
    opts.prd?.contentJson && typeof opts.prd.contentJson === "object"
      ? (opts.prd.contentJson as Record<string, unknown>)
      : null;

  const designJson =
    opts.design?.contentJson && typeof opts.design.contentJson === "object"
      ? (opts.design.contentJson as Record<string, unknown>)
      : null;

  const designSummary = {
    brand: typeof designJson?.brand === "string" ? designJson.brand : null,
    ux: typeof designJson?.uxDirection === "string" ? designJson.uxDirection : null,
    figma: typeof designJson?.figmaUrl === "string" ? designJson.figmaUrl : null,
  };

  const delivery = getApopDeliveryTarget();

  const cursorPromptPlain = buildCursorPromptPlain({
    title: opts.featureTitle,
    description: opts.featureDescription?.trim() ?? "",
    contextPack: opts.contextPack,
    prdJson,
    designSummary,
    designJson,
    delivery,
  });

  const ideaBlock =
    opts.featureDescription?.trim() ||
    "> **Add a short description** on this feature — it is the north star for agents and builders.\n";

  const shipReadyForImplementation =
    !!(opts.value?.contentMarkdown?.trim()) &&
    !!(opts.prd?.contentMarkdown?.trim()) &&
    !!(opts.design?.contentMarkdown?.trim());

  const implementationMd = shipReadyForImplementation
    ? [
        "## Implementation",
        "The pipeline is complete through design. Use **Start Cursor agent** in this workspace to launch a [Cursor Cloud Agent](https://cursor.com/docs/background-agent/api/endpoints) on the delivery repo — the full Ship PRD is sent automatically.",
        "",
      ].join("\n")
    : [
        "## Implementation",
        "> **Locked until the pipeline is complete.** Approve **Value**, **Design**, then the **Cursor prompt** so each block above is filled. After the card reaches **Ready for build**, **Start Cursor agent** appears here.",
        "",
      ].join("\n");

  const markdown = [
    `# Ship PRD: ${opts.featureTitle}`,
    "",
    "## Delivery target",
    `- **Repository (site-apop):** [${delivery.repositoryWebUrl.replace(/^https?:\/\//, "")}](${delivery.repositoryWebUrl})`,
    `- **Production:** [${delivery.productionUrl.replace(/^https?:\/\//, "")}](${delivery.productionUrl})`,
    "",
    "## Idea",
    ideaBlock,
    "",
    "## Value",
    stripLeadingH1(valueBody),
    "",
    "## Design",
    stripLeadingH1(designBody),
    "",
    "## Cursor prompt (implementation brief)",
    stripLeadingH1(prdBody),
    "",
    implementationMd,
  ].join("\n");

  const contentJson: Record<string, unknown> = {
    kind: "ship_brief",
    featureTitle: opts.featureTitle,
    cursorPromptPlain,
    deliveryRepository: delivery.repositoryWebUrl,
    deliveryProductionUrl: delivery.productionUrl,
    hasValue: !!(opts.value?.contentMarkdown?.trim()),
    hasPrd: !!(opts.prd?.contentMarkdown?.trim()),
    hasDesign: !!(opts.design?.contentMarkdown?.trim()),
    shipReadyForImplementation,
  };

  return { markdown, cursorPromptPlain, contentJson };
}

/** Short markdown for the workspace card; full composed doc opens in a dialog. */
export function composeShipBriefSummaryMarkdown(opts: {
  featureTitle: string;
  featureDescription: string | null;
  value?: ShipBriefArtifactInput | null;
  prd?: ShipBriefArtifactInput | null;
  design?: ShipBriefArtifactInput | null;
}): string {
  const hasValue = !!(opts.value?.contentMarkdown?.trim());
  const hasPrd = !!(opts.prd?.contentMarkdown?.trim());
  const hasDesign = !!(opts.design?.contentMarkdown?.trim());
  const idea = opts.featureDescription?.trim() || "_Add a short description on the feature._";
  const preview = idea.length > 240 ? `${idea.slice(0, 237)}…` : idea;

  return [
    `### ${opts.featureTitle}`,
    "",
    "**Idea**",
    preview,
    "",
    "**Pipeline**",
    `- Value: ${hasValue ? "Ready" : "Pending"}`,
    `- Design: ${hasDesign ? "Ready" : "Pending"}`,
    `- Cursor prompt: ${hasPrd ? "Ready" : "Pending"}`,
  ].join("\n");
}

export function formatDeploymentSection(d: ShipBriefDeploymentInput): string {
  const { repositoryWebUrl, productionUrl } = getApopDeliveryTarget();
  const preview = d.previewUrl?.trim();
  const vercel = d.vercelUrl?.trim();
  const status = d.releaseStatus?.trim();

  const lines = [
    "## Deployment",
    "",
    `- **Git:** ${repositoryWebUrl}`,
    `- **Production:** ${productionUrl}`,
    "- **Hosting:** Vercel — use **Deploy** in APOP or auto-deploy after Cursor when configured.",
    preview
      ? `- **Extra preview link (context pack):** ${preview}`
      : "- **Extra preview (context pack):** _Optional `previewUrl` for branch / staging links._",
    vercel
      ? `- **Latest deploy from APOP:** ${vercel}`
      : "- **Latest deploy from APOP:** _None recorded yet._",
    status ? `- **Release status:** ${status}` : "",
    "",
  ].filter(Boolean);

  return lines.join("\n");
}
