import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // review_date is text ISO-8601 'Z'; left(.,10) is its UTC date. Window cutoff
  // computed in JS to avoid SQLite-only datetime('now', ...) helpers.
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();

  const history = (await query(
    `SELECT left(review_date, 10) as date, COUNT(*)::int as count
     FROM review_log
     WHERE review_date >= $1
     GROUP BY left(review_date, 10)
     ORDER BY date ASC`,
    [cutoff]
  )) as { date: string; count: number }[];

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
