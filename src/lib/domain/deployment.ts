import type { Release } from "@prisma/client";

/**
 * A feature counts as shipped for roadmap / “Done — deployed” once we have a visitable hostname on a
 * non-failed release. Vercel often assigns the preview URL while Prisma `status` is still `building`.
 */
export function hasSuccessfulDeployment(
  releases: Pick<Release, "status" | "vercelUrl">[],
): boolean {
  return releases.some((r) => {
    if (!r.vercelUrl?.trim()) return false;
    if (r.status === "error" || r.status === "canceled") return false;
    return true;
  });
}
