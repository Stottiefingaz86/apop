"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_REFERENCE_IMAGES,
} from "@/lib/domain/feature-attachment-limits";
import { readFileAsDataUrl, stripDataUrl } from "@/lib/client/file-data-url";

function errorMessageFromApiBody(j: unknown): string | null {
  if (!j || typeof j !== "object") return null;
  const e = (j as { error?: unknown }).error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "formErrors" in e) {
    const fe = (e as { formErrors?: string[] }).formErrors;
    if (Array.isArray(fe) && fe[0]) return fe[0];
  }
  return null;
}

function humanizeDbReason(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "timed_out") return "Could not verify the database in time (slow network or server).";
  if (reason === "fetch_failed") return "Could not reach the app health check.";
  if (reason === "DATABASE_URL not set") return "DATABASE_URL is not set in .env.";
  if (reason === "cannot reach database") return "The app cannot reach Postgres with the current DATABASE_URL.";
  return reason;
}

export function NewFeatureForm({
  onCreated,
  className,
  submitLabel = "Create feature",
}: {
  onCreated?: (feature: { id: string }) => void;
  className?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [dbReason, setDbReason] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<"img" | "pdf" | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const healthSeqRef = useRef(0);

  const previewUrls = useMemo(
    () => imageFiles.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [imageFiles],
  );

  useEffect(() => {
    return () => previewUrls.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previewUrls]);

  const recheckHealth = useCallback(() => {
    const seq = ++healthSeqRef.current;
    setDbReady(null);
    setDbReason(null);
    const t = window.setTimeout(() => {
      if (healthSeqRef.current !== seq) return;
      setDbReady(false);
      setDbReason((prev) => prev ?? "timed_out");
    }, 10_000);
    void fetch("/api/health")
      .then((r) => r.json())
      .then((j: { database?: boolean; reason?: string }) => {
        if (healthSeqRef.current !== seq) return;
        window.clearTimeout(t);
        setDbReady(!!j.database);
        setDbReason(typeof j.reason === "string" ? j.reason : null);
      })
      .catch(() => {
        if (healthSeqRef.current !== seq) return;
        window.clearTimeout(t);
        setDbReady(false);
        setDbReason("fetch_failed");
      });
  }, []);

  useEffect(() => {
    recheckHealth();
  }, [recheckHealth]);

  function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImageFiles((prev) => {
      const next = [...prev];
      for (const f of list) {
        if (next.length >= MAX_REFERENCE_IMAGES) break;
        if (f.size > MAX_IMAGE_BYTES) continue;
        if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
        next.push(f);
      }
      return next;
    });
  }

  function onPdfPick(file: File | null) {
    if (!file) {
      setPdfFile(null);
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("PRD must be a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`PDF must be under ${Math.round(MAX_PDF_BYTES / 1024)}KB.`);
      return;
    }
    setError(null);
    setPdfFile(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const referenceImages: { name: string; mimeType: string; dataBase64: string }[] = [];
    try {
      for (const f of imageFiles) {
        const dataUrl = await readFileAsDataUrl(f);
        const stripped = stripDataUrl(dataUrl);
        if (!stripped) throw new Error(`Could not read image “${f.name}”.`);
        referenceImages.push({ name: f.name, mimeType: stripped.mimeType, dataBase64: stripped.dataBase64 });
      }

      let referencePrdPdf: { name: string; dataBase64: string } | undefined;
      if (pdfFile) {
        const dataUrl = await readFileAsDataUrl(pdfFile);
        const stripped = stripDataUrl(dataUrl);
        if (!stripped) throw new Error("Could not read PDF.");
        referencePrdPdf = { name: pdfFile.name, dataBase64: stripped.dataBase64 };
      }

      const contextPack =
        referenceImages.length || referencePrdPdf
          ? {
              ...(referenceImages.length ? { referenceImages } : {}),
              ...(referencePrdPdf ? { referencePrdPdf } : {}),
            }
          : undefined;

      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, contextPack }),
      });
      setBusy(false);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(
          errorMessageFromApiBody(j) ??
            (res.status >= 500
              ? `Server error (${res.status}). Often the database is unreachable or the schema needs prisma db push.`
              : "Could not create feature"),
        );
        return;
      }
      const f = (await res.json()) as { id: string };
      setTitle("");
      setDescription("");
      setImageFiles([]);
      setPdfFile(null);
      onCreated?.(f);
      router.refresh();
      if (!onCreated) router.push("/pipeline");
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const imgZoneProps = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTarget("img");
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === e.target) setDragTarget(null);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTarget(null);
      addImageFiles(e.dataTransfer.files);
    },
  };

  const pdfZoneProps = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTarget("pdf");
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === e.target) setDragTarget(null);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTarget(null);
      const f = Array.from(e.dataTransfer.files).find(
        (x) => x.type === "application/pdf" || x.name.toLowerCase().endsWith(".pdf"),
      );
      onPdfPick(f ?? null);
    },
  };

  return (
    <form className={cn("flex flex-col gap-5", className)} onSubmit={onSubmit}>
      {dbReady === false ? (
        <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/90 p-3 text-[13px] leading-relaxed text-amber-950">
          <p className="font-medium">Database not available — nothing can be saved to Inbox</p>
          <p>
            {humanizeDbReason(dbReason) ??
              "The app cannot reach Postgres. Start Docker (`npm run db:up`), point DATABASE_URL at localhost:5432 (see .env.example), run `npx prisma db push`, then restart the dev server."}
          </p>
          <p>
            After the database responds, run{" "}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[12px] shadow-sm">
              npx prisma db push
            </code>{" "}
            if you upgraded APOP so tables and columns stay in sync.
          </p>
          <Button type="button" variant="outline" size="sm" className="border-amber-300 bg-white/80" onClick={recheckHealth}>
            Recheck database
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="nf-title">Title</Label>
        <Input
          id="nf-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Short, actionable title"
          className="bg-background"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nf-desc">Description</Label>
        <Textarea
          id="nf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Problem, users, constraints — what agents should treat as fact"
          rows={4}
          className="resize-y bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <ImageIcon className="size-3.5 opacity-60" aria-hidden />
          Screenshots <span className="font-normal text-muted-foreground">(optional, up to {MAX_REFERENCE_IMAGES})</span>
        </Label>
        <button
          type="button"
          className={cn(
            "flex min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-[13px] text-muted-foreground transition-colors hover:bg-muted/35",
            dragTarget === "img" && "border-foreground/40 bg-muted/45 text-foreground",
          )}
          {...imgZoneProps}
          onClick={() => imgInputRef.current?.click()}
        >
          <Upload className="size-5 opacity-50" aria-hidden />
          <span>
            Drop images here or <span className="text-foreground underline-offset-2 hover:underline">browse</span>
          </span>
          <span className="text-[11px] opacity-80">PNG, JPEG, WebP, GIF — max {Math.round(MAX_IMAGE_BYTES / 1024)}KB each</span>
        </button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addImageFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {previewUrls.length ? (
          <ul className="flex flex-wrap gap-2 pt-1">
            {previewUrls.map(({ file, url }) => (
              <li
                key={url}
                className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-card"
              >
                <img src={url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 rounded bg-background/90 px-1 text-[10px] font-medium shadow"
                  onClick={() => setImageFiles((prev) => prev.filter((x) => x !== file))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <FileText className="size-3.5 opacity-60" aria-hidden />
          PRD PDF <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <button
          type="button"
          className={cn(
            "flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-center text-[13px] text-muted-foreground transition-colors hover:bg-muted/35",
            dragTarget === "pdf" && "border-foreground/40 bg-muted/45 text-foreground",
          )}
          {...pdfZoneProps}
          onClick={() => pdfInputRef.current?.click()}
        >
          <span>
            {pdfFile ? (
              <span className="text-foreground">{pdfFile.name}</span>
            ) : (
              <>
                Drop a PDF or <span className="text-foreground underline-offset-2 hover:underline">browse</span>
              </>
            )}
          </span>
          <span className="text-[11px] opacity-80">Max {Math.round(MAX_PDF_BYTES / 1024)}KB — filename helps agents</span>
        </button>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onPdfPick(f);
            e.target.value = "";
          }}
        />
        {pdfFile ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 self-start px-2 text-[12px]" onClick={() => setPdfFile(null)}>
            Remove PDF
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}

      <Button type="submit" disabled={busy || dbReady === false || dbReady === null} className="w-full sm:w-auto">
        {busy ? "Creating…" : dbReady === null ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}
