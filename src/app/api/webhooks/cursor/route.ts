import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCursorWebhookSecret } from "@/lib/cursor/env";
import { syncLatestCursorJobForFeature } from "@/lib/cursor/sync-job";
import { isCursorAgentSucceeded } from "@/lib/cursor/agent-status";
import { fetchSpecKitFilesFromBranch } from "@/lib/cursor/fetch-spec-files";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

type CursorWebhookPayload = {
  event: string;
  timestamp?: string;
  id: string;
  status?: string;
  source?: { repository?: string; ref?: string };
  target?: {
    url?: string;
    branchName?: string;
    prUrl?: string;
  };
  summary?: string;
};

function verifySignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * When a spec-phase Cursor Cloud job finishes, fetch the spec-kit md files
 * from the branch and store them as the PRD artifact on the feature.
 */
async function handleSpecPhaseCompletion(job: {
  id: string;
  featureId: string;
  targetBranch: string | null;
  prUrl: string | null;
}, payload: CursorWebhookPayload) {
  const branch = payload.target?.branchName?.trim() || job.targetBranch?.trim();
  if (!branch) {
    console.warn("[cursor-webhook] spec phase done but no branch to fetch from");
    return;
  }

  console.log(`[cursor-webhook] spec phase complete — fetching spec-kit files from branch ${branch}`);

  const files = await fetchSpecKitFilesFromBranch(branch);

  const specMd = files.spec?.trim() || null;
  const planMd = files.plan?.trim() || null;
  const tasksMd = files.tasks?.trim() || null;
  const reqMd = files.requirements?.trim() || null;
  const resMd = files.research?.trim() || null;

  if (!specMd && !planMd && !tasksMd) {
    console.warn("[cursor-webhook] no spec-kit files found on branch — agent may not have created them");
    await prisma.cursorAgentJob.update({
      where: { id: job.id },
      data: {
        errorMessage: "Spec phase finished but no spec.md/plan.md/tasks.md found on the branch. Check the Cursor agent dashboard.",
      },
    });
    return;
  }

  const combinedMarkdown = [
    specMd ? `# Specification\n\n${specMd}` : null,
    reqMd ? `# Requirements\n\n${reqMd}` : null,
    resMd ? `# Research\n\n${resMd}` : null,
    planMd ? `# Plan\n\n${planMd}` : null,
    tasksMd ? `# Tasks\n\n${tasksMd}` : null,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const contentJson = {
    specKitSource: true,
    branch,
    prUrl: payload.target?.prUrl || job.prUrl || null,
    spec: specMd,
    plan: planMd,
    tasks: tasksMd,
    requirements: reqMd,
    research: resMd,
    fetchedAt: new Date().toISOString(),
  };

  const existing = await prisma.artifact.findFirst({
    where: { featureId: job.featureId, type: ARTIFACT_TYPES.PRD },
    orderBy: { version: "desc" },
  });

  const nextVersion = (existing?.version ?? 0) + 1;

  await prisma.artifact.create({
    data: {
      featureId: job.featureId,
      stage: "PRD",
      type: ARTIFACT_TYPES.PRD,
      version: nextVersion,
      contentMarkdown: combinedMarkdown,
      contentJson,
    },
  });

  await prisma.feature.update({
    where: { id: job.featureId },
    data: { status: "awaiting_review", stage: "PRD" },
  });

  console.log(
    `[cursor-webhook] spec-kit PRD artifact created for feature=${job.featureId} (v${nextVersion}): ` +
    `spec=${!!specMd} plan=${!!planMd} tasks=${!!tasksMd}`,
  );
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = getCursorWebhookSecret();
  const sig = req.headers.get("x-webhook-signature");

  if (secret) {
    if (!verifySignature(secret, raw, sig)) {
      console.warn("[cursor-webhook] invalid signature — rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: CursorWebhookPayload;
  try {
    payload = JSON.parse(raw) as CursorWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.id || payload.event !== "statusChange") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  console.log(
    `[cursor-webhook] ${payload.event} → agent=${payload.id} status=${payload.status ?? "?"}`,
  );

  const job = await prisma.cursorAgentJob.findUnique({
    where: { cursorAgentId: payload.id },
  });

  if (!job) {
    console.warn(`[cursor-webhook] no local job for cursorAgentId=${payload.id}`);
    return NextResponse.json({ ok: true, unknown: true });
  }

  await prisma.cursorAgentJob.update({
    where: { id: job.id },
    data: {
      status: payload.status ?? undefined,
      cursorSummary: payload.summary?.trim() || undefined,
      agentUrl: payload.target?.url ?? undefined,
      prUrl: payload.target?.prUrl ?? undefined,
      ...(payload.target?.branchName?.trim()
        ? { targetBranch: payload.target.branchName.trim() }
        : {}),
    },
  });

  if (job.jobPhase === "spec" && isCursorAgentSucceeded(payload.status)) {
    await handleSpecPhaseCompletion(job, payload);
  }

  const { deployTriggered } = await syncLatestCursorJobForFeature(job.featureId);

  console.log(
    `[cursor-webhook] synced feature=${job.featureId} phase=${job.jobPhase} status=${payload.status} deploy=${deployTriggered}`,
  );

  return NextResponse.json({ ok: true, deployTriggered, phase: job.jobPhase });
}
