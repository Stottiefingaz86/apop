"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  AgentQuestion,
  Approval,
  Artifact,
  DesignInputs,
  Feature,
  FeatureStage,
  Run,
  RunEvent,
} from "@prisma/client";
import { STAGE_DEFAULT_AGENT } from "@/lib/domain/run-lifecycle";
import { FEATURE_STAGE_LABEL, PIPELINE_COLUMN_ORDER } from "@/lib/domain/stages";
import { FEATURE_STATUS_LABEL } from "@/lib/domain/statuses";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";
import type { AgentQuestionsPayload } from "@/lib/domain/agent-questions";
import { latestArtifactByType } from "@/lib/artifact-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type RunWithEvents = Run & { events: RunEvent[] };

export type FeatureWorkspaceModel = Feature & {
  artifacts: Artifact[];
  runs: RunWithEvents[];
  agentQuestions: AgentQuestion[];
  designInputs: DesignInputs | null;
  approvals: Approval[];
};

const ARTIFACT_TABS = [
  { type: ARTIFACT_TYPES.VALUE_ANALYSIS, label: "Value" },
  { type: ARTIFACT_TYPES.PRD, label: "PRD" },
  { type: ARTIFACT_TYPES.DESIGN_SPEC, label: "Design" },
] as const;

export function FeatureWorkspace({ initial }: { initial: FeatureWorkspaceModel }) {
  const router = useRouter();
  const [feature, setFeature] = useState(initial);
  const [contextJson, setContextJson] = useState(
    JSON.stringify(initial.contextPack ?? {}, null, 2),
  );
  const [designForm, setDesignForm] = useState({
    tokenJson: initial.designInputs?.tokenJson
      ? JSON.stringify(initial.designInputs.tokenJson, null, 2)
      : "",
    figmaUrl: initial.designInputs?.figmaUrl ?? "",
    brandDescription: initial.designInputs?.brandDescription ?? "",
    uxDirection: initial.designInputs?.uxDirection ?? "",
    competitors: Array.isArray(initial.designInputs?.competitorUrls)
      ? (initial.designInputs?.competitorUrls as string[]).join("\n")
      : "",
    notes: initial.designInputs?.notes ?? "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const latest = useMemo(() => latestArtifactByType(feature.artifacts), [feature.artifacts]);

  const openQuestion = feature.agentQuestions.find((q) => q.status === "open");
  const questionPayload = openQuestion?.questionJson as AgentQuestionsPayload | undefined;

  async function patchFeature(body: object) {
    const res = await fetch(`/api/features/${feature.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json() as Promise<Feature>;
  }

  async function saveContext() {
    setBusy("context");
    try {
      const parsed = JSON.parse(contextJson || "{}");
      const f = await patchFeature({ contextPack: parsed });
      setFeature((prev) => ({ ...prev, contextPack: f.contextPack }));
    } catch {
      alert("Invalid JSON in context pack");
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  async function saveDesignInputs() {
    setBusy("design");
    try {
      let tokenJson: unknown = null;
      if (designForm.tokenJson.trim()) {
        try {
          tokenJson = JSON.parse(designForm.tokenJson);
        } catch {
          alert("Token JSON invalid");
          setBusy(null);
          return;
        }
      }
      const res = await fetch(`/api/features/${feature.id}/design-inputs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenJson,
          figmaUrl: designForm.figmaUrl || null,
          brandDescription: designForm.brandDescription || null,
          uxDirection: designForm.uxDirection || null,
          competitorUrls: designForm.competitors
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          notes: designForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      await res.json();
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  async function runStage(overrideStage?: FeatureStage) {
    setBusy("run");
    try {
      const res = await fetch(`/api/features/${feature.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: overrideStage ?? feature.stage }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error ?? "Run failed");
      }
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  async function submitAnswers() {
    if (!openQuestion) return;
    setBusy("answers");
    try {
      const res = await fetch(`/api/features/${feature.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionRecordId: openQuestion.id, answers }),
      });
      if (!res.ok) alert("Could not save answers");
      setAnswers({});
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  async function approval(status: "approved" | "rejected") {
    setBusy("approval");
    try {
      await fetch(`/api/features/${feature.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: feature.stage, status, approvedBy: "user" }),
      });
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  async function setStage(stage: FeatureStage) {
    setBusy("stage");
    try {
      const f = await patchFeature({ stage });
      setFeature((prev) => ({ ...prev, stage: f.stage }));
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  const timeline = feature.runs[0]?.events ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{feature.title}</h1>
          <p className="text-sm text-muted-foreground">{FEATURE_STAGE_LABEL[feature.stage]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{FEATURE_STATUS_LABEL[feature.status]}</Badge>
          {typeof feature.score === "number" ? <Badge variant="review">Score {feature.score}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
              <CardDescription>Stage and routing</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>Stage</Label>
                <select
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                  value={feature.stage}
                  onChange={(e) => setStage(e.target.value as FeatureStage)}
                  disabled={!!busy}
                >
                  {PIPELINE_COLUMN_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {FEATURE_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Default agent: {STAGE_DEFAULT_AGENT[feature.stage] ?? "—"}
              </p>
              <Separator />
              <p className="text-sm">{feature.description || "No description"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Context pack</CardTitle>
              <CardDescription>Authoritative inputs — agents will not invent these</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Textarea
                className="min-h-[200px] font-mono text-xs"
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={saveContext} disabled={!!busy}>
                Save context
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-6">
          <Card className="min-h-[420px]">
            <CardHeader>
              <CardTitle className="text-base">Artifacts</CardTitle>
              <CardDescription>Versioned outputs and previews</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={ARTIFACT_TYPES.VALUE_ANALYSIS}>
                <TabsList>
                  {ARTIFACT_TABS.map((t) => (
                    <TabsTrigger key={t.type} value={t.type}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {ARTIFACT_TABS.map((t) => {
                  const art = latest.get(t.type);
                  return (
                    <TabsContent key={t.type} value={t.type}>
                      {art?.contentMarkdown ? (
                        <div className="max-w-none space-y-2 text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-4 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-1 [&_th]:border [&_th]:border-border [&_th]:p-1">
                          <ReactMarkdown>{art.contentMarkdown}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No artifact yet for this type.</p>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>

          {openQuestion && questionPayload ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent questions</CardTitle>
                <CardDescription>
                  {questionPayload.agent} needs input before continuing
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {questionPayload.questions.map((q) => (
                  <div key={q.id} className="flex flex-col gap-1">
                    <Label htmlFor={q.id}>
                      {q.label}
                      {q.required ? <span className="text-destructive"> *</span> : null}
                    </Label>
                    <p className="text-xs text-muted-foreground">{q.reason}</p>
                    {q.type === "text" || q.type === "url" ? (
                      <Input
                        id={q.id}
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                    ) : (
                      <Textarea
                        id={q.id}
                        className="min-h-[72px]"
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={submitAnswers} disabled={!!busy}>
                    Save answers
                  </Button>
                  <Button variant="outline" onClick={() => runStage()} disabled={!!busy}>
                    Resume agent run
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Design inputs</CardTitle>
              <CardDescription>Tokens, brand, references</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>Token JSON</Label>
                <Textarea
                  className="min-h-[120px] font-mono text-xs"
                  value={designForm.tokenJson}
                  onChange={(e) => setDesignForm((d) => ({ ...d, tokenJson: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Figma URL</Label>
                <Input
                  value={designForm.figmaUrl}
                  onChange={(e) => setDesignForm((d) => ({ ...d, figmaUrl: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Brand system</Label>
                <Textarea
                  value={designForm.brandDescription}
                  onChange={(e) => setDesignForm((d) => ({ ...d, brandDescription: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>UX direction</Label>
                <Input
                  value={designForm.uxDirection}
                  onChange={(e) => setDesignForm((d) => ({ ...d, uxDirection: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Competitor URLs (one per line)</Label>
                <Textarea
                  value={designForm.competitors}
                  onChange={(e) => setDesignForm((d) => ({ ...d, competitors: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Notes</Label>
                <Textarea
                  value={designForm.notes}
                  onChange={(e) => setDesignForm((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
              <Button variant="outline" onClick={saveDesignInputs} disabled={!!busy}>
                Save design inputs
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>Latest run events</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <div className="text-xs text-muted-foreground">
                {feature.runs[0] ? (
                  <>
                    <div>Run {feature.runs[0].id.slice(0, 8)}…</div>
                    <div>Agent {feature.runs[0].agentName}</div>
                    <div>Status {feature.runs[0].status}</div>
                  </>
                ) : (
                  "No runs yet"
                )}
              </div>
              <ScrollArea className="h-[280px] rounded-md border border-border p-2">
                <div className="flex flex-col gap-2 pr-2">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events</p>
                  ) : (
                    timeline.map((ev) => (
                      <div key={ev.id} className="text-xs">
                        <span className="text-muted-foreground">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>{" "}
                        {ev.message}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <Separator />
              <div className="flex flex-col gap-2">
                <Button onClick={() => runStage()} disabled={!!busy}>
                  {busy === "run" ? "Running…" : "Run stage agent"}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => approval("approved")}>
                    Approve
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => approval("rejected")}>
                    Reject
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => runStage()}
                  disabled={!!busy}
                >
                  Retry run
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
