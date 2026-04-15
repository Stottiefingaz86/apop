import type { FeatureStage, RoadmapLane } from "@prisma/client";
import Link from "next/link";
import { listRoadmapFeaturesSafe, type RoadmapFeatureRow } from "@/lib/data/features";
import { getJourneyTrackingCounts } from "@/lib/data/journey-tracking";
import {
  formatRoadmapShortDate,
  parseFeatureDate,
  roadmapDateTimeAttr,
} from "@/lib/domain/roadmap-dates";
import { ROADMAP_LANE_COLUMN_ORDER, ROADMAP_LANE_LABEL } from "@/lib/domain/roadmap-lanes";
import {
  buildRoadmapTimeBuckets,
  featureEffectiveDate,
  formatMonthLabel,
  getQuarter,
  quarterMonthRange,
} from "@/lib/domain/roadmap-time";
import { buildPortfolioValueSummary } from "@/lib/domain/roadmap-portfolio-summary";
import { roadmapValueOutlook } from "@/lib/domain/roadmap-value";
import { FEATURE_STAGE_LABEL } from "@/lib/domain/stages";
import { FEATURE_STATUS_LABEL } from "@/lib/domain/statuses";
import { normalizeVercelDeploymentUrl } from "@/lib/vercel/deployment-display";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoadmapInsightButton } from "@/components/roadmap-insight-button";

export const dynamic = "force-dynamic";

const RELEASE_ATTEMPT: Record<string, string> = {
  pending: "Deploy queued",
  building: "Deploying",
  ready: "Deployed",
  error: "Deploy failed",
  canceled: "Deploy canceled",
};

/** Card accent by pipeline stage */
const STAGE_ACCENT: Record<FeatureStage, string> = {
  INBOX: "border-muted-foreground/35 bg-muted/30",
  VALUE_REVIEW: "border-primary/40 bg-primary/[0.06]",
  REJECTED: "border-destructive/40 bg-destructive/[0.06]",
  PRD: "border-border bg-card",
  DESIGN_SPEC: "border-border bg-card",
  READY_FOR_BUILD: "border-primary/35 bg-primary/[0.05]",
  IN_BUILD: "border-primary/45 bg-primary/[0.08]",
  QA: "border-foreground/20 bg-muted/25",
  DONE: "border-emerald-600/40 bg-emerald-500/[0.08]",
};

function statusLabelFor(status: string): string {
  if (status in FEATURE_STATUS_LABEL) {
    return FEATURE_STATUS_LABEL[status as keyof typeof FEATURE_STATUS_LABEL];
  }
  return status;
}

type TimeBucket = { key: string; label: string; isCurrent: boolean; year: number; quarter: number };

function groupByTimeAndLane(
  features: RoadmapFeatureRow[],
): { byTimeAndLane: Map<string, Map<RoadmapLane, RoadmapFeatureRow[]>>; buckets: TimeBucket[] } {
  const dates = features.map((f) =>
    featureEffectiveDate(
      parseFeatureDate(f.roadmapTargetDate),
      parseFeatureDate(f.createdAt),
    ),
  );
  const timeBuckets = buildRoadmapTimeBuckets(dates);
  const result = new Map<string, Map<RoadmapLane, RoadmapFeatureRow[]>>();
  const now = new Date();
  const buckets: TimeBucket[] = timeBuckets.map((b) => ({
    key: b.key,
    label: b.isCurrent
      ? `Current · ${formatMonthLabel(now)}`
      : `${b.label} · ${quarterMonthRange(b.year, b.quarter)}`,
    isCurrent: b.isCurrent,
    year: b.year,
    quarter: b.quarter,
  }));

  for (const b of timeBuckets) {
    const laneMap = new Map<RoadmapLane, RoadmapFeatureRow[]>(
      ROADMAP_LANE_COLUMN_ORDER.map((l) => [l, []]),
    );
    result.set(b.key, laneMap);
  }

  for (const f of features) {
    const eff = featureEffectiveDate(
      parseFeatureDate(f.roadmapTargetDate),
      parseFeatureDate(f.createdAt),
    );
    const { year, quarter } = getQuarter(eff);
    const key = `${year}-Q${quarter}`;
    const laneMap = result.get(key);
    if (laneMap) {
      const lane = f.roadmapLane;
      const list = laneMap.get(lane);
      if (list) list.push(f);
      else laneMap.get("UNCATEGORIZED")!.push(f);
    }
  }

  return { byTimeAndLane: result, buckets };
}

