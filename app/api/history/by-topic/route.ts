import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

// "What did I study, and when, per topic." Each row is one (day, topic) pair
// from review_log JOIN cards JOIN topics JOIN subjects, grouped by the UTC date
// of review_date and topic. Only days that actually had reviews appear.
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
    const row = (await queryOne("SELECT id FROM subjects WHERE name = $1", [
      subjectNameParam,
    ])) as { id: number } | undefined;
    subjectFilterId = row ? row.id : -1;
  }

  // Window: reviews on or after (today - (days-1)) in UTC, so days=1 = today.
  const cutoffDay = new Date(Date.now() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);

  const params: unknown[] = [cutoffDay];
  let subjectClause = "";
  if (subjectFilterId !== null) {
    params.push(subjectFilterId);
    subjectClause = `AND s.id = $${params.length}`;
  }

  const rows = (await query(
    `SELECT
       left(rl.review_date, 10)   AS day,
       s.id   AS "subjectId",
       s.name AS "subjectName",
       t.id   AS "topicId",
       t.name AS "topicName",
       COUNT(DISTINCT rl.card_id)::int AS "cardsEstudados",
       COUNT(*)::int                   AS "revisoes",
       SUM(CASE WHEN rl.rating >= 3 THEN 1 ELSE 0 END)::int AS "goodRevs"
     FROM review_log rl
     JOIN cards c    ON c.id = rl.card_id
     JOIN topics t   ON t.id = c.topic_id
     JOIN subjects s ON s.id = t.subject_id
     WHERE left(rl.review_date, 10) >= $1
       ${subjectClause}
     GROUP BY left(rl.review_date, 10), s.id, s.name, t.id, t.name
     ORDER BY day DESC, "cardsEstudados" DESC`,
    params
  )) as HistoryRow[];

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
