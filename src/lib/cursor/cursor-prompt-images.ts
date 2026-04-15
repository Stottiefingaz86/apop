import type { ContextPack } from "@/lib/domain/context-pack";
import { probeImageDimensions } from "@/lib/image-dimensions";
import { referenceImagesForVision } from "@/lib/llm/context-pack-llm";

/** Cursor Cloud Agents API: max 5 images per https://cursor.com/docs/cloud-agent/api/endpoints */
const MAX_CURSOR_PROMPT_IMAGES = 5;

export type CursorPromptApiImage = {
  data: string;
  dimension: { width: number; height: number };
};

const FALLBACK_DIM = { width: 1200, height: 800 };

/**
 * Maps context-pack reference screenshots to Cursor `prompt.images` payload (raw base64 + dimensions).
 */
export function cursorPromptImagesFromContextPack(pack: ContextPack): CursorPromptApiImage[] {
  const imgs = referenceImagesForVision(pack).slice(0, MAX_CURSOR_PROMPT_IMAGES);
  return imgs.map((im) => {
    const dimension = probeImageDimensions(im.mimeType, im.dataBase64) ?? FALLBACK_DIM;
    return {
      data: im.dataBase64,
      dimension,
    };
  });
}

/** Short instruction so the model knows images are attached (Cursor UI may not show them inline). */
export function cursorPromptReferenceImagesPreamble(count: number): string {
  if (count <= 0) return "";
  return `[Reference UI: ${count} screenshot(s) are attached to this agent prompt as images — use them for layout, hierarchy, spacing, typography, and visible copy.]\n\n`;
}
