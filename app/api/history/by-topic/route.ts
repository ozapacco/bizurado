import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// "What did I study, and when, per topic." Each row is one (day, topic) pair
// drawn from review_log JOIN cards JOIN topics JOIN subjects, grouped by
// date(review_date) and topic. Only days that actually had reviews appear.
interface HistoryRow {
  day: string;
  subjectId: number;
  subjectName: string;
  topicId: number;
  topicName: string;
  cardsEstudados: number;
  revisoes: number;
  goodRevs: number;
}

interface HistoryTopic {
  subjectName: string;
  topicName: string;
  topicId: number;
  cardsEstudados: number;
  revisoes: number;
  acertoPct: number | null;
}

interface HistoryDay {
  date: string;
  topics: HistoryTopic[];
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);

  // days window: default 30, clamp to [1, 365].
  let days = 30;
  const daysParam = searchParams.get("days");
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (!Number.isNaN(parsed)) days = parsed;
  }
  if (days < 1) days = 1;
  if (days > 365) days = 365;

  // Optional subject filter (id or name).
  const subjectIdParam = searchParams.get("subjectId");
  const subjectNameParam = searchParams.get("subject");
  let subjectFilterId: number | null = null;
  if (subjectIdParam) {
    const parsed = parseInt(subjectIdParam, 10);
    if (!Number.isNaN(parsed)) subjectFilterId = parsed;
  } else if (subjectNameParam) {
    const row = db
      .prepare("SELECT id FROM subjects WHERE name = ?")
      .get(subjectNameParam) as { id: number } | undefined;
    subjectFilterId = row ? row.id : -1;
  }

  // Window: reviews on or after (today - (days-1)), so days=1 means just today.
  const params: Record<string, unknown> = { days: days - 1 };
  let subjectClause = "";
  if (subjectFilterId !== null) {
    subjectClause = "AND s.id = @subjectId";
    params.subjectId = subjectFilterId;
  }

  const rows = db
    .prepare(
      `SELECT
         date(rl.review_date) AS day,
         s.id   AS subjectId,
         s.name AS subjectName,
         t.id   AS topicId,
         t.name AS topicName,
         COUNT(DISTINCT rl.card_id) AS cardsEstudados,
         COUNT(*)                   AS revisoes,
         SUM(CASE WHEN rl.rating >= 3 THEN 1 ELSE 0 END) AS goodRevs
       FROM review_log rl
       JOIN cards c    ON c.id = rl.card_id
       JOIN topics t   ON t.id = c.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE date(rl.review_date) >= date('now', '-' || @days || ' days')
         ${subjectClause}
       GROUP BY day, t.id
       ORDER BY day DESC, cardsEstudados DESC`
    )
    .all(params) as HistoryRow[];

  // Group flat rows into days (already ordered date desc, then cards desc).
  const dayMap = new Map<string, HistoryDay>();
  const history: HistoryDay[] = [];
  for (const r of rows) {
    let entry = dayMap.get(r.day);
    if (!entry) {
      entry = { date: r.day, topics: [] };
      dayMap.set(r.day, entry);
      history.push(entry);
    }
    entry.topics.push({
      subjectName: r.subjectName,
      topicName: r.topicName,
      topicId: r.topicId,
      cardsEstudados: r.cardsEstudados,
      revisoes: r.revisoes,
      acertoPct:
        r.revisoes > 0 ? Math.round((r.goodRevs / r.revisoes) * 100) : null,
    });
  }

  return NextResponse.json({ days, history });
}
