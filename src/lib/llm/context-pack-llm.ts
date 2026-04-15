import type { ContextPack } from "@/lib/domain/context-pack";

export type ReferenceImageForVision = {
  name: string;
  mimeType: string;
  dataBase64: string;
};

/**
 * JSON-safe view of context pack for LLM prompts (no raw base64 blobs).
 */
export function contextPackForLlmJson(pack: ContextPack): Record<string, unknown> {
  const p = pack as Record<string, unknown>;
  const imgs = p.referenceImages as ReferenceImageForVision[] | undefined;
  const pdf = p.referencePrdPdf as { name: string; dataBase64: string } | undefined;
  const { referenceImages: _ri, referencePrdPdf: _rp, ...rest } = p;
  return {
    ...rest,
    referenceImageSummaries: imgs?.map((i) => ({ name: i.name, mimeType: i.mimeType })),
    referencePrdPdfAttached: pdf
      ? {
          fileName: pdf.name,
          note: "A PDF was attached. Text is not auto-extracted in APOP yet — lean on filename, title, and description; acknowledge the attachment in your analysis if relevant.",
        }
      : undefined,
  };
}

export function referenceImagesForVision(pack: ContextPack): ReferenceImageForVision[] {
  const imgs = (pack as { referenceImages?: ReferenceImageForVision[] }).referenceImages;
  if (!Array.isArray(imgs)) return [];
  return imgs.filter(
    (i) =>
      i &&
      typeof i.name === "string" &&
      typeof i.mimeType === "string" &&
      typeof i.dataBase64 === "string",
  );
}

export function anthropicImageMediaType(
  mime: string,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/gif") return "image/gif";
  if (m === "image/webp") return "image/webp";
  return null;
}
