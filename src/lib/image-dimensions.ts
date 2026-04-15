/**
 * Read width/height from raster image bytes (for Cursor Cloud Agents `prompt.images[].dimension`).
 * Uses atob + Uint8Array only — no `node:buffer` so this module stays safe if bundled for the client.
 */
export function probeImageDimensions(
  mimeType: string,
  dataBase64: string,
): { width: number; height: number } | null {
  const buf = decodeBase64ToUint8Array(dataBase64);
  if (!buf || buf.length < 24) return null;
  const m = mimeType.toLowerCase();
  if (m === "image/png") return readPng(buf);
  if (m === "image/jpeg" || m === "image/jpg") return readJpeg(buf);
  if (m === "image/gif") return readGif(buf);
  return null;
}

function decodeBase64ToUint8Array(dataBase64: string): Uint8Array | null {
  try {
    const b64 = dataBase64.replace(/\s/g, "");
    if (!b64) return null;
    const bin = globalThis.atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  } catch {
    return null;
  }
}

function readU32BE(u8: Uint8Array, o: number): number {
  return (
    ((u8[o]! << 24) | (u8[o + 1]! << 16) | (u8[o + 2]! << 8) | u8[o + 3]!) >>> 0
  );
}

function readU16BE(u8: Uint8Array, o: number): number {
  return (u8[o]! << 8) | u8[o + 1]!;
}

function readU16LE(u8: Uint8Array, o: number): number {
  return u8[o]! | (u8[o + 1]! << 8);
}

function readPng(u8: Uint8Array): { width: number; height: number } | null {
  if (u8.length < 24 || readU32BE(u8, 0) !== 0x89504e47) return null;
  return { width: readU32BE(u8, 16), height: readU32BE(u8, 20) };
}

function readGif(u8: Uint8Array): { width: number; height: number } | null {
  if (u8.length < 10) return null;
  const sig = String.fromCharCode(u8[0]!, u8[1]!, u8[2]!, u8[3]!, u8[4]!, u8[5]!);
  if (sig !== "GIF87a" && sig !== "GIF89a") return null;
  return { width: readU16LE(u8, 6), height: readU16LE(u8, 8) };
}

function readJpeg(u8: Uint8Array): { width: number; height: number } | null {
  if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return null;
  let i = 2;
  while (i < u8.length - 9) {
    if (u8[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = u8[i + 1]!;
    if (marker === 0xd9 || marker === 0xda) break;
    const segLen = readU16BE(u8, i + 2);
    if (segLen < 2 || i + 2 + segLen > u8.length) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: readU16BE(u8, i + 5),
        width: readU16BE(u8, i + 7),
      };
    }
    i += 2 + segLen;
  }
  return null;
}
