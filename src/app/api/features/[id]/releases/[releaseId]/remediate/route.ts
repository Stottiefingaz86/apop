import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeDeploymentFixRun } from "@/jobs/execute-deployment-fix";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; releaseId: string }> }) {
  const { id: featureId, releaseId } = await ctx.params;
  const release = await prisma.release.findFirst({
    where: { id: releaseId, featureId },
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }
  if (!release.vercelDeploymentId) {
    return NextResponse.json(
      { error: "Release has no Vercel deployment id yet — wait for attach or refresh." },
      { status: 409 },
    );
  }

  try {
    const { runId } = await executeDeploymentFixRun({ featureId, releaseId });
    const updated = await prisma.feature.findUnique({ where: { id: featureId } });
    return NextResponse.json({ runId, feature: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Remediation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
