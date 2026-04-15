/**
 * Best-effort HTTPS fetch of knowledge reference URLs to give agents page text (not a browser).
 * Guarded against obvious SSRF targets. Disable entirely with APOP_FETCH_KNOWLEDGE_URLS=0|false.
 */

const MAX_RESPONSE_BYTES = 400_000;
const MAX_OUTPUT_CHARS = 8_000;
const TIMEOUT_MS = 12_000;

function fetchKnowledgeUrlsEnabled(): boolean {
  const v = process.env.APOP_FETCH_KNOWLEDGE_URLS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

function isLikelySafeFetchHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  if (h.endsWith(".local")) return false;
  if (h === "0.0.0.0") return false;

  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = ip.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns plain text excerpt or null if unsafe, too small, or fetch failed.
 */
export async function tryFetchReferenceUrlPreview(urlStr: string): Promise<string | null> {
  if (!fetchKnowledgeUrlsEnabled()) return null;

  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!isLikelySafeFetchHost(u.hostname)) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(urlStr, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "User-Agent": "APOP-KnowledgeRef/1.0 (internal; excerpt for product agents)",
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) return null;
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const ct = res.headers.get("content-type") ?? "";
    const text = ct.includes("text/html") || ct.includes("application/xhtml")
      ? stripHtmlToText(raw)
      : raw.replace(/\s+/g, " ").trim();
    const out = text.slice(0, MAX_OUTPUT_CHARS).trim();
    return out.length >= 120 ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
