"use client";

import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type RoadmapInsightButtonProps = {
  hypothesis: string | null;
  metrics?: { clicks: number; impressions: number } | null;
  className?: string;
};

export function RoadmapInsightButton({
  hypothesis,
  metrics,
  className,
}: RoadmapInsightButtonProps) {
  const hasHypothesis = (hypothesis?.trim().length ?? 0) > 0;
  const hasMetrics =
    metrics && (metrics.clicks > 0 || metrics.impressions > 0);
  const hasContent = hasHypothesis || hasMetrics;
  if (!hasContent) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <Lightbulb className="size-3" aria-hidden />
          Insight
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(320px,90vw)] space-y-3"
      >
        <p className="text-[12px] font-semibold text-foreground">Insight</p>
        {hasHypothesis ? (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Hypothesis
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-foreground">
              {hypothesis!.trim()}
            </p>
          </div>
        ) : null}
        {hasMetrics ? (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Actual performance (journey map)
            </p>
            <div className="mt-1.5 flex gap-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[12px]">
              <span className="tabular-nums">
                <span className="font-semibold text-foreground">
                  {metrics!.impressions}
                </span>
                <span className="ml-1 text-muted-foreground">impressions</span>
              </span>
              <span className="tabular-nums">
                <span className="font-semibold text-foreground">
                  {metrics!.clicks}
                </span>
                <span className="ml-1 text-muted-foreground">clicks</span>
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No journey map data yet. Events will appear once the feature is
            deployed and the live site sends tracking to APOP.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
