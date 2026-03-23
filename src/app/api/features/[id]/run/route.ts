import { NextResponse } from "next/server";
import { z } from "zod";
import { FeatureStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueFeatureRun } from "@/jobs/queue";
import type { AgentName } from "@/agents/types";

const bodySchema = z.object({
  stage: z.nativeEnum(FeatureStage).optional(),
});

const AGENT_NAMES: AgentName[] = [
  "value-analyst-agent",
  "prd-writer-agent",
  "design-spec-agent",
  "build-agent",
  "qa-agent",
];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const feature = await prisma.feature.findUnique({ where: { id } });
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const runnable = new Set([
    "idle",
    "queued",
    "awaiting_review",
    "approved",
    "awaiting_input",
  ]);
  if (!runnable.has(feature.status)) {
    return NextResponse.json(
      { error: `Cannot start run from status ${feature.status}` },
      { status: 409 },
    );
  }

  const stage = parsed.data.stage ?? feature.stage;

  const agentOverride = (json as { agentName?: string }).agentName;
  const agentNameOverride =
    agentOverride && AGENT_NAMES.includes(agentOverride as AgentName)
      ? (agentOverride as AgentName)
      : undefined;

  await prisma.feature.update({
    where: { id },
    data: { status: "running" },
  });

  try {
    const { runId } = await enqueueFeatureRun({
      featureId: id,
      stage,
      agentNameOverride,
    });
    const updated = await prisma.feature.findUnique({ where: { id } });
    return NextResponse.json({ runId, feature: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Run failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
