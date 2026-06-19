import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = (await query(
    `SELECT
        CASE
          WHEN cs.difficulty >= 7 THEN 'Difícil'
          WHEN cs.difficulty >= 4 THEN 'Médio'
          WHEN cs.difficulty >= 1 THEN 'Fácil'
          ELSE 'Não avaliado'
        END as level,
        COUNT(*)::int as count
       FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       GROUP BY level
       ORDER BY
         CASE
           WHEN MIN(cs.difficulty) >= 7 THEN 3
           WHEN MIN(cs.difficulty) >= 4 THEN 2
           WHEN MIN(cs.difficulty) >= 1 THEN 1
           ELSE 4
         END`
  )) as { level: string; count: number }[];

  const distribution = cards.map((c) => ({
    name: c.level,
    value: c.count,
  }));

  return NextResponse.json({ distribution });
}
