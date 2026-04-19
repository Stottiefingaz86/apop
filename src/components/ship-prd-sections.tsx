"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown } from "lucide-react";
import { splitMarkdownSections } from "@/lib/domain/markdown-sections";
import { shipPrdMarkdownComponents } from "@/components/ship-prd-markdown";
import { cn } from "@/lib/utils";

/**
 * Icon + tone for well-known Ship PRD sections. Anything unknown falls back
 * to the `default` entry.
 */
const SECTION_TONE: Record<
  string,
  { dot: string; chip: string; order: number }
> = {
  "delivery-target": { dot: "bg-sky-500", chip: "Delivery", order: 0 },
  idea: { dot: "bg-amber-500", chip: "Idea", order: 1 },
  value: { dot: "bg-emerald-500", chip: "Value", order: 2 },
  design: { dot: "bg-violet-500", chip: "Design", order: 3 },
  "cursor-prompt-implementation-brief": {
    dot: "bg-primary",
    chip: "Cursor prompt",
    order: 4,
  },
  "spec-tasks": { dot: "bg-primary/70", chip: "Tasks", order: 5 },
  "tasks-execute-in-order": { dot: "bg-primary/70", chip: "Tasks", order: 5 },
  implementation: { dot: "bg-slate-500", chip: "Implementation", order: 6 },
  deployment: { dot: "bg-slate-500", chip: "Deployment", order: 7 },
  default: { dot: "bg-muted-foreground", chip: "Section", order: 99 },
};

const ALWAYS_OPEN: string[] = ["delivery-target", "idea", "value"];

type Props = {
  markdown: string;
  /** Heading rendered as the doc title (defaults to the H1 in the markdown). */
  docTitle?: string;
};

export function ShipPrdSectionList({ markdown, docTitle }: Props) {
  const sections = useMemo(() => splitMarkdownSections(markdown), [markdown]);

  const h1 = useMemo(() => {
    const m = /^#\s+(.+?)\s*$/m.exec(markdown);
    return m?.[1]?.trim() || docTitle || null;
  }, [markdown, docTitle]);

  // Separate optional preamble (anything before the first ##) from real sections.
  const { preamble, namedSections } = useMemo(() => {
    const named = sections.filter((s) => s.title !== "");
    const intro = sections.find((s) => s.title === "" && s.body.trim() !== "");
    return { preamble: intro?.body ?? "", namedSections: named };
  }, [sections]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of namedSections) {
      init[s.id] = ALWAYS_OPEN.includes(s.id);
    }
    return init;
  });

  return (
    <div className="flex flex-col gap-3">
      {h1 ? (
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
          {h1}
        </h1>
      ) : null}

      {preamble.trim() ? (
        <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-[0.9rem] leading-relaxed text-muted-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={shipPrdMarkdownComponents()}
          >
            {preamble}
          </ReactMarkdown>
        </div>
      ) : null}

      {namedSections.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No content yet — approve earlier stages to fill this PRD.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {namedSections
          .slice()
          .sort((a, b) => {
            const ao = SECTION_TONE[a.id]?.order ?? SECTION_TONE.default.order;
            const bo = SECTION_TONE[b.id]?.order ?? SECTION_TONE.default.order;
            return ao - bo;
          })
          .map((s) => {
            const tone = SECTION_TONE[s.id] ?? SECTION_TONE.default;
            const isOpen = openMap[s.id] ?? false;
            return (
              <section
                key={s.id}
                className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenMap((m) => ({ ...m, [s.id]: !isOpen }))
                  }
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 border-b border-transparent px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn("h-1.5 w-1.5 rounded-full", tone.dot)}
                    />
                    <span className="text-[0.8125rem] font-semibold tracking-tight text-foreground">
                      {s.title}
                    </span>
                    <span className="rounded-full border border-border/60 bg-background/80 px-1.5 py-[1px] text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {tone.chip}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen ? "rotate-180" : "rotate-0",
                    )}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div className="border-t border-border/60 px-4 py-3">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={shipPrdMarkdownComponents()}
                    >
                      {s.body || "_Not provided yet._"}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="border-t border-border/60 bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground">
                    {sectionPreview(s.body)}
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}

function sectionPreview(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "No content yet — tap to expand.";
  return plain.length > 140 ? `${plain.slice(0, 137)}…` : plain;
}
