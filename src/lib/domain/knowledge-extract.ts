import { Buffer } from "node:buffer";
import {
  MAX_KNOWLEDGE_COMBINED_EXTRACT,
  MAX_KNOWLEDGE_PDF_BYTES,
  MAX_KNOWLEDGE_SHEET_BYTES,
  type KnowledgeFileInput,
} from "@/lib/domain/knowledge-attachment-limits";

function decodedLen(b64: string): number {
  try {
    return Buffer.from(b64, "base64").length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

async function extractOne(buf: Buffer, mimeType: string, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  try {
    if (mime.includes("pdf") || name.endsWith(".pdf")) {
      const mod = await import("pdf-parse");
      const fn = mod.default as (b: Buffer) => Promise<{ text?: string }>;
      const res = await fn(buf);
      return String(res?.text ?? "").trim();
    }

    if (name.endsWith(".csv") || mime === "text/csv" || name.endsWith(".txt") || mime === "text/plain") {
      return buf.toString("utf8").trim();
    }

    if (
      name.endsWith(".xlsx") ||
      mime.includes("spreadsheetml.sheet") ||
      mime === "application/vnd.ms-excel"
    ) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return "";
      const sheet = wb.Sheets[sheetName];
      return XLSX.utils.sheet_to_csv(sheet).trim();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `[Could not extract text from ${fileName}: ${msg}]`;
  }

  return "";
}

/**
 * Validates per-file size, extracts text from PDF/CSV/TXT/XLSX, concatenates with headings (truncated).
 */
export async function buildAttachmentExtractFromUploads(
  files: KnowledgeFileInput[],
): Promise<{ extract: string | null; fileMeta: { name: string; mimeType: string }[]; error?: string }> {
  const fileMeta: { name: string; mimeType: string }[] = [];
  const parts: string[] = [];

  for (const f of files) {
    const n = decodedLen(f.dataBase64);
    const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.mimeType.toLowerCase().includes("pdf");
    const max = isPdf ? MAX_KNOWLEDGE_PDF_BYTES : MAX_KNOWLEDGE_SHEET_BYTES;
    if (n > max) {
      return {
        extract: null,
        fileMeta: [],
        error: `“${f.name}” is too large (max ${Math.round(max / 1024)}KB).`,
      };
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(f.dataBase64, "base64");
    } catch {
      return { extract: null, fileMeta: [], error: `Invalid base64 for “${f.name}”.` };
    }

    fileMeta.push({ name: f.name, mimeType: f.mimeType });
    const text = await extractOne(buf, f.mimeType, f.name);
    if (text) {
      parts.push(`--- File: ${f.name} ---\n${text}`);
    }
  }

  let combined = parts.join("\n\n");
  if (combined.length > MAX_KNOWLEDGE_COMBINED_EXTRACT) {
    combined = `${combined.slice(0, MAX_KNOWLEDGE_COMBINED_EXTRACT)}\n\n…[truncated]`;
  }

  return { extract: combined.trim() || null, fileMeta };
}
