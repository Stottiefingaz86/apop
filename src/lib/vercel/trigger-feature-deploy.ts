import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVercelDeployHookUrl } from "@/lib/vercel/env";
import {
  attachLatestDeploymentToRelease,
  refreshReleaseFromVercel,
} from "@/lib/vercel/release-sync";

export type TriggerFeatureDeployResult =
  | { ok: true; releaseId: string }
  | { ok: false; error: string; releaseId?: string };

/**
 * Creates a Release row and POSTs the Vercel deploy hook. Best-effort attach deployment id after.
 */
export async function triggerFeatureVercelDeploy(
  featureId: string,
): Promise<TriggerFeatureDeployResult> {
  const hook = getVercelDeployHookUrl();
  if (!hook) {
    return {
      ok: false,
      error:
        "No Vercel deploy hook URL — set VERCEL_PRODUCTION_DEPLOY_HOOK_URL or VERCEL_DEPLOY_HOOK_URL in .env (Vercel → Project → Settings → Git → Deploy Hooks).",
    };
  }

  const release = await prisma.release.create({
    data: { featureId, status: "building" },
  });

  const hookRes = await fetch(hook, { method: "POST" });
  if (!hookRes.ok) {
    const text = await hookRes.text();
    await prisma.release.update({
      where: { id: release.id },
      data: {
        status: "error",
        errorMessage: `Deploy hook HTTP ${hookRes.status}: ${text.slice(0, 4000)}`,
      },
    });
    return { ok: false, error: "Deploy hook request failed", releaseId: release.id };
  }

  after(async () => {
    for (let i = 0; i < 30; i++) {
      await attachLatestDeploymentToRelease(release.id);
      const r = await prisma.release.findUnique({ where: { id: release.id } });
      if (r?.vercelDeploymentId) {
        await refreshReleaseFromVercel(r);
        const updated = await prisma.release.findUnique({ where: { id: release.id } });
        if (updated?.vercelUrl?.trim()) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  });

  return { ok: true, releaseId: release.id };
}
