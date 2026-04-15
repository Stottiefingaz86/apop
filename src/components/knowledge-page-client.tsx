"use client";

import type { KnowledgeCategory, KnowledgeEntry } from "@prisma/client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  KNOWLEDGE_CATEGORY_HELP,
  KNOWLEDGE_CATEGORY_LABEL,
  KNOWLEDGE_CATEGORY_ORDER,
} from "@/lib/domain/knowledge-categories";
import { MAX_KNOWLEDGE_FILES } from "@/lib/domain/knowledge-attachment-limits";
import {
  INTEGRATION_PRESET,
  KNOWLEDGE_INTEGRATION_PROVIDERS,
  type KnowledgeIntegrationEnvVar,
  type KnowledgeIntegrationProvider,
} from "@/lib/domain/knowledge-integration";
import { parseKnowledgeIntegrationMeta } from "@/lib/domain/knowledge-meta";
import { cn } from "@/lib/utils";

type MetaShape = {
  referenceUrl?: string;
  files?: { name: string; mimeType: string }[];
};

function getMeta(entry: KnowledgeEntry): MetaShape {
  const m = entry.meta;
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  return m as MetaShape;
}

function getIntegration(entry: KnowledgeEntry) {
  const m = entry.meta;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  return parseKnowledgeIntegrationMeta((m as { integration?: unknown }).integration);
}

function normalizeEnvVarName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function stripDataUrl(dataUrl: string): { mimeType: string; dataBase64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  return { mimeType: m[1].trim(), dataBase64: m[2].replace(/\s/g, "") };
}

