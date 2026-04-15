import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight check for UI gating — does not require migrations if DB is unreachable.
 */
export async function GET() {
  const openaiApiKeySet = Boolean(process.env.OPENAI_API_KEY?.trim());
  const anthropicApiKeySet = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({
      database: false,
      reason: "DATABASE_URL not set",
      openaiApiKeySet,
      anthropicApiKeySet,
      /** Only value-analyst calls these; PRD/design agents are local templates */
      llmForValueAnalysis: openaiApiKeySet || anthropicApiKeySet,
    });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      database: true,
      openaiApiKeySet,
      anthropicApiKeySet,
      llmForValueAnalysis: openaiApiKeySet || anthropicApiKeySet,
    });
  } catch {
    return NextResponse.json({
      database: false,
      reason: "cannot reach database",
      openaiApiKeySet,
      anthropicApiKeySet,
      llmForValueAnalysis: openaiApiKeySet || anthropicApiKeySet,
    });
  }
}
