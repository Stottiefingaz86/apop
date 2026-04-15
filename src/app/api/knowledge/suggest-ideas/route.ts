import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { prismaErrorToHttpResponse } from "@/lib/prisma-http-error";
import { loadWorkspaceKnowledgeBriefForAgents } from "@/lib/data/workspace-knowledge-load";
import { suggestIdeasFromKnowledgeBrief } from "@/lib/llm/knowledge-suggest-ideas-llm";

const bodySchema = z.object({
  maxIdeas: z.number().int().min(1).max(8).optional(),
});

/**
 * Uses workspace Knowledge + LLM to create Feature rows in INBOX (draft ideas).
 */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const maxIdeas = parsed.data.maxIdeas ?? 5;

  let brief: string | null;
  try {
    brief = await loadWorkspaceKnowledgeBriefForAgents();
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  if (!brief?.trim()) {
    return NextResponse.json(
      { error: "Add knowledge entries (text or files) before generating ideas." },
      { status: 400 },
    );
  }

  const ideas = await suggestIdeasFromKnowledgeBrief(brief, maxIdeas);
  if (!ideas?.length) {
    return NextResponse.json(
      { error: "Could not generate ideas right now. Try again shortly, or check workspace AI settings." },
      { status: 503 },
    );
  }

  const created: { id: string; title: string }[] = [];
  try {
    for (const idea of ideas) {
      const f = await prisma.feature.create({
        data: {
          title: idea.title.slice(0, 200),
          description: idea.description.slice(0, 20_000),
          stage: "INBOX",
          status: "idle",
          contextPack: {
            source: "knowledge_suggest_ideas",
            note: "Draft idea generated from Workspace Knowledge — review before running agents.",
          },
        },
      });
      await prisma.designInputs.create({ data: { featureId: f.id } });
      created.push({ id: f.id, title: f.title });
    }
  } catch (e) {
    console.error("[knowledge/suggest-ideas] create features", e);
    const mapped = prismaErrorToHttpResponse(e);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json(
      { error: "Could not save ideas to the database. Check the server terminal." },
      { status: 500 },
    );
  }

  return NextResponse.json({ created, count: created.length });
}
