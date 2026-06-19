import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { todayStr } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { topicId?: number };
  const topicId = Number(body.topicId);

  const topic = (await queryOne("SELECT id FROM topics WHERE id = $1", [
    topicId,
  ])) as { id: number } | undefined;
  if (!topic) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  // Return an already-open session if one exists for this topic.
  const open = (await queryOne(
    `SELECT id, topic_id, started_at
     FROM topic_sessions
     WHERE topic_id = $1 AND finished_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [topicId]
  )) as { id: number; topic_id: number; started_at: string } | undefined;
  if (open) {
    return NextResponse.json({
      sessionId: open.id,
      topicId: open.topic_id,
      startedAt: open.started_at,
    });
  }

  const study = (await queryOne(
    "SELECT study_count FROM topic_study WHERE topic_id = $1",
    [topicId]
  )) as { study_count: number } | undefined;
  const repNumber = (study?.study_count ?? 0) + 1;

  const startedAt = new Date().toISOString();
  const inserted = (await queryOne(
    `INSERT INTO topic_sessions (topic_id, day, started_at, finished_at, rep_number)
     VALUES ($1, $2, $3, NULL, $4)
     RETURNING id`,
    [topicId, todayStr(), startedAt, repNumber]
  )) as { id: number };

  return NextResponse.json({
    sessionId: inserted.id,
    topicId,
    startedAt,
  });
}
