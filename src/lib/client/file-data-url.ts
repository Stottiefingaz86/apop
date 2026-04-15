/** Browser FileReader helpers for reference image uploads (client components only). */

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function stripDataUrl(dataUrl: string): { mimeType: string; dataBase64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  return { mimeType: m[1].trim(), dataBase64: m[2].replace(/\s/g, "") };
}
