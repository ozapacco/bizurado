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

  const topics = (await query(
    `SELECT t.id, t.name, t.file_path as "filePath", COUNT(c.id)::int as "cardCount"
     FROM topics t
     LEFT JOIN cards c ON c.topic_id = t.id
     WHERE t.subject_id = $1
     GROUP BY t.id
     ORDER BY t.name`,
    [subject.id]
  )) as { id: number; name: string; filePath: string; cardCount: number }[];

  return NextResponse.json({ subject: { ...subject, dueCount }, topics });
}
