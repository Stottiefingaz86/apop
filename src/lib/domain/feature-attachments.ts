import type { ReferenceImageInput, ReferencePdfInput } from "@/lib/domain/feature-attachment-limits";
import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_REFERENCE_IMAGES,
} from "@/lib/domain/feature-attachment-limits";

export {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_REFERENCE_IMAGES,
  type ReferenceImageInput,
  type ReferencePdfInput,
} from "@/lib/domain/feature-attachment-limits";

/** Decoded byte length for standard base64 (no Node Buffer — safe in client components). */
function decodedBase64ByteLength(b64: string): number {
  const s = b64.replace(/\s/g, "");
  if (s.length === 0) return 0;
  let padding = 0;
  if (s.endsWith("==")) padding = 2;
  else if (s.endsWith("=")) padding = 1;
  const n = (s.length * 3) / 4 - padding;
  if (n < 0 || !Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(n);
}

export function validateFeatureAttachments(input: {
  referenceImages?: ReferenceImageInput[];
  referencePrdPdf?: ReferencePdfInput | null;
}): { ok: true } | { ok: false; error: string } {
  const imgs = input.referenceImages ?? [];
  if (imgs.length > MAX_REFERENCE_IMAGES) {
    return { ok: false, error: `At most ${MAX_REFERENCE_IMAGES} images.` };
  }
  for (const im of imgs) {
    const n = decodedBase64ByteLength(im.dataBase64);
    if (n > MAX_IMAGE_BYTES) {
      return { ok: false, error: `Image “${im.name}” is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024)}KB).` };
    }
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(im.mimeType)) {
      return { ok: false, error: `Unsupported image type for “${im.name}”. Use PNG, JPEG, WebP, or GIF.` };
    }
  }
  const pdf = input.referencePrdPdf;
  if (pdf) {
    const n = decodedBase64ByteLength(pdf.dataBase64);
    if (n > MAX_PDF_BYTES) {
      return { ok: false, error: `PDF is too large (max ${Math.round(MAX_PDF_BYTES / 1024)}KB).` };
    }
    if (!pdf.name.toLowerCase().endsWith(".pdf")) {
      return { ok: false, error: "PRD attachment must be a .pdf file." };
    }
  }
  return { ok: true };
}
