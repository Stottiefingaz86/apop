import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Minimal check — only imports Next. If this 500s, restart with: npm run dev:clean
 */
export async function GET() {
  try {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
    const key = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
      ""
    ).trim();

    if (!url || !key) {
      return NextResponse.json(
        {
          ok: false,
          step: "env",
          help: "In the APOP folder, open the file named .env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see SUPABASE_STEPS.txt).",
        },
        { status: 200 },
      );
    }

    const healthUrl = `${url}/auth/v1/health`;
    const res = await fetch(healthUrl, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    const text = await res.text();

    return NextResponse.json(
      {
        ok: res.ok,
        step: "auth_health",
        httpStatus: res.status,
        bodyPreview: text.slice(0, 200),
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        step: "error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 200 },
    );
  }
}
