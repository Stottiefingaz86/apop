import { getCursorAgentModel, getCursorApiKey } from "@/lib/cursor/env";

const BASE = "https://api.cursor.com";

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export type LaunchCursorAgentInput = {
  promptText: string;
  /** Cursor API native image attachments (not markdown); max 5 per request. */
  promptImages?: { data: string; dimension: { width: number; height: number } }[];
  repository: string;
  ref?: string;
  branchName?: string;
  autoCreatePr?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
};

export type CursorAgentApiShape = {
  id: string;
  name?: string;
  status?: string;
  source?: { repository?: string; ref?: string };
  target?: {
    branchName?: string;
    url?: string;
    prUrl?: string | null;
    autoCreatePr?: boolean;
  };
  summary?: string;
  createdAt?: string;
};

export async function launchCursorCloudAgent(
  input: LaunchCursorAgentInput,
): Promise<{ ok: true; agent: CursorAgentApiShape } | { ok: false; error: string; status?: number }> {
  const apiKey = getCursorApiKey();
  if (!apiKey) return { ok: false, error: "CURSOR_API_KEY is not set" };

  const prompt: Record<string, unknown> = { text: input.promptText };
  if (input.promptImages?.length) {
    prompt.images = input.promptImages.slice(0, 5).map((img) => ({
      data: img.data,
      dimension: img.dimension,
    }));
  }

  const body: Record<string, unknown> = {
    prompt,
    source: {
      repository: input.repository,
      ...(input.ref ? { ref: input.ref } : {}),
    },
    target: {
      autoCreatePr: input.autoCreatePr ?? true,
      ...(input.branchName ? { branchName: input.branchName } : {}),
    },
  };

  const model = getCursorAgentModel();
  if (model) body.model = model;

  if (input.webhookUrl) {
    body.webhook = {
      url: input.webhookUrl,
      ...(input.webhookSecret && input.webhookSecret.length >= 32
        ? { secret: input.webhookSecret }
        : {}),
    };
  }

  const res = await fetch(`${BASE}/v0/agents`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: text.slice(0, 2000) || `HTTP ${res.status}`,
      status: res.status,
    };
  }

  try {
    const agent = JSON.parse(text) as CursorAgentApiShape;
    if (!agent?.id) return { ok: false, error: "Invalid Cursor API response (no id)" };
    return { ok: true, agent };
  } catch {
    return { ok: false, error: "Invalid JSON from Cursor API" };
  }
}

export async function getCursorCloudAgent(
  cursorAgentId: string,
): Promise<
  { ok: true; agent: CursorAgentApiShape } | { ok: false; error: string; status?: number }
> {
  const apiKey = getCursorApiKey();
  if (!apiKey) return { ok: false, error: "CURSOR_API_KEY is not set" };

  const res = await fetch(`${BASE}/v0/agents/${encodeURIComponent(cursorAgentId)}`, {
    headers: { Authorization: basicAuthHeader(apiKey) },
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: text.slice(0, 2000) || `HTTP ${res.status}`,
      status: res.status,
    };
  }

  try {
    const agent = JSON.parse(text) as CursorAgentApiShape;
    return { ok: true, agent };
  } catch {
    return { ok: false, error: "Invalid JSON from Cursor API" };
  }
}

export { isCursorAgentFinished, isCursorAgentSucceeded } from "@/lib/cursor/agent-status";