export function KnowledgePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<KnowledgeCategory | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [maxIdeas, setMaxIdeas] = useState(5);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<KnowledgeCategory>("OTHER");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragFiles, setDragFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [integrationProvider, setIntegrationProvider] = useState<KnowledgeIntegrationProvider | "">("");
  const [integrationProviderLabel, setIntegrationProviderLabel] = useState("");
  const [integrationDocsUrl, setIntegrationDocsUrl] = useState("");
  const [integrationEnvVars, setIntegrationEnvVars] = useState<KnowledgeIntegrationEnvVar[]>([]);
  const [integrationPublicId, setIntegrationPublicId] = useState("");
  const [integrationNotes, setIntegrationNotes] = useState("");

  function applyIntegrationPreset(p: KnowledgeIntegrationProvider) {
    const preset = INTEGRATION_PRESET[p];
    setIntegrationEnvVars(preset.envVars.map((r) => ({ ...r })));
    setIntegrationDocsUrl(preset.docsUrl);
  }

  function onIntegrationProviderSelect(v: string) {
    if (!v) {
      setIntegrationProvider("");
      setIntegrationEnvVars([]);
      setIntegrationDocsUrl("");
      setIntegrationProviderLabel("");
      setIntegrationPublicId("");
      setIntegrationNotes("");
      return;
    }
    const p = v as KnowledgeIntegrationProvider;
    setIntegrationProvider(p);
    setIntegrationProviderLabel("");
    applyIntegrationPreset(p);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("category", filter);
    if (q.trim()) params.set("q", q.trim());
    const r = await fetch(`/api/knowledge?${params.toString()}`);
    if (r.status === 503) {
      setEntries([]);
      setError("Database isn’t available — connect Postgres and run npx prisma db push.");
      setLoading(false);
      return;
    }
    if (!r.ok) {
      setError("Could not load knowledge entries.");
      setLoading(false);
      return;
    }
    const rows = (await r.json()) as KnowledgeEntry[];
    setEntries(rows);
    setLoading(false);
  }, [filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pathname !== "/knowledge") return;
    if (typeof window === "undefined") return;
    const go = () => {
      if (window.location.hash !== "#add-knowledge") return;
      document.getElementById("add-knowledge")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [pathname]);

  function addKnowledgeFiles(list: FileList | File[]) {
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_KNOWLEDGE_FILES) break;
      const n = f.name.toLowerCase();
      const ok =
        n.endsWith(".pdf") ||
        n.endsWith(".csv") ||
        n.endsWith(".txt") ||
        n.endsWith(".xlsx");
      if (!ok) continue;
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuggestMsg(null);

    const meta: Record<string, unknown> = {};
    if (referenceUrl.trim()) meta.referenceUrl = referenceUrl.trim();

    if (integrationProvider) {
      meta.integration = {
        provider: integrationProvider,
        ...(integrationProvider === "other" && integrationProviderLabel.trim()
          ? { providerLabel: integrationProviderLabel.trim() }
          : {}),
        ...(integrationDocsUrl.trim() ? { docsUrl: integrationDocsUrl.trim() } : {}),
        envVars: integrationEnvVars
          .map((r) => ({
            label: r.label.trim(),
            envVarName: normalizeEnvVarName(r.envVarName),
          }))
          .filter((r) => r.label && r.envVarName),
        ...(integrationPublicId.trim() ? { publicWorkspaceId: integrationPublicId.trim() } : {}),
        ...(integrationNotes.trim() ? { notes: integrationNotes.trim() } : {}),
      };
    }

    const attachments: { name: string; mimeType: string; dataBase64: string }[] = [];
    try {
      for (const f of files) {
        const dataUrl = await readFileAsDataUrl(f);
        const stripped = stripDataUrl(dataUrl);
        if (!stripped) throw new Error(`Could not read “${f.name}”.`);
        attachments.push({
          name: f.name,
          mimeType: stripped.mimeType || f.type || "application/octet-stream",
          dataBase64: stripped.dataBase64,
        });
      }
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Could not read files.");
      return;
    }

    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        summary: summary.trim() || undefined,
        body: body.trim(),
        category,
        meta: Object.keys(meta).length ? meta : undefined,
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const msg =
        typeof j?.error === "string"
          ? j.error
          : j?.error && typeof j.error === "object" && "formErrors" in (j.error as object)
            ? "Validation error"
            : "Could not save entry.";
      setError(msg);
      return;
    }
    setTitle("");
    setReferenceUrl("");
    setSummary("");
    setBody("");
    setCategory("OTHER");
    setFiles([]);
    setIntegrationProvider("");
    setIntegrationProviderLabel("");
    setIntegrationDocsUrl("");
    setIntegrationEnvVars([]);
    setIntegrationPublicId("");
    setIntegrationNotes("");
    void load();
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this knowledge entry?")) return;
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) {
      void load();
      router.refresh();
    }
  }

  async function onSuggestIdeas() {
    setSuggesting(true);
    setSuggestMsg(null);
    setError(null);
    const res = await fetch("/api/knowledge/suggest-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxIdeas }),
    });
    setSuggesting(false);
    const j = (await res.json().catch(() => null)) as {
      error?: string;
      created?: { id: string; title: string }[];
      count?: number;
    } | null;
    if (!res.ok) {
      const err = j?.error;
      setError(
        typeof err === "string"
          ? err
          : "Could not generate ideas. If ideas were produced but not saved, the database may be unreachable — check DATABASE_URL and run prisma db push.",
      );
      return;
    }
    setSuggestMsg(
      `Added ${j?.count ?? 0} draft idea(s) to Inbox. Open Pipeline to review and run agents when ready.`,
    );
    router.refresh();
  }

  const dropzoneClass = useMemo(
    () =>
      cn(
        "flex min-h-[100px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-[12px] text-muted-foreground transition-colors hover:bg-muted/35",
        dragFiles && "border-foreground/35 bg-muted/40 text-foreground",
      ),
    [dragFiles],
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="space-y-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground md:text-[28px]">Knowledge</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          One place for business context agents and humans share:{" "}
          <span className="text-foreground/90">data APIs</span>,{" "}
          <span className="text-foreground/90">dumps</span>,{" "}
          <span className="text-foreground/90">Figma / MCP</span> notes,{" "}
          <span className="text-foreground/90">KPIs</span>,{" "}
          <span className="text-foreground/90">research</span>,{" "}
          <span className="text-foreground/90">surveys</span>, and more. Add a{" "}
          <span className="font-medium text-foreground">reference URL</span>, paste into{" "}
          <span className="font-medium text-foreground">content</span>, and/or drop{" "}
          <span className="font-medium text-foreground">PDF / CSV / TXT / XLSX</span> — text is extracted for
          search and for agents. Value, design, and PRD runs receive this bundle; HTTPS reference URLs may be
          fetched server-side for a short text excerpt (disable with{" "}
          <code className="rounded bg-muted px-1 font-mono text-[11px]">APOP_FETCH_KNOWLEDGE_URLS=false</code>
          ). For analytics or
          support tools, use the <span className="font-medium text-foreground">Third-party tool</span> block to
          record env var names — never paste secret values into the body. You can also{" "}
          <span className="font-medium text-foreground">draft Inbox ideas from knowledge</span> below.
        </p>
      </header>

      <Card className="border-border/80 shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Lightbulb className="size-4 opacity-70" aria-hidden />
            Draft ideas from knowledge
          </CardTitle>
          <CardDescription className="text-[12px] leading-relaxed">
            Reads everything you have saved in Knowledge and drafts new items in <strong>Inbox</strong>, using the
            same AI path as the rest of the product. Review each idea before promoting it or running agents on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max-ideas" className="text-[12px] text-muted-foreground">
              Max ideas
            </Label>
            <select
              id="max-ideas"
              value={maxIdeas}
              onChange={(e) => setMaxIdeas(Number(e.target.value))}
              className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            >
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" disabled={suggesting} onClick={() => void onSuggestIdeas()}>
            {suggesting ? "Generating…" : "Generate Inbox ideas"}
          </Button>
        </CardContent>
      </Card>

      {suggestMsg ? (
        <p className="text-[13px] text-muted-foreground" role="status">
          {suggestMsg}{" "}
          <Link href="/pipeline" className="font-medium text-foreground underline underline-offset-4">
            Open Pipeline
          </Link>
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[13px] text-amber-950"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <Label htmlFor="kq" className="text-[12px] text-muted-foreground">
                Search
              </Label>
              <Input
                id="kq"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles, notes, and extracted file text…"
                className="bg-background"
              />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              Apply
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                filter === "ALL"
                  ? "border-foreground/20 bg-foreground text-background"
                  : "border-border/80 bg-card text-muted-foreground hover:bg-muted/60",
              )}
            >
              All
            </button>
            {KNOWLEDGE_CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  filter === c
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border/80 bg-card text-muted-foreground hover:bg-muted/60",
                )}
              >
                {KNOWLEDGE_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No entries yet — add one on the right.</p>
            ) : (
              entries.map((entry) => {
                const meta = getMeta(entry);
                const integ = getIntegration(entry);
                const fileList = meta.files ?? [];
                const extractPreview = entry.attachmentExtract?.trim();
                const integTitle =
                  integ?.provider === "other" && integ.providerLabel?.trim()
                    ? integ.providerLabel.trim()
                    : KNOWLEDGE_INTEGRATION_PROVIDERS.find((p) => p.value === integ?.provider)?.label ??
                      integ?.provider;
                return (
                  <Card
                    key={entry.id}
                    className="border-border/80 shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
                  >
                    <CardHeader className="space-y-1 pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {KNOWLEDGE_CATEGORY_LABEL[entry.category]}
                          </span>
                          <CardTitle className="text-base font-semibold leading-snug">{entry.title}</CardTitle>
                          {entry.summary ? (
                            <CardDescription className="text-[13px]">{entry.summary}</CardDescription>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Delete entry"
                          onClick={() => void onDelete(entry.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-[13px]">
                      {fileList.length ? (
                        <p className="text-[12px] text-muted-foreground">
                          <span className="font-medium text-foreground">Files: </span>
                          {fileList.map((f) => f.name).join(", ")}
                        </p>
                      ) : null}
                      {integ ? (
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/15 p-3 text-[12px]">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Integration
                          </p>
                          <p className="font-medium text-foreground">{integTitle}</p>
                          {integ.docsUrl?.trim() ? (
                            <p>
                              <span className="text-muted-foreground">Docs: </span>
                              <a
                                href={integ.docsUrl.trim()}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-foreground underline underline-offset-4"
                              >
                                {integ.docsUrl.trim()}
                              </a>
                            </p>
                          ) : null}
                          {integ.publicWorkspaceId?.trim() ? (
                            <p>
                              <span className="text-muted-foreground">Workspace / project id: </span>
                              <span className="text-foreground">{integ.publicWorkspaceId.trim()}</span>
                            </p>
                          ) : null}
                          {integ.envVars.length ? (
                            <ul className="list-inside list-disc space-y-0.5 text-[11px] text-foreground">
                              {integ.envVars.map((r) => (
                                <li key={r.envVarName}>
                                  <span className="text-muted-foreground">{r.label}: </span>
                                  <code className="rounded bg-background px-1 font-mono text-[11px]">
                                    {r.envVarName}
                                  </code>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {integ.notes?.trim() ? (
                            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                              {integ.notes.trim()}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {meta.referenceUrl ? (
                        <p>
                          <span className="font-medium text-foreground">Link: </span>
                          <a
                            href={meta.referenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-foreground underline underline-offset-4"
                          >
                            {meta.referenceUrl}
                          </a>
                        </p>
                      ) : null}
                      {entry.body ? (
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 p-3 font-sans text-[12px] leading-relaxed text-foreground">
                          {entry.body}
                        </pre>
                      ) : null}
                      {extractPreview ? (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Extracted from files (for agents)
                          </p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-card p-3 font-sans text-[11px] leading-relaxed text-foreground">
                            {extractPreview.length > 4_000
                              ? `${extractPreview.slice(0, 4_000)}…`
                              : extractPreview}
                          </pre>
                        </div>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">
                        Updated {new Date(entry.updatedAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        <aside id="add-knowledge">
          <Card className="border-border/80 shadow-[0_1px_2px_rgba(15,15,15,0.04)] lg:sticky lg:top-20 scroll-mt-24">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold">Add entry</CardTitle>
              <CardDescription className="text-[12px] leading-relaxed">
                {KNOWLEDGE_CATEGORY_HELP[category]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={onCreate}>
                <div className="space-y-2">
                  <Label htmlFor="ke-cat">Category</Label>
                  <select
                    id="ke-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  >
                    {KNOWLEDGE_CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {KNOWLEDGE_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ke-title">Title</Label>
                  <Input
                    id="ke-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Short label"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ke-url">Reference URL (optional)</Label>
                  <Input
                    id="ke-url"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://…"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ke-sum">Summary (optional)</Label>
                  <Input
                    id="ke-sum"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="One line for lists"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ke-body">Content (optional if you attach files)</Label>
                  <Textarea
                    id="ke-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    placeholder="Paste dump, KPI table, research notes, MCP / Figma context…"
                    className="resize-y bg-background text-[13px]"
                  />
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/15 p-3">
                  <div>
                    <p className="text-[12px] font-medium text-foreground">Third-party tool (optional)</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      For <strong>Intercom</strong>, <strong>Mixpanel</strong>, <strong>Saga</strong>, or similar:
                      record which <strong>environment variable names</strong> hold each credential (e.g.{" "}
                      <code className="rounded bg-muted px-0.5 font-mono text-[10px]">
                        INTERCOM_ACCESS_TOKEN
                      </code>
                      ). Put the actual secrets in <code className="font-mono text-[10px]">.env</code> or your
                      host&apos;s secret manager — <strong>never paste API keys into APOP</strong>.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="int-prov">Tool</Label>
                    <select
                      id="int-prov"
                      value={integrationProvider}
                      onChange={(e) => onIntegrationProviderSelect(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    >
                      {KNOWLEDGE_INTEGRATION_PROVIDERS.map((p) => (
                        <option key={p.value || "none"} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {integrationProvider === "other" ? (
                    <div className="space-y-2">
                      <Label htmlFor="int-other-name">Tool name</Label>
                      <Input
                        id="int-other-name"
                        value={integrationProviderLabel}
                        onChange={(e) => setIntegrationProviderLabel(e.target.value)}
                        placeholder="e.g. Segment, Stripe, internal API"
                        className="bg-background"
                      />
                    </div>
                  ) : null}
                  {integrationProvider ? (
                    <>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {INTEGRATION_PRESET[integrationProvider].hint}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="int-docs">Docs URL (https, optional)</Label>
                        <Input
                          id="int-docs"
                          value={integrationDocsUrl}
                          onChange={(e) => setIntegrationDocsUrl(e.target.value)}
                          placeholder="https://developers…"
                          className="bg-background font-mono text-[12px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="int-pub">Workspace / project id (optional, non-secret)</Label>
                        <Input
                          id="int-pub"
                          value={integrationPublicId}
                          onChange={(e) => setIntegrationPublicId(e.target.value)}
                          placeholder="Public identifier only"
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label className="text-[12px]">Credential env vars</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => applyIntegrationPreset(integrationProvider)}
                          >
                            Reset preset rows
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {integrationEnvVars.map((row, idx) => (
                            <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="text-[10px] text-muted-foreground">Label</span>
                                <Input
                                  value={row.label}
                                  onChange={(e) => {
                                    const next = [...integrationEnvVars];
                                    next[idx] = { ...next[idx], label: e.target.value };
                                    setIntegrationEnvVars(next);
                                  }}
                                  placeholder="e.g. Access token"
                                  className="bg-background text-[12px]"
                                />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="text-[10px] text-muted-foreground">Env variable name</span>
                                <Input
                                  value={row.envVarName}
                                  onChange={(e) => {
                                    const next = [...integrationEnvVars];
                                    next[idx] = {
                                      ...next[idx],
                                      envVarName: normalizeEnvVarName(e.target.value),
                                    };
                                    setIntegrationEnvVars(next);
                                  }}
                                  placeholder="INTERCOM_ACCESS_TOKEN"
                                  className="bg-background font-mono text-[12px]"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9 shrink-0 text-[11px] text-muted-foreground"
                                onClick={() =>
                                  setIntegrationEnvVars((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px]"
                          onClick={() =>
                            setIntegrationEnvVars((prev) => [
                              ...prev,
                              { label: "", envVarName: "" },
                            ])
                          }
                        >
                          Add env var row
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="int-notes">How agents should use this (optional)</Label>
                        <Textarea
                          id="int-notes"
                          value={integrationNotes}
                          onChange={(e) => setIntegrationNotes(e.target.value)}
                          rows={3}
                          placeholder="e.g. Use Mixpanel export API for funnel X; Intercom for conversation tags…"
                          className="resize-y bg-background text-[12px]"
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Files (optional, max {MAX_KNOWLEDGE_FILES})</Label>
                  <button
                    type="button"
                    className={dropzoneClass}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragFiles(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      if (e.currentTarget === e.target) setDragFiles(false);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragFiles(false);
                      addKnowledgeFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-5 opacity-50" aria-hidden />
                    <span>
                      Drop PDF, CSV, TXT, or XLSX or{" "}
                      <span className="text-foreground underline-offset-2 hover:underline">browse</span>
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.csv,.txt,.xlsx,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) addKnowledgeFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {files.length ? (
                    <ul className="flex flex-col gap-1 text-[12px] text-muted-foreground">
                      {files.map((f) => (
                        <li
                          key={`${f.name}-${f.size}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2 py-1"
                        >
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            className="shrink-0 text-foreground hover:underline"
                            onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <Button type="submit" disabled={saving || !title.trim()}>
                  {saving ? "Saving…" : "Save entry"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
