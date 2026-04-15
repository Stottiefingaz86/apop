import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVercelProjectId } from "@/lib/vercel/env";
import {
  attachLatestDeploymentToRelease,
  refreshReleaseFromVercel,
} from "@/lib/vercel/release-sync";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;
  await prisma.feature.findUniqueOrThrow({ where: { id: featureId } });

  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "1";

  let releases = await prisma.release.findMany({
    where: { featureId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  if (!refresh || releases.length === 0) {
    return NextResponse.json(releases);
  }

  let latest = releases[0];
  if (!latest.vercelDeploymentId && getVercelProjectId()) {
    await attachLatestDeploymentToRelease(latest.id);
    releases = await prisma.release.findMany({
      where: { featureId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    latest = releases[0];
  }

  if (!latest?.vercelDeploymentId) {
    return NextResponse.json(releases);
  }

  try {
    const refreshed = await refreshReleaseFromVercel(latest);
    const rest = releases.slice(1).filter((r) => r.id !== refreshed.id);
    return NextResponse.json([refreshed, ...rest]);
  } catch {
    return NextResponse.json(releases);
  }
}
