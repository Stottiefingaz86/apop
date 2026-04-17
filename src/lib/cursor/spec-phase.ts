import { prisma } from "@/lib/prisma";
import { parseContextPack } from "@/lib/domain/context-pack";
import { getApopAppUrl } from "@/lib/tracking/env";
import { launchCursorCloudAgent } from "@/lib/cursor/cloud-agents";
import {
  getCursorBuildRef,
  getCursorBuildRepository,
  getCursorWebhookSecret,
} from "@/lib/cursor/env";

function buildSpecPhasePrompt(feature: {
  title: string;
  description: string | null;
  contextPack: unknown;
}): string {
  const pack = parseContextPack(feature.contextPack);
  const audience = pack.targetAudience ?? "end users";
  const productArea = pack.productArea ?? "";

  return [
    "# Spec-Kit: Create specification only (DO NOT implement)",
    "",
    "This repo has spec-kit installed. Run the following spec-kit phases and STOP.",
    "Do NOT run /speckit-implement. Do NOT write any application code.",
    "Only produce the spec-kit markdown artifacts.",
    "",
    "## Step 1: Run /speckit-specify with this brief",
    "",
    `Build a feature: **${feature.title}**`,
    "",
    feature.description || "(no description provided)",
    "",
    audience ? `Target audience: ${audience}` : "",
    productArea ? `Product area: ${productArea}` : "",
    "",
    "The application uses Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui.",
    "Images and data come from Supabase. The site is a sports betting / casino product.",
    "",
    "## Step 2: Run /speckit-plan",
    "",
    "Tech stack for the plan:",
    "- Next.js 15 App Router with TypeScript",
    "- Tailwind CSS + shadcn/ui components (under src/components/ui)",
    "- Supabase Postgres via Prisma ORM",
    "- Search the repo for existing components with the same UI pattern first",
    "",
    "## Step 3: Run /speckit-tasks",
    "",
    "Break the plan into ordered, actionable tasks.",
    "",
    "## STOP HERE",
    "",
    "After tasks are created, commit spec.md, plan.md, and tasks.md to the branch.",
    `Create a PR with title: [Spec] ${feature.title}.`,
    "Do NOT implement. Do NOT write application code. Only spec artifacts.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/**
 * Launches a Cursor Cloud agent to run spec-kit specify + plan + tasks (no implement).
 * Called from the approval flow (automatic) and the manual "Run Spec-Kit" button.
 * Returns the created CursorAgentJob or throws on failure.
 */
export async function launchSpecPhaseForFeature(featureId: string) {
  const feature = await prisma.feature.findUniqueOrThrow({ where: { id: featureId } });
  const repository = getCursorBuildRepository()!;
  const ref = getCursorBuildRef();
  const branchName = `apop-spec/${featureId.slice(0, 10)}-${Date.now().toString(36)}`;

  const promptText = buildSpecPhasePrompt(feature);

  const appUrl = getApopAppUrl();
  const webhookUrl =
    appUrl && !appUrl.includes("localhost")
      ? `${appUrl}/api/webhooks/cursor`
      : undefined;
  const webhookSecret = webhookUrl ? getCursorWebhookSecret() ?? undefined : undefined;

  const launched = await launchCursorCloudAgent({
    promptText,
    repository,
    ref,
    branchName,
    autoCreatePr: true,
    webhookUrl,
    webhookSecret,
  });

  if (!launched.ok) {
    throw new Error(launched.error ?? `Cursor Cloud returned ${launched.status}`);
  }

  const targetBranch = launched.agent.target?.branchName?.trim() || branchName;

  const job = await prisma.cursorAgentJob.create({
    data: {
      featureId,
      cursorAgentId: launched.agent.id,
      status: launched.agent.status ?? "CREATING",
      jobPhase: "spec",
      cursorSummary: launched.agent.summary?.trim() || null,
      agentUrl: launched.agent.target?.url ?? null,
      prUrl: launched.agent.target?.prUrl ?? null,
      targetBranch,
      autoDeploy: false,
    },
  });

  await prisma.feature.update({
    where: { id: featureId },
    data: { status: "running", stage: "PRD" },
  });

  console.log(
    `[spec-phase] launched spec agent for feature=${featureId} branch=${targetBranch} cursor=${launched.agent.id}`,
  );

  return job;
}
