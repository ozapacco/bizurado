import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    topicId?: number;
    priority?: number;
  };

  const topicId = Number(body.topicId);
  const priority = Number(body.priority);

  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    return NextResponse.json(
      { error: "priority must be an integer between 1 and 5" },
      { status: 400 }
    );
  }

  const topic = (await queryOne("SELECT id FROM topics WHERE id = $1", [
    topicId,
  ])) as { id: number } | undefined;
  if (!topic) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  await execute(
    "UPDATE topic_study SET priority = $1 WHERE topic_id = $2",
    [priority, topicId]
  );

  return NextResponse.json({ topicId, priority });
}
