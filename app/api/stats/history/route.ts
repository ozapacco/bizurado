import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const history = db
    .prepare(
      `SELECT date(review_date) as date, COUNT(*) as count
       FROM review_log
       WHERE review_date >= datetime('now', '-14 days')
       GROUP BY date(review_date)
       ORDER BY date ASC`
    )
    .all() as { date: string; count: number }[];

  const filled: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const existing = history.find((h) => h.date === dateStr);
    filled.push({
      date: dateStr.slice(5),
      count: existing ? existing.count : 0,
    });
  }

  return NextResponse.json({ history: filled });
}
