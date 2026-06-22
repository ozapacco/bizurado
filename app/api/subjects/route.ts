import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    const subjects = await query(
      `SELECT s.id, s.name, COUNT(c.id)::int as "cardCount"
       FROM subjects s
       LEFT JOIN topics t ON t.subject_id = s.id
       LEFT JOIN cards c ON c.topic_id = t.id
       GROUP BY s.id
       ORDER BY s.name`
    );
    return NextResponse.json({ subjects });
  }

  const subject = (await queryOne(
    "SELECT id, name FROM subjects WHERE name = $1",
    [name]
  )) as { id: number; name: string } | undefined;

  if (!subject) {
    return NextResponse.json({ topics: [] });
  }

  const dueRow = (await queryOne(
    `SELECT COUNT(*)::int as count FROM card_states cs
     JOIN cards c ON c.id = cs.card_id
     JOIN topics t ON t.id = c.topic_id
     WHERE t.subject_id = $1 AND cs.due < $2 AND COALESCE(cs.suspended, 0) = 0`,
    [subject.id, startOfNextDayISO()]
  )) as { count: number };
  const dueCount = dueRow.count;

  // Per-deck (topic) study state for the /subjects list:
  //   voltas   = topic_study.study_count (vezes que o ciclo girou)
  //   dueNow   = cards JÁ vistos e vencidos hoje (para reativar)
  //   novos    = cards nunca vistos (reps = 0 ou sem card_states)
  //   maduros  = cards na memória (scheduled_days >= 21) -> base do % memória
  const boundary = startOfNextDayISO();
  const topics = (await query(
    `SELECT
       t.id,
       t.name,
       t.file_path AS "filePath",
       COUNT(c.id)::int AS "cardCount",
       COALESCE(ts.study_count, 0)::int AS "voltas",
       SUM(CASE WHEN cs.card_id IS NOT NULL
                 AND COALESCE(cs.reps, 0) > 0
                 AND cs.due < $2
                 AND COALESCE(cs.suspended, 0) = 0
                THEN 1 ELSE 0 END)::int AS "dueNow",
       SUM(CASE WHEN COALESCE(cs.reps, 0) = 0 THEN 1 ELSE 0 END)::int AS "novos",
       SUM(CASE WHEN COALESCE(cs.scheduled_days, 0) >= 21 THEN 1 ELSE 0 END)::int AS "maduros"
     FROM topics t
     LEFT JOIN cards c ON c.topic_id = t.id
     LEFT JOIN card_states cs ON cs.card_id = c.id
     LEFT JOIN topic_study ts ON ts.topic_id = t.id
     WHERE t.subject_id = $1
     GROUP BY t.id, t.name, t.file_path, t."order", ts.study_count
     ORDER BY t."order", t.name`,
    [subject.id, boundary]
  )) as {
    id: number;
    name: string;
    filePath: string;
    cardCount: number;
    voltas: number;
    dueNow: number;
    novos: number;
    maduros: number;
  }[];

  return NextResponse.json({ subject: { ...subject, dueCount }, topics });
}
