import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getApopAppUrl } from "@/lib/tracking/env";

const eventSchema = z.object({
  featureId: z.string().min(1).max(100),
  eventType: z.enum(["impression", "click"]),
  route: z.string().max(500).optional(),
  elementId: z.string().max(200).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).max(100),
});

/** Single event or batch — normalize to array */
function normalizePayload(body: unknown): z.infer<typeof eventSchema>[] {
  const batch = batchSchema.safeParse(body);
  if (batch.success) return batch.data.events;

  const single = eventSchema.safeParse(body);
  if (single.success) return [single.data];

  return [];
}

function getCorsHeaders(req: Request): Record<string, string> {
  const allowed = process.env.APOP_TRACKING_ALLOWED_ORIGINS?.trim() || "";
  const origins = allowed
    ? allowed.split(",").map((o) => o.trim()).filter(Boolean)
    : [process.env.APOP_DELIVERY_PRODUCTION_URL?.trim(), "https://site-apop.vercel.app"].filter(
        Boolean,
      );
  const origin = req.headers.get("origin") ?? "";
  const allow = origins.length && origins.includes(origin) ? origin : origins[0] || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** OPTIONS: CORS preflight for site-apop */
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

/** GET: API spec for site-apop — endpoint URL, payload format */
export async function GET(req: Request) {
  const headers = getCorsHeaders(req);
  const base = getApopAppUrl();
  return NextResponse.json(
    {
      endpoint: `${base}/api/tracking/events`,
      format: {
        single: {
          featureId: "string (APOP feature ID)",
          eventType: "impression | click",
          route: "optional pathname",
          elementId: "optional",
        },
        batch: {
          events: "[{ featureId, eventType, route?, elementId? }]",
        },
      },
      attribution:
        "Read data-apop-feature-id from DOM; include in payload. Tag new components when Cursor builds.",
    },
    { headers },
  );
}

/** POST: receive journey map tracking events from site-apop */
export async function POST(req: Request) {
  const headers = getCorsHeaders(req);
  try {
    const body = await req.json().catch(() => ({}));
    const events = normalizePayload(body);

    if (events.length === 0) {
      return NextResponse.json(
        { error: "Invalid payload", hint: "Send { events: [{ featureId, eventType }] } or single event" },
        { status: 400, headers },
      );
    }

    const featureIds = [...new Set(events.map((e) => e.featureId))];
    const existing = await prisma.feature.findMany({
      where: { id: { in: featureIds } },
      select: { id: true },
    });
    const validIds = new Set(existing.map((f) => f.id));

    const toCreate = events.filter((e) => validIds.has(e.featureId));
    if (toCreate.length > 0) {
      await prisma.journeyTrackingEvent.createMany({
        data: toCreate.map((e) => ({
          featureId: e.featureId,
          eventType: e.eventType,
          route: e.route ?? null,
          elementId: e.elementId ?? null,
        })),
      });
    }

    return NextResponse.json(
      {
        accepted: toCreate.length,
        skipped: events.length - toCreate.length,
      },
      { headers },
    );
  } catch (err) {
    console.error("[tracking/events] POST error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
