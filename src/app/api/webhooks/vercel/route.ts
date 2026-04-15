import { NextResponse } from "next/server";
import { getVercelWebhookSecret } from "@/lib/vercel/env";
import { syncReleaseFromVercelWebhook, type VercelWebhookBody } from "@/lib/vercel/release-sync";
import { verifyVercelWebhookSignature } from "@/lib/vercel/webhook-verify";

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = getVercelWebhookSecret();
  const sig = req.headers.get("x-vercel-signature");

  if (secret) {
    const ok = verifyVercelWebhookSignature(raw, sig, secret);
    if (!ok) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as VercelWebhookBody & Record<string, unknown>;
  const result = await syncReleaseFromVercelWebhook(b, b);

  return NextResponse.json(result);
}
