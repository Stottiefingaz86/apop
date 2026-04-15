export const MAX_KNOWLEDGE_FILES = 2;
/** Per-file decoded size */
export const MAX_KNOWLEDGE_PDF_BYTES = 2 * 1024 * 1024;
export const MAX_KNOWLEDGE_SHEET_BYTES = 1_200 * 1024;
/** Total stored extract across all files for one entry */
export const MAX_KNOWLEDGE_COMBINED_EXTRACT = 100_000;

export type KnowledgeFileInput = { name: string; mimeType: string; dataBase64: string };

const ALLOWED = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function extOk(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".pdf") || n.endsWith(".csv") || n.endsWith(".txt") || n.endsWith(".xlsx");
}

export function validateKnowledgeAttachments(
  files: KnowledgeFileInput[] | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!files?.length) return { ok: true };
  if (files.length > MAX_KNOWLEDGE_FILES) {
    return { ok: false, error: `At most ${MAX_KNOWLEDGE_FILES} files per entry.` };
  }
  for (const f of files) {
    if (!extOk(f.name)) {
      return { ok: false, error: `Unsupported file type: ${f.name} (use PDF, CSV, TXT, or XLSX).` };
    }
    const mime = f.mimeType.toLowerCase();
    const xlsxName = f.name.toLowerCase().endsWith(".xlsx");
    const okMime =
      ALLOWED.has(mime) ||
      mime.includes("pdf") ||
      mime.includes("csv") ||
      mime.includes("sheet") ||
      (xlsxName && mime === "application/octet-stream");
    if (!okMime) {
      return { ok: false, error: `Unsupported MIME for “${f.name}”.` };
    }
  }
  return { ok: true };
}
