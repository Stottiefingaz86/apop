import { NextResponse } from "next/server";
import { FeatureStage } from "@prisma/client";
import { emptyPipelineBoardColumns, getPipelineBoardState } from "@/lib/data/pipeline-board";
import { isCursorBuildConfigured } from "@/lib/cursor/env";

/**
 * JSON snapshot of the pipeline board for client polling.
 * Always returns 200 with a JSON body so a failed parse never takes down the page shell.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const stageRaw = searchParams.get("stage");
    const stage =
      stageRaw && (Object.values(FeatureStage) as string[]).includes(stageRaw)
        ? (stageRaw as FeatureStage)
        : undefined;
    const syncCursor =
      searchParams.get("syncCursor") === "1" || searchParams.get("syncCursor") === "true";
    const state = await getPipelineBoardState({ q, stage, syncCursorJobs: syncCursor });
    return NextResponse.json(state);
  } catch (e) {
    console.error("[api/pipeline/board]", e);
    return NextResponse.json(
      {
        initialColumns: emptyPipelineBoardColumns(),
        boardKey: `fatal:${Date.now()}`,
        agentRunning: false,
        hasPipelineActivity: false,
        humanNeedsAttention: false,
        databaseAvailable: false,
        boardBuildError: e instanceof Error ? e.message : "Board API failed",
        cursorBuildConfigured: isCursorBuildConfigured(),
      },
      { status: 200 },
    );
  }
}
