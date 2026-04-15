"use client";

import { Loader2, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type PollerProps = {
  active: boolean;
  /** Background work (LLM run, Cursor job, or Vercel sync) — blue “live updates” strip */
  agentRunning: boolean;
};

/**
 * Status banner while the pipeline has live activity. Board updates use
 * `GET /api/pipeline/board` polling (see PipelineKanbanBoard) — not `router.refresh()` —
 * so dev doesn’t intermittently 500 on RSC refetch.
 */
export function PipelineActivityPoller({ active, agentRunning }: PollerProps) {
  if (!active) return null;

  const agentsBusy = agentRunning;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-xl border-2 px-4 py-3 shadow-sm",
        agentsBusy
          ? "border-primary/30 bg-primary/[0.09]"
          : "border-amber-300/80 bg-amber-50/95",
      )}
      style={
        agentsBusy
          ? {
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              borderRadius: 12,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: "rgba(37, 99, 235, 0.35)",
              backgroundColor: "rgba(37, 99, 235, 0.08)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }
          : {
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              borderRadius: 12,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: "rgba(217, 119, 6, 0.55)",
              backgroundColor: "rgba(254, 252, 232, 0.98)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }
      }
    >
      <div
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
          agentsBusy ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-900",
        )}
        style={
          agentsBusy
            ? {
                marginTop: 2,
                display: "flex",
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: "rgba(37, 99, 235, 0.15)",
                color: "#1d4ed8",
                flexShrink: 0,
              }
            : {
                marginTop: 2,
                display: "flex",
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: "#fef3c7",
                color: "#92400e",
                flexShrink: 0,
              }
        }
      >
        {agentsBusy ? (
          <Loader2
            className="size-5 motion-safe:animate-spin"
            aria-hidden
            style={{ width: 20, height: 20, animation: "apop-spin 0.9s linear infinite" }}
          />
        ) : (
          <PauseCircle className="size-5" aria-hidden style={{ width: 20, height: 20 }} />
        )}
      </div>
      <div className="min-w-0 space-y-1 pt-0.5" style={{ minWidth: 0, paddingTop: 2 }}>
        <p
          className="text-[14px] font-semibold leading-snug text-foreground"
          style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#18181b", lineHeight: 1.35 }}
        >
          {agentsBusy ? "Live updates" : "Paused — waiting on you"}
        </p>
        <p
          className="text-[13px] leading-relaxed text-muted-foreground"
          style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: "#52525b" }}
        >
          {agentsBusy
            ? "A Cursor job, Vercel deploy sync, or AI run is in progress. The board refreshes every few seconds without reloading the page."
            : "One or more cards need your answers or a review. Open the card to clear the pause — the board keeps syncing in the background."}
        </p>
      </div>
    </div>
  );
}
