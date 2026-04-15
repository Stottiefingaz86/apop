import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCursorWebhookSecret } from "@/lib/cursor/env";
import { syncLatestCursorJobForFeature } from "@/lib/cursor/sync-job";

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

  const { deployTriggered } = await syncLatestCursorJobForFeature(job.featureId);

  console.log(
    `[cursor-webhook] synced feature=${job.featureId} status=${payload.status} deploy=${deployTriggered}`,
  );

  return NextResponse.json({ ok: true, deployTriggered });
}
