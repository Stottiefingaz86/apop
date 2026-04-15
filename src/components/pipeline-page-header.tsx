"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewFeatureDialog } from "@/components/new-feature-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PipelinePageHeader() {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground md:text-[28px]">Pipeline</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="How the board works"
              >
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm text-[12px] leading-relaxed">
              Status strip shows working, paused on you, ready, or needs attention. For ready-for-review cards,
              use ✓ or ✗ on the card. The panel icon opens the Ship PRD preview. Drag column headers to
              reorder columns.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Move work across stages from Inbox to shipped.{" "}
          <Link href="/roadmap" className="font-medium text-foreground underline-offset-4 hover:underline">
            Roadmap
          </Link>{" "}
          lists undeployed items.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NewFeatureDialog />
        <Button asChild variant="outline" size="sm" className="border-border/80 bg-card shadow-none">
          <Link href="/roadmap">Undeployed only</Link>
        </Button>
      </div>
    </header>
  );
}
