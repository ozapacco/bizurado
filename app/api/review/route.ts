import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, tx } from "@/lib/db";
import { schedule, createInitialState, Rating } from "@/lib/fsrs";
import { startOfNextDayISO } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const subjectId = searchParams.get("subjectId");
  const topicId = searchParams.get("topicId");
  const tag = searchParams.get("tag");
  const cardType = searchParams.get("cardType");
  const cardId = searchParams.get("cardId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
  const mode = searchParams.get("mode") || "due";

  const params: unknown[] = [];
  const ph = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  let sql = `
    SELECT
      c.id, c.question, c.answer, c.bizu, c.source, c.tags, c.card_type as "cardType",
      s.name as "subjectName", t.name as "topicName",
      cs.stability, cs.difficulty, cs.due, cs.elapsed_days as "elapsedDays",
      cs.scheduled_days as "scheduledDays", cs.reps, cs.lapses,
      cs.last_review as "lastReview", cs.state, cs.learning_step as "learningStep"
    FROM cards c
    JOIN topics t ON t.id = c.topic_id
    JOIN subjects s ON s.id = t.subject_id
    JOIN card_states cs ON cs.card_id = c.id
    WHERE 1=1
  `;

  if (cardId) {
    sql += ` AND c.id = ${ph(parseInt(cardId))}`;
  }
  if (subjectId) {
    const numId = parseInt(subjectId);
    if (!isNaN(numId)) {
      sql += ` AND s.id = ${ph(numId)}`;
    } else {
      sql += ` AND s.name = ${ph(subjectId)}`;
    }
  }
  if (topicId) {
    sql += ` AND t.id = ${ph(parseInt(topicId))}`;
  }
  if (tag) {
    sql += ` AND c.tags LIKE ${ph(`%${tag}%`)}`;
  }
  if (cardType) {
    sql += ` AND c.card_type = ${ph(cardType)}`;
  }

  if (mode === "due") {
    sql += ` AND cs.due < ${ph(startOfNextDayISO())}`;
  } else if (mode === "new") {
    sql += ` AND cs.reps = 0`;
  }

  // Exclude "dominado" (suspended) cards, unless a specific card was requested.
  if (!cardId) {
    sql += ` AND COALESCE(cs.suspended, 0) = 0`;
  }

  sql += ` ORDER BY cs.due ASC LIMIT ${ph(limit)}`;

  const cards = await query(sql, params);
  return NextResponse.json({ cards });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardId, rating } = body;

  if (!cardId || !rating || rating < 1 || rating > 4) {
    return NextResponse.json({ error: "cardId and rating (1-4) required" }, { status: 400 });
  }

  const card = await queryOne("SELECT id FROM cards WHERE id = $1", [cardId]);
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const existing = (await queryOne(
    "SELECT * FROM card_states WHERE card_id = $1",
    [cardId]
  )) as Record<string, unknown> | undefined;

  const state = existing
    ? {
        stability: existing.stability as number,
        difficulty: existing.difficulty as number,
        due: existing.due as string,
        elapsed_days: existing.elapsed_days as number,
        scheduled_days: existing.scheduled_days as number,
        reps: existing.reps as number,
        lapses: existing.lapses as number,
        last_review: existing.last_review as string | null,
        state:
          (existing.state as string) ??
          ((existing.reps as number) > 0 ? "review" : "new"),
        learning_step: (existing.learning_step as number) ?? 0,
      }
    : createInitialState();

  const newState = schedule(state, rating as Rating);

  await tx(async (client) => {
    await client.query(
      `INSERT INTO card_states
        (card_id, stability, difficulty, due, elapsed_days, scheduled_days, reps, lapses, last_review, state, learning_step)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (card_id) DO UPDATE SET
        stability = EXCLUDED.stability,
        difficulty = EXCLUDED.difficulty,
        due = EXCLUDED.due,
        elapsed_days = EXCLUDED.elapsed_days,
        scheduled_days = EXCLUDED.scheduled_days,
        reps = EXCLUDED.reps,
        lapses = EXCLUDED.lapses,
        last_review = EXCLUDED.last_review,
        state = EXCLUDED.state,
        learning_step = EXCLUDED.learning_step`,
      [
        cardId,
        newState.stability,
        newState.difficulty,
        newState.due,
        newState.elapsed_days,
        newState.scheduled_days,
        newState.reps,
        newState.lapses,
        newState.last_review,
        newState.state,
        newState.learning_step,
      ]
    );

    await client.query(
      `INSERT INTO review_log (card_id, rating, review_date, elapsed_days, scheduled_days, stability, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        cardId,
        rating,
        new Date().toISOString(),
        newState.elapsed_days,
        newState.scheduled_days,
        newState.stability,
        newState.difficulty,
      ]
    );
  });

  return NextResponse.json({ success: true, state: newState });
}
