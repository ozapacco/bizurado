import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = (await req.json().catch(() => ({}))) as {
    topicId?: number;
    priority?: number;
  };

  const topicId = Number(body.topicId);
  const priority = Number(body.priority);

  if (
    !Number.isInteger(priority) ||
    priority < 1 ||
    priority > 5
  ) {
    return NextResponse.json(
      { error: "priority must be an integer between 1 and 5" },
      { status: 400 }
    );
  }

  const topic = db
    .prepare("SELECT id FROM topics WHERE id = ?")
    .get(topicId) as { id: number } | undefined;
  if (!topic) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  db.prepare("UPDATE topic_study SET priority = ? WHERE topic_id = ?").run(
    priority,
    topicId
  );

  return NextResponse.json({ topicId, priority });
}
