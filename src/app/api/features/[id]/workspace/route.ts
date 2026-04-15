import { NextResponse } from "next/server";
import { getFeatureByIdSafe } from "@/lib/data/features";

/**
 * Full feature workspace snapshot as JSON — for client polling instead of `router.refresh()`
 * (avoids intermittent RSC / flight 500s in dev).
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { data, databaseAvailable } = await getFeatureByIdSafe(id);
  if (!databaseAvailable) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const payload = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  if (!payload.cursorAgentJobs) payload.cursorAgentJobs = [];
  return NextResponse.json(payload);
}
