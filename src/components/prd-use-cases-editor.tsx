"use client";

import { useCallback, useEffect, useState } from "react";
import type { Artifact } from "@prisma/client";
import {
  coercePrdUseCasesFromContentJson,
  emptyPrdUseCase,
  nextPrdUseCaseId,
  normalizePrdUseCasesForSave,
  tryPrdMarkdownFromContentJson,
  type PrdUseCase,
} from "@/lib/llm/prd-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function flowToText(flow: string[]): string {
  return flow.join("\n");
}

function textToFlow(text: string): string[] {
  const lines = text.split("\n").map((s) => s.trim());
  return lines.length ? lines : [""];
}

export function PrdUseCasesEditor({
  featureId,
  featureTitle,
  artifact,
  disabled,
  onSaved,
}: {
  featureId: string;
  featureTitle: string;
  artifact: Artifact | null | undefined;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<PrdUseCase[]>([]);
  /** Parallel to `rows` — main flow steps, one per line in the textarea */
  const [flowsText, setFlowsText] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const syncFromArtifact = useCallback(() => {
    if (!artifact?.contentJson || typeof artifact.contentJson !== "object" || Array.isArray(artifact.contentJson)) {
      setRows([]);
      setFlowsText([]);
      return;
    }
    const coerced = coercePrdUseCasesFromContentJson(artifact.contentJson);
    setRows(coerced);
    setFlowsText(coerced.map((r) => flowToText(r.mainFlow)));
  }, [artifact]);

  useEffect(() => {
    syncFromArtifact();
  }, [syncFromArtifact]);

  const updateRow = useCallback((index: number, patch: Partial<PrdUseCase>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const setFlowTextAt = useCallback((index: number, text: string) => {
    setFlowsText((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, mainFlow: textToFlow(text) } : r)),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyPrdUseCase(nextPrdUseCaseId(prev))]);
    setFlowsText((prev) => [...prev, ""]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setFlowsText((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const save = useCallback(async () => {
    if (!artifact) return;
    const prevJson =
      artifact.contentJson && typeof artifact.contentJson === "object" && !Array.isArray(artifact.contentJson)
        ? (artifact.contentJson as Record<string, unknown>)
        : {};
    const mergedRows = rows.map((r, i) => ({
      ...r,
      mainFlow: textToFlow(flowsText[i] ?? flowToText(r.mainFlow)),
    }));
    const normalized = normalizePrdUseCasesForSave(mergedRows);
    const merged = { ...prevJson, useCases: normalized };
    const newMd = tryPrdMarkdownFromContentJson(merged, featureTitle);
    setBusy(true);
    try {
      const res = await fetch(`/api/features/${featureId}/prd`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentJson: merged,
          contentMarkdown: newMd ?? artifact.contentMarkdown ?? "",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(
          typeof (j as { error?: unknown }).error === "string"
            ? (j as { error: string }).error
            : "Could not save user cases",
        );
        return;
      }
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }, [artifact, featureId, featureTitle, flowsText, onSaved, rows]);

  if (!artifact) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Run the PRD / Cursor prompt stage to create an artifact, then you can edit user cases here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="space-y-1">
        <h3 className="text-[13px] font-semibold text-foreground">User cases</h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Scenarios the PRD agent should draft (happy path + edge). Edit anytime; saving updates PRD JSON and refreshes
          markdown when the rest of the document still matches the expected shape.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No user cases yet — add one, or re-run the Cursor prompt agent to generate defaults.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <div
              key={`${row.id}-${index}`}
              className="space-y-2 rounded-md border border-border/60 bg-background/80 p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-[72px] flex-1 flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Id</Label>
                  <Input
                    className="h-8 font-mono text-xs"
                    value={row.id}
                    onChange={(e) => updateRow(index, { id: e.target.value })}
                    disabled={disabled || busy}
                  />
                </div>
                <div className="min-w-[160px] flex-[2] flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Title</Label>
                  <Input
                    className="h-8 text-xs"
                    value={row.title}
                    onChange={(e) => updateRow(index, { title: e.target.value })}
                    disabled={disabled || busy}
                    placeholder="e.g. Logged-in user books a bet"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeRow(index)}
                  disabled={disabled || busy}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Actor</Label>
                  <Input
                    className="h-8 text-xs"
                    value={row.actor}
                    onChange={(e) => updateRow(index, { actor: e.target.value })}
                    disabled={disabled || busy}
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Situation</Label>
                  <Textarea
                    className="min-h-[52px] text-xs"
                    value={row.situation}
                    onChange={(e) => updateRow(index, { situation: e.target.value })}
                    disabled={disabled || busy}
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Main flow (one step per line)</Label>
                  <Textarea
                    className="min-h-[88px] font-mono text-xs"
                    value={flowsText[index] ?? flowToText(row.mainFlow)}
                    onChange={(e) => setFlowTextAt(index, e.target.value)}
                    disabled={disabled || busy}
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Expected outcome</Label>
                  <Textarea
                    className="min-h-[52px] text-xs"
                    value={row.expectedOutcome}
                    onChange={(e) => updateRow(index, { expectedOutcome: e.target.value })}
                    disabled={disabled || busy}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled || busy}>
          Add use case
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={disabled || busy}>
          {busy ? "Saving…" : "Save user cases"}
        </Button>
      </div>
    </div>
  );
}
