import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
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
  const db = getDb();

  const totalCards = (
    db.prepare("SELECT COUNT(*) as count FROM cards").get() as { count: number }
  ).count;

  const reviewedToday = (
    db.prepare(
      "SELECT COUNT(DISTINCT card_id) as count FROM review_log WHERE review_date >= ?"
    ).get(startOfTodayISO()) as { count: number }
  ).count;

  const dueToday = (
    db.prepare(
      "SELECT COUNT(*) as count FROM card_states WHERE due < ? AND COALESCE(suspended, 0) = 0"
    ).get(startOfNextDayISO()) as { count: number }
  ).count;

  const subjects = db
    .prepare(
      `SELECT s.id, s.name, COUNT(c.id) as cardCount
       FROM subjects s
       LEFT JOIN topics t ON t.subject_id = s.id
       LEFT JOIN cards c ON c.topic_id = t.id
       GROUP BY s.id
       ORDER BY s.name`
    )
    .all() as { id: number; name: string; cardCount: number }[];

  // Bucket every logged review into its LOCAL study day (rollover-aware), so the
  // streak uses the same "day" rule as the rest of the app. review_date may be an
  // ISO-Z instant (new rows) or legacy SQLite UTC text ("YYYY-MM-DD HH:MM:SS");
  // normalize the latter to UTC before parsing.
  const reviewRows = db
    .prepare("SELECT review_date FROM review_log")
    .all() as { review_date: string | null }[];
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
    db.prepare("SELECT COUNT(*) as count FROM review_log").get() as { count: number }
  ).count;

  let accuracy = 0;
  if (totalReviews > 0) {
    const goodReviews = (
      db.prepare(
        "SELECT COUNT(*) as count FROM review_log WHERE rating >= 3"
      ).get() as { count: number }
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
