/** Shared limits for optional reference uploads (client + API). */
export const MAX_REFERENCE_IMAGES = 3;
export const MAX_IMAGE_BYTES = 600 * 1024;
export const MAX_PDF_BYTES = 1_200 * 1024;

export type ReferenceImageInput = { name: string; mimeType: string; dataBase64: string };
export type ReferencePdfInput = { name: string; dataBase64: string };
