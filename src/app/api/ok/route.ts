import { NextResponse } from "next/server";

/** If this fails with "Internal Server Error", run: npm run dev:clean */
export async function GET() {
  return NextResponse.json({ ok: true, message: "server is running" });
}
