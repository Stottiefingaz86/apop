"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function CursorHandoffDeliverableCard({
  handoffText,
  referenceImageCount,
  className,
}: {
  handoffText: string;
  referenceImageCount: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(handoffText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied */
    }
  }, [handoffText]);

  return (
    <Card className={cn("border-primary/20 bg-muted/10", className)}>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-[13px] font-semibold">Cursor Cloud deliverable</CardTitle>
            <CardDescription className="text-[12px] leading-relaxed">
              Exact <strong className="font-medium text-foreground">prompt text</strong> APOP sends when you click{" "}
              <strong className="font-medium text-foreground">Start Cursor agent</strong>
              {referenceImageCount > 0 ? (
                <>
                  . {referenceImageCount} reference screenshot
                  {referenceImageCount === 1 ? "" : "s"} from the context pack{" "}
                  <span className="whitespace-nowrap">
                    (see <strong className="font-medium text-foreground">Reference screenshots</strong>)
                  </span>{" "}
                  are attached separately as{" "}
                  <code className="rounded bg-muted px-1 font-mono text-[10px]">prompt.images</code>.
                </>
              ) : (
                <>
                  . Add screenshots above if you want visual references attached as{" "}
                  <code className="rounded bg-muted px-1 font-mono text-[10px]">prompt.images</code>.
                </>
              )}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => void onCopy()}
          >
            {copied ? (
              <>
                <Check className="size-3.5 opacity-80" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5 opacity-80" />
                Copy all
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[min(42vh,360px)] rounded-md border border-border/60 bg-background/80">
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {handoffText}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
