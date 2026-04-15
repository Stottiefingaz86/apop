import { z } from "zod";
import type { ReferenceImageInput, ReferencePdfInput } from "@/lib/domain/feature-attachment-limits";

const referenceImageSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  dataBase64: z.string().min(1),
});

const referencePdfSchema = z.object({
  name: z.string().min(1),
  dataBase64: z.string().min(1),
});

/**
 * Pull attachment fields out of raw JSON so `parseContextPack` never drops the rest of the pack on
 * attachment validation failure.
 */
export function extractContextPackAttachments(raw: unknown): {
  clean: Record<string, unknown>;
  referenceImages?: ReferenceImageInput[];
  referencePrdPdf?: ReferencePdfInput;
  attachmentError?: string;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { clean: {} };
  }
  const o = { ...(raw as Record<string, unknown>) };
  const riRaw = o.referenceImages;
  const pdfRaw = o.referencePrdPdf;
  delete o.referenceImages;
  delete o.referencePrdPdf;

  let referenceImages: ReferenceImageInput[] | undefined;
  if (riRaw !== undefined) {
    const parsed = z.array(referenceImageSchema).max(3).safeParse(riRaw);
    if (!parsed.success) {
      return { clean: o, attachmentError: "Invalid referenceImages: expected { name, mimeType, dataBase64 }[]" };
    }
    referenceImages = parsed.data;
  }

  let referencePrdPdf: ReferencePdfInput | undefined;
  if (pdfRaw !== undefined) {
    const parsed = referencePdfSchema.safeParse(pdfRaw);
    if (!parsed.success) {
      return { clean: o, attachmentError: "Invalid referencePrdPdf: expected { name, dataBase64 }" };
    }
    referencePrdPdf = parsed.data;
  }

  return { clean: o, referenceImages, referencePrdPdf };
}
