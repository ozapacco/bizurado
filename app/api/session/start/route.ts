import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { todayStr } from "@/lib/day";

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = (await req.json().catch(() => ({}))) as { topicId?: number };
  const topicId = Number(body.topicId);

  const topic = db
    .prepare("SELECT id FROM topics WHERE id = ?")
    .get(topicId) as { id: number } | undefined;
  if (!topic) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  // Return an already-open session if one exists for this topic.
  const open = db
    .prepare(
      `SELECT id, topic_id, started_at
       FROM topic_sessions
       WHERE topic_id = ? AND finished_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(topicId) as
    | { id: number; topic_id: number; started_at: string }
    | undefined;
  if (open) {
    return NextResponse.json({
      sessionId: open.id,
      topicId: open.topic_id,
      startedAt: open.started_at,
    });
  }

  const study = db
    .prepare("SELECT study_count FROM topic_study WHERE topic_id = ?")
    .get(topicId) as { study_count: number } | undefined;
  const repNumber = (study?.study_count ?? 0) + 1;

  const startedAt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO topic_sessions (topic_id, day, started_at, finished_at, rep_number)
       VALUES (?, ?, ?, NULL, ?)`
    )
    .run(topicId, todayStr(), startedAt, repNumber);

  return NextResponse.json({
    sessionId: Number(info.lastInsertRowid),
    topicId,
    startedAt,
  });
}
