import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import {
  todayStr,
  dayStrOf,
  startOfDay,
  startOfTodayISO,
  startOfNextDayISO,
} from "@/lib/day";

// Sempre ler o banco ao vivo (sem isto, o Next prerenderiza esta rota no build
// e serve um retrato congelado — ex.: faltando disciplinas importadas depois).
export const dynamic = "force-dynamic";

export async function GET() {
  const totalCards = (
    (await queryOne("SELECT COUNT(*)::int as count FROM cards")) as {
      count: number;
    }
  ).count;

  const reviewedToday = (
    (await queryOne(
      "SELECT COUNT(DISTINCT card_id)::int as count FROM review_log WHERE review_date >= $1",
      [startOfTodayISO()]
    )) as { count: number }
  ).count;

  const dueToday = (
    (await queryOne(
      "SELECT COUNT(*)::int as count FROM card_states WHERE due < $1 AND COALESCE(suspended, 0) = 0",
      [startOfNextDayISO()]
    )) as { count: number }
  ).count;

  const subjects = (await query(
    `SELECT s.id, s.name, COUNT(c.id)::int as "cardCount"
     FROM subjects s
     LEFT JOIN topics t ON t.subject_id = s.id
     LEFT JOIN cards c ON c.topic_id = t.id
     GROUP BY s.id
     ORDER BY s.name`
  )) as { id: number; name: string; cardCount: number }[];

  // Bucket every logged review into its LOCAL study day (rollover-aware).
  // review_date may be an ISO-Z instant (new rows) or legacy text; normalize.
  const reviewRows = (await query(
    "SELECT review_date FROM review_log"
  )) as { review_date: string | null }[];
  const reviewDaySet = new Set<string>();
  for (const row of reviewRows) {
    if (!row.review_date) continue;
    const iso = row.review_date.includes("T")
      ? row.review_date
      : row.review_date.replace(" ", "T") + "Z";
    reviewDaySet.add(dayStrOf(new Date(iso)));
  }

  let streak = 0;
  let cursor = startOfDay(todayStr());
  for (let i = 0; i < 1000; i++) {
    if (reviewDaySet.has(dayStrOf(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  const totalReviews = (
    (await queryOne("SELECT COUNT(*)::int as count FROM review_log")) as {
      count: number;
    }
  ).count;

  let accuracy = 0;
  if (totalReviews > 0) {
    const goodReviews = (
      (await queryOne(
        "SELECT COUNT(*)::int as count FROM review_log WHERE rating >= 3"
      )) as { count: number }
    ).count;
    accuracy = Math.round((goodReviews / totalReviews) * 100);
  }

  return NextResponse.json({
    totalCards,
    reviewedToday,
    dueToday,
    streak,
    accuracy,
    subjects,
  });
}
