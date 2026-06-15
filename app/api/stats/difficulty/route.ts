import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const cards = db
    .prepare(
      `SELECT
        CASE
          WHEN cs.difficulty >= 7 THEN 'Difícil'
          WHEN cs.difficulty >= 4 THEN 'Médio'
          WHEN cs.difficulty >= 1 THEN 'Fácil'
          ELSE 'Não avaliado'
        END as level,
        COUNT(*) as count
       FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       GROUP BY level
       ORDER BY
         CASE level
           WHEN 'Fácil' THEN 1
           WHEN 'Médio' THEN 2
           WHEN 'Difícil' THEN 3
           ELSE 4
         END`
    )
    .all() as { level: string; count: number }[];

  const distribution = cards.map((c) => ({
    name: c.level,
    value: c.count,
  }));

  return NextResponse.json({ distribution });
}
