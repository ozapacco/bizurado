import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

// Uma "volta" = uma passada pelo baralho INTEIRO, em ordem de criação
// (c.id asc = início -> meio -> fim do arquivo). Cards já dominados (maduros e
// não vencidos) vêm marcados como mode:"rapido" — você confirma num piscar, mas
// continuam avaliáveis: uma nota baixa rebaixa o card (lapso do FSRS) e ele
// reentra no fluxo comum. Cards "dominado" (suspended) ficam de fora.
export const dynamic = "force-dynamic";

const MATURE_DAYS = 21; // mesmo limiar de "maduro" usado em /api/progress

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const topicId = Number(searchParams.get("topicId"));
  if (!Number.isInteger(topicId)) {
    return NextResponse.json({ error: "topicId required" }, { status: 400 });
  }

  const deck = (await queryOne(
    `SELECT t.id AS "topicId", t.name AS "topicName",
            s.name AS "subjectName",
            COALESCE(ts.study_count, 0)::int AS "voltas"
     FROM topics t
     JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN topic_study ts ON ts.topic_id = t.id
     WHERE t.id = $1`,
    [topicId]
  )) as
    | { topicId: number; topicName: string; subjectName: string; voltas: number }
    | undefined;

  if (!deck) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  const boundary = startOfNextDayISO();

  // Baralho inteiro, em ordem de criação, exceto os marcados como "dominado".
  const cards = (await query(
    `SELECT
       c.id, c.question, c.answer, c.bizu, c.source, c.tags,
       c.card_type AS "cardType",
       $2::text AS "subjectName", $3::text AS "topicName",
       cs.stability, cs.difficulty, cs.due,
       cs.scheduled_days AS "scheduledDays",
       COALESCE(cs.reps, 0)::int AS reps,
       COALESCE(cs.lapses, 0)::int AS lapses,
       cs.state,
       CASE
         WHEN COALESCE(cs.reps, 0) > 0
              AND COALESCE(cs.scheduled_days, 0) >= $4
              AND cs.due >= $5
           THEN 'rapido' ELSE 'normal'
       END AS "mode"
     FROM cards c
     LEFT JOIN card_states cs ON cs.card_id = c.id
     WHERE c.topic_id = $1
       AND COALESCE(cs.suspended, 0) = 0
     ORDER BY c.id ASC`,
    [topicId, deck.subjectName, deck.topicName, MATURE_DAYS, boundary]
  )) as Record<string, unknown>[];

  return NextResponse.json({ deck: { ...deck, total: cards.length }, cards });
}
