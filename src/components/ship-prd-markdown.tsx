"use client";

import type { Components } from "react-markdown";
import Link from "next/link";

/**
 * Typography tuned for the Ship PRD document (readable, clear sectioning, calm pending states).
 * Main sections (h2) are rendered as prominent card headers for clarity.
 */
export function shipPrdMarkdownComponents(): Components {
  return {
    h1: ({ children }) => (
      <h1 className="mb-6 border-b border-border/70 pb-4 text-[1.375rem] font-semibold leading-tight tracking-tight text-foreground">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <div className="mb-4 mt-8 scroll-mt-6 first:mt-0">
        <div className="rounded-lg border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,15,15,0.04)] px-4 py-3">
          <h2 className="text-[1.0625rem] font-semibold leading-tight tracking-tight text-foreground">
            {children}
          </h2>
        </div>
      </div>
    ),
    h3: ({ children }) => (
      <h3 className="mb-2 mt-6 text-[0.9375rem] font-semibold text-foreground">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="mb-4 text-[0.9375rem] leading-[1.65] text-foreground/90 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-4 ml-1 list-disc space-y-2 pl-5 text-[0.9375rem] leading-relaxed text-foreground/90 marker:text-muted-foreground">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-4 ml-1 list-decimal space-y-2 pl-5 text-[0.9375rem] leading-relaxed text-foreground/90 marker:text-muted-foreground">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="not-italic text-foreground/80">{children}</em>,
    a: ({ href, children }) => {
      const h = href ?? "#";
      const external = h.startsWith("http");
      if (external) {
        return (
          <a
            href={h}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline decoration-primary/35 underline-offset-[3px] transition-colors hover:decoration-primary"
          >
            {children}
          </a>
        );
      }
      return (
        <Link href={h} className="font-medium text-primary underline-offset-2 hover:underline">
          {children}
        </Link>
      );
    },
    code: ({ children, className }) => {
      const inline = !className;
      if (inline) {
        return (
          <code className="rounded-md border border-border/60 bg-muted/80 px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground">
            {children}
          </code>
        );
      }
      return (
        <code className={`font-mono text-[0.8125rem] text-foreground ${className ?? ""}`}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mb-4 overflow-x-auto rounded-xl border border-border/80 bg-muted/40 p-4 text-[0.8125rem] leading-relaxed">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-4 rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-amber-50/40 px-4 py-3.5 text-[0.875rem] leading-relaxed text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-amber-900/40 dark:from-amber-950/50 dark:to-amber-950/20 dark:text-amber-50/95 dark:shadow-none">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="mb-4 overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[280px] border-collapse text-[0.875rem]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
    th: ({ children }) => (
      <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-border/60 px-3 py-2 text-foreground/90">{children}</td>
    ),
    hr: () => <hr className="my-8 border-border/60" />,
  };
}
