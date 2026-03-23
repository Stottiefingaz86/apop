import Link from "next/link";
import { FeatureStage } from "@prisma/client";
import { listFeatures } from "@/lib/data/features";
import { PIPELINE_COLUMN_ORDER, FEATURE_STAGE_LABEL } from "@/lib/domain/stages";
import { FEATURE_STATUS_LABEL } from "@/lib/domain/statuses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

function statusBadgeVariant(
  s: keyof typeof FEATURE_STATUS_LABEL,
): "default" | "running" | "input" | "review" {
  if (s === "running" || s === "queued") return "running";
  if (s === "awaiting_input") return "input";
  if (s === "awaiting_review") return "review";
  return "default";
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const stage =
    sp.stage && (Object.values(FeatureStage) as string[]).includes(sp.stage)
      ? (sp.stage as FeatureStage)
      : undefined;

  const features = await listFeatures({ q, stage });

  const byStage = new Map<FeatureStage, typeof features>();
  for (const col of PIPELINE_COLUMN_ORDER) {
    byStage.set(col, []);
  }
  for (const f of features) {
    byStage.get(f.stage)?.push(f);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Stages as columns; card status shows current agent state.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/pipeline" method="get">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Input id="q" name="q" placeholder="Title or description" defaultValue={q ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="stage" className="text-xs font-medium text-muted-foreground">
            Stage filter
          </label>
          <select
            id="stage"
            name="stage"
            defaultValue={stage ?? ""}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="">All stages</option>
            {PIPELINE_COLUMN_ORDER.map((s) => (
              <option key={s} value={s}>
                {FEATURE_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href="/pipeline">Reset</Link>
        </Button>
      </form>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_COLUMN_ORDER.map((col) => (
          <div key={col} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-medium">{FEATURE_STAGE_LABEL[col]}</span>
              <span className="text-xs text-muted-foreground">{byStage.get(col)?.length ?? 0}</span>
            </div>
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="flex flex-col gap-2 pr-3">
                {(byStage.get(col) ?? []).map((f) => (
                  <Link key={f.id} href={`/features/${f.id}`}>
                    <Card className="transition-colors hover:bg-muted/40">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-sm leading-snug">{f.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 p-3 pt-0">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={statusBadgeVariant(f.status)}>{FEATURE_STATUS_LABEL[f.status]}</Badge>
                          {typeof f.score === "number" ? (
                            <Badge variant="default">Score {f.score.toFixed(1)}</Badge>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {f.description || "No description"}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}
