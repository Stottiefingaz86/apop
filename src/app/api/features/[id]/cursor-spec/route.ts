import { NextResponse } from "next/server";
import { isCursorBuildConfigured } from "@/lib/cursor/env";
import { launchSpecPhaseForFeature } from "@/lib/cursor/spec-phase";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;
  if (!isCursorBuildConfigured()) {
    return NextResponse.json(
      { error: "Cursor Cloud not configured. Set CURSOR_API_KEY and CURSOR_BUILD_REPOSITORY in .env." },
      { status: 501 },
    );
  }

  const feature = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const job = await launchSpecPhaseForFeature(featureId);
    return NextResponse.json({
      job: {
        id: job.id,
        cursorAgentId: job.cursorAgentId,
        status: job.status,
        jobPhase: job.jobPhase,
        agentUrl: job.agentUrl,
        targetBranch: job.targetBranch,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spec launch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
