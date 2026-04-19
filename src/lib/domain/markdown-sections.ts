export type MarkdownSection = {
  /** Slug derived from the heading (safe for ids). */
  id: string;
  /** The H2 title, without the leading `## `. */
  title: string;
  /** Body markdown for this section only (no leading `##`). */
  body: string;
};

/**
 * Split a markdown document into top-level sections keyed by `## ` headings.
 * Anything before the first `## ` is returned as an "intro" section (title = "").
 *
 * We use this to render the Ship PRD as a stack of section Cards instead of
 * one big `ReactMarkdown` blob — it's much easier to scan at a glance.
 */
export function splitMarkdownSections(md: string): MarkdownSection[] {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const sections: MarkdownSection[] = [];

  let current: { title: string; bodyLines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.bodyLines.join("\n").replace(/^\n+|\n+$/g, "");
    if (current.title === "" && body.trim() === "") return;
    sections.push({
      id: slugify(current.title || "intro"),
      title: current.title,
      body,
    });
  };

  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = { title: m[1].trim(), bodyLines: [] };
    } else {
      if (!current) current = { title: "", bodyLines: [] };
      current.bodyLines.push(line);
    }
  }
  flush();

  return sections;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}
