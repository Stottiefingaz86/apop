import Link from "next/link";
import { FeatureStage } from "@prisma/client";
import { pickQueryString } from "@/lib/app-search-params";
import {
  getPipelineBoardState,
  sanitizePipelineColumnsForClient,
} from "@/lib/data/pipeline-board";
import { FEATURE_STAGE_LABEL, PIPELINE_STAGE_SELECT_ORDER } from "@/lib/domain/stages";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PipelineClientSection } from "@/components/pipeline-client-section";
import { PipelineKanbanBoard } from "@/components/pipeline-kanban-board";
import { PipelinePageHeader } from "@/components/pipeline-page-header";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const sp = await searchParams;
    const q = pickQueryString(sp.q);
    const stageRaw = pickQueryString(sp.stage);
    const stage =
      stageRaw && (Object.values(FeatureStage) as string[]).includes(stageRaw)
        ? (stageRaw as FeatureStage)
        : undefined;

    const {
      initialColumns,
      boardKey,
      agentRunning,
      hasPipelineActivity,
      humanNeedsAttention,
      databaseAvailable,
      boardBuildError,
      cursorBuildConfigured,
    } = await getPipelineBoardState({ q, stage });

    const pollBoard = databaseAvailable && hasPipelineActivity;
    const clientColumns = sanitizePipelineColumnsForClient(initialColumns);

    return (
      <div className="flex flex-col gap-8">
        {!databaseAvailable ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[13px] text-amber-950"
          >
            <p className="font-medium">UI preview — database not connected</p>
            <p className="mt-1.5 leading-relaxed text-amber-900/85">
              Nothing will save until Prisma can reach Postgres. Typical local fix:{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[12px] text-amber-950 shadow-sm">
                npm run demo:local
              </code>{" "}
              (Docker + tables), confirm{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[12px] text-amber-950 shadow-sm">
                DATABASE_URL
              </code>{" "}
              uses{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[12px] text-amber-950 shadow-sm">
                localhost:5432
              </code>{" "}
              not a leftover cloud URL in <code className="font-mono text-[12px]">.env</code>, then restart{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[12px] text-amber-950 shadow-sm">
                npm run dev
              </code>
              .
            </p>
          </div>
        ) : null}
        <PipelinePageHeader />

        {databaseAvailable ? (
          <PipelineClientSection
            boardKey={boardKey}
            initialAgentRunning={agentRunning}
            initialHasPipelineActivity={hasPipelineActivity}
            initialHumanNeedsAttention={humanNeedsAttention}
            initialColumns={clientColumns}
            cursorBuildConfigured={cursorBuildConfigured}
            pollBoard={pollBoard}
            filterQ={q ?? ""}
            filterStage={stage ?? ""}
          >
            <form
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
              action="/pipeline"
              method="get"
            >
              <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                <label htmlFor="q" className="text-[12px] font-medium text-muted-foreground">
                  Search
                </label>
                <Input id="q" name="q" placeholder="Search title or description…" defaultValue={q ?? ""} />
              </div>
              <div className="flex min-w-[160px] flex-col gap-1.5">
                <label htmlFor="stage" className="text-[12px] font-medium text-muted-foreground">
                  Stage
                </label>
                <select
                  id="stage"
                  name="stage"
                  defaultValue={stage ?? ""}
                  className="h-8 rounded-md border border-border bg-card px-2.5 text-[13px] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                >
                  <option value="">All stages</option>
                  {PIPELINE_STAGE_SELECT_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {FEATURE_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="default" size="sm">
                Apply filters
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/pipeline">Reset</Link>
              </Button>
            </form>

            {boardBuildError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-3 text-[13px] text-destructive"
              >
                <p className="font-medium">Pipeline board couldn’t load from stored data</p>
                <p className="mt-1.5 font-mono text-[12px] opacity-90">{boardBuildError}</p>
                <p className="mt-2 text-muted-foreground">
                  Try{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">npm run dev:clean</code> if
                  this appeared after a hot reload. Empty columns are shown below until you refresh.
                </p>
              </div>
            ) : null}
          </PipelineClientSection>
        ) : (
          <>
            <form
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
              action="/pipeline"
              method="get"
            >
              <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                <label htmlFor="q" className="text-[12px] font-medium text-muted-foreground">
                  Search
                </label>
                <Input id="q" name="q" placeholder="Search title or description…" defaultValue={q ?? ""} />
              </div>
              <div className="flex min-w-[160px] flex-col gap-1.5">
                <label htmlFor="stage" className="text-[12px] font-medium text-muted-foreground">
                  Stage
                </label>
                <select
                  id="stage"
                  name="stage"
                  defaultValue={stage ?? ""}
                  className="h-8 rounded-md border border-border bg-card px-2.5 text-[13px] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                >
                  <option value="">All stages</option>
                  {PIPELINE_STAGE_SELECT_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {FEATURE_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="default" size="sm">
                Apply filters
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/pipeline">Reset</Link>
              </Button>
            </form>

            {boardBuildError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-3 text-[13px] text-destructive"
              >
                <p className="font-medium">Pipeline board couldn’t load from stored data</p>
                <p className="mt-1.5 font-mono text-[12px] opacity-90">{boardBuildError}</p>
                <p className="mt-2 text-muted-foreground">
                  Try{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">npm run dev:clean</code> if
                  this appeared after a hot reload. Empty columns are shown below until you refresh.
                </p>
              </div>
            ) : null}

            <div
              className="-mx-2 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
              style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
            >
              <PipelineKanbanBoard
                boardKey={boardKey}
                initialColumns={clientColumns}
                databaseAvailable={false}
                cursorBuildConfigured={cursorBuildConfigured}
                pollBoard={false}
                filterQ={q ?? ""}
                filterStage={stage ?? ""}
              />
            </div>
          </>
        )}
      </div>
    );
  } catch (err) {
    console.error("[pipeline] page fatal", err);
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 py-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h1 className="text-xl font-semibold text-foreground">Pipeline failed to load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The server hit an unexpected error while building this page. Your data is usually fine — this is
            often a dev cache or query-shape issue.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">{msg}</pre>
          <ul className="mt-4 list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
            <li>
              Stop the dev server, run{" "}
              <code className="rounded bg-background px-1 font-mono text-foreground">npm run dev:clean</code>,
              then start again on the port you use in the URL (e.g.{" "}
              <code className="font-mono">next dev -p 3020</code>).
            </li>
            <li>
              Open{" "}
              <Link href="/pipeline" className="font-medium text-foreground underline underline-offset-4">
                /pipeline
              </Link>{" "}
              with no query string to rule out bad params.
            </li>
          </ul>
        </div>
      </div>
    );
  }
}
