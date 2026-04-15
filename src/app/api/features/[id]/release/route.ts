import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerFeatureVercelDeploy } from "@/lib/vercel/trigger-feature-deploy";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;
  await prisma.feature.findUniqueOrThrow({ where: { id: featureId } });

  const result = await triggerFeatureVercelDeploy(featureId);
  if (!result.ok) {
    const status = result.error.includes("not configured") ? 501 : 502;
    return NextResponse.json(
      { error: result.error, releaseId: result.releaseId },
      { status },
    );
  }

  const updated = await prisma.release.findUnique({ where: { id: result.releaseId } });
  return NextResponse.json({ release: updated });
}