function RoadmapFeatureCard({
  f,
  metrics,
}: {
  f: RoadmapFeatureRow;
  metrics?: { clicks: number; impressions: number };
}) {
  const outlook = roadmapValueOutlook(f.artifacts);
  const latest = f.releases[0];
  const created = parseFeatureDate(f.createdAt);
  const updated = parseFeatureDate(f.updatedAt);
  const stageKey = f.stage as FeatureStage;
  const cardAccent = STAGE_ACCENT[stageKey] ?? STAGE_ACCENT.INBOX;
  const stageTitle = FEATURE_STAGE_LABEL[stageKey] ?? String(f.stage);
  const deployHref = latest?.vercelUrl?.trim()
    ? normalizeVercelDeploymentUrl(latest.vercelUrl)
    : null;
  const attemptLabel = (() => {
    if (!latest) return null;
    if (latest.vercelUrl?.trim()) {
      return latest.status === "ready" ? "Deployed" : "Preview URL saved (APOP)";
    }
    if (latest.status === "ready" && !latest.vercelUrl?.trim()) {
      return "Ready but no URL";
    }
    return RELEASE_ATTEMPT[latest.status] ?? latest.status;
  })();

  const explicitMetric = f.roadmapExpectedLiftMetric?.trim() ?? null;
  const kpiLine = explicitMetric || outlook.kpi?.trim() || null;
  const liftPct =
    f.roadmapExpectedLiftPercent != null && Number.isFinite(f.roadmapExpectedLiftPercent)
      ? f.roadmapExpectedLiftPercent
      : null;

  return (
    <Card
      className={cn(
        "w-[min(92vw,340px)] shrink-0 border-border/80 shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-colors hover:border-border",
        cardAccent,
      )}
    >
      <CardHeader className="gap-2 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-[15px] font-semibold leading-snug">
            <Link
              href={`/features/${f.id}`}
              className="text-foreground hover:text-primary hover:underline"
            >
              {f.title}
            </Link>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <RoadmapInsightButton
              hypothesis={outlook.hypothesis?.trim() ?? null}
              metrics={metrics}
            />
            <Badge variant="default" className="font-normal">
              {stageTitle}
            </Badge>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {statusLabelFor(f.status)}
          <span className="mx-1 text-border">·</span>
          <time dateTime={roadmapDateTimeAttr(created)} className="tabular-nums">
            Started {formatRoadmapShortDate(created)}
          </time>
          <span className="mx-1 text-border">·</span>
          <time dateTime={roadmapDateTimeAttr(updated)} className="tabular-nums">
            Active {formatRoadmapShortDate(updated)}
          </time>
        </p>
        {f.description?.trim() ? (
          <CardDescription className="line-clamp-2 text-[12px] leading-relaxed">
            {f.description.trim()}
          </CardDescription>
        ) : null}

        {metrics && (metrics.clicks > 0 || metrics.impressions > 0) ? (
          <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px]">
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{metrics.impressions}</span>
              <span className="ml-1 text-muted-foreground">impressions</span>
            </span>
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{metrics.clicks}</span>
              <span className="ml-1 text-muted-foreground">clicks</span>
            </span>
          </div>
        ) : null}
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2 text-[11px] leading-relaxed">
          {f.roadmapCostEstimate?.trim() ? (
            <p>
              <span className="font-semibold text-foreground">Cost / effort: </span>
              <span className="text-muted-foreground">{f.roadmapCostEstimate.trim()}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">Cost / effort: —</p>
          )}
          {kpiLine ? (
            <p>
              <span className="font-semibold text-foreground">Target KPI: </span>
              <span className="text-muted-foreground">{kpiLine}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">Target KPI: —</p>
          )}
          {liftPct != null ? (
            <p>
              <span className="font-semibold text-foreground">Expected lift: </span>
              <span className="tabular-nums text-muted-foreground">~{liftPct}%</span>
            </p>
          ) : outlook.hypothesis ? (
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Hypothesis: </span>
              {outlook.hypothesis.length > 200
                ? `${outlook.hypothesis.slice(0, 200)}…`
                : outlook.hypothesis}
            </p>
          ) : outlook.valueScore != null ? (
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Analyst score: </span>
              <span className="tabular-nums">{outlook.valueScore}</span> / 10
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pt-0 text-[11px] text-muted-foreground">
        {latest ? (
          <>
            <p className="m-0 leading-relaxed">
              Release: <span className="font-medium text-foreground">{attemptLabel}</span>
            </p>
            {deployHref ? (
              <a
                href={deployHref}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-[10px] text-primary underline underline-offset-2"
              >
                {deployHref}
              </a>
            ) : null}
          </>
        ) : (
          <p className="m-0 leading-relaxed">No deploy recorded in APOP yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function RoadmapPage() {
  try {
    const { features, databaseAvailable } = await listRoadmapFeaturesSafe();
    const portfolio = databaseAvailable ? buildPortfolioValueSummary(features) : null;
    const trackingCounts =
      databaseAvailable && features.length > 0
        ? await getJourneyTrackingCounts(features.map((x) => x.id))
        : new Map<string, { clicks: number; impressions: number }>();
    const { byTimeAndLane, buckets } = databaseAvailable
      ? groupByTimeAndLane(features)
      : { byTimeAndLane: new Map(), buckets: [] as TimeBucket[] };

    return (
      <div className="flex flex-col gap-8">
        {!databaseAvailable ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[13px] text-amber-950"
          >
            <p className="font-medium">Database not connected</p>
            <p className="mt-1.5 leading-relaxed text-amber-900/85">
              Connect Postgres to load the roadmap. The pipeline page has the same requirement.
            </p>
          </div>
        ) : null}

        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-[28px] font-semibold tracking-tight text-foreground">Roadmap</h1>
            <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              <strong className="font-medium text-foreground">What we are building</strong> by quarter and month.{" "}
              <strong className="font-medium text-foreground">Current</strong> = this quarter; sections show Q1, Q2, etc.
              Each lane (Sports, Casino, Marketing, PAM) scrolls horizontally. Set a target date under Roadmap on the
              feature to place it in the right quarter.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/pipeline">Open pipeline</Link>
          </Button>
        </header>

        {databaseAvailable && features.length > 0 && portfolio?.headline ? (
          <div
            role="region"
            aria-label="Portfolio value outlook"
            className="rounded-xl border border-border/80 bg-card px-4 py-3 text-[13px] shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
          >
            <p className="font-semibold text-foreground">Overall value outlook</p>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">{portfolio.headline}</p>
            {portfolio.detail ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{portfolio.detail}</p>
            ) : null}
          </div>
        ) : null}

        {databaseAvailable && features.length === 0 ? (
          <p className="rounded-xl border border-border/80 bg-card px-4 py-8 text-center text-[14px] text-muted-foreground">
            No roadmap items yet. Create a feature from the pipeline, then assign a lane and economics under{" "}
            <strong className="font-medium text-foreground">Roadmap</strong> on the feature page.
          </p>
        ) : null}

        {databaseAvailable && features.length > 0 ? (
          <div className="flex flex-col gap-8">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Quarters and months · Current = this quarter · Lanes scroll right (swipe on touch)
            </p>
            {buckets.map((bucket) => {
              const laneMap = byTimeAndLane.get(bucket.key);
              return (
                <section
                  key={bucket.key}
                  aria-label={bucket.label}
                  className="flex flex-col gap-3"
                >
                  <h2
                    className={cn(
                      "text-[17px] font-semibold tracking-tight",
                      bucket.isCurrent
                        ? "text-primary"
                        : "text-foreground",
                    )}
                  >
                    {bucket.label}
                  </h2>
                  {ROADMAP_LANE_COLUMN_ORDER.map((lane) => {
                    const laneItems: RoadmapFeatureRow[] =
                      (laneMap?.get(lane) ?? []) as RoadmapFeatureRow[];
                    return (
                      <div
                        key={lane}
                        className="rounded-xl border border-border/70 bg-card/40 shadow-[0_1px_2px_rgba(15,15,15,0.03)]"
                      >
                        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-stretch sm:gap-0 sm:p-0">
                          <div className="flex shrink-0 flex-row items-center justify-between border-border/60 sm:w-44 sm:flex-col sm:items-stretch sm:justify-center sm:border-r sm:px-4 sm:py-4">
                            <div>
                              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                                {ROADMAP_LANE_LABEL[lane]}
                              </h3>
                              <p className="text-[11px] text-muted-foreground">
                                {laneItems.length} item{laneItems.length === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                          <div className="min-h-[120px] min-w-0 flex-1 overflow-x-auto py-2 pl-0 pr-2 sm:py-3 sm:pl-2 sm:pr-4 [-webkit-overflow-scrolling:touch]">
                            <div className="flex w-max gap-3">
                              {laneItems.length === 0 ? (
                                <div className="flex min-h-[120px] min-w-[min(100%,280px)] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 text-center text-[12px] text-muted-foreground">
                                  Nothing in this lane.
                                </div>
                              ) : (
                                laneItems.map((f) => (
                                  <RoadmapFeatureCard
                                    key={f.id}
                                    f={f}
                                    metrics={trackingCounts.get(f.id)}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  } catch (err) {
    console.error("[roadmap] page fatal", err);
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 py-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h1 className="text-xl font-semibold text-foreground">Roadmap failed to load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong while rendering this page. Try{" "}
            <code className="rounded bg-muted px-1 font-mono text-foreground">npm run dev:clean</code>{" "}
            and restart the dev server.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">{msg}</pre>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/pipeline">Back to pipeline</Link>
          </Button>
        </div>
      </div>
    );
  }
}
