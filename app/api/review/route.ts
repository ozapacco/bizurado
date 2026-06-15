import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { schedule, createInitialState, Rating } from "@/lib/fsrs";
import { startOfNextDayISO } from "@/lib/day";

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);

  const subjectId = searchParams.get("subjectId");
  const topicId = searchParams.get("topicId");
  const tag = searchParams.get("tag");
  const cardType = searchParams.get("cardType");
  const cardId = searchParams.get("cardId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
  const mode = searchParams.get("mode") || "due";

  let query = `
    SELECT
      c.id, c.question, c.answer, c.bizu, c.source, c.tags, c.card_type as cardType,
      s.name as subjectName, t.name as topicName,
      cs.stability, cs.difficulty, cs.due, cs.elapsed_days as elapsedDays,
      cs.scheduled_days as scheduledDays, cs.reps, cs.lapses,
      cs.last_review as lastReview, cs.state, cs.learning_step as learningStep
    FROM cards c
    JOIN topics t ON t.id = c.topic_id
    JOIN subjects s ON s.id = t.subject_id
    JOIN card_states cs ON cs.card_id = c.id
    WHERE 1=1
  `;

  const params: unknown[] = [];

  if (cardId) {
    query += " AND c.id = ?";
    params.push(parseInt(cardId));
  }
  if (subjectId) {
    const numId = parseInt(subjectId);
    if (!isNaN(numId)) {
      query += " AND s.id = ?";
      params.push(numId);
    } else {
      query += " AND s.name = ?";
      params.push(subjectId);
    }
  }
  if (topicId) {
    query += " AND t.id = ?";
    params.push(parseInt(topicId));
  }
  if (tag) {
    query += " AND c.tags LIKE ?";
    params.push(`%${tag}%`);
  }
  if (cardType) {
    query += " AND c.card_type = ?";
    params.push(cardType);
  }

  if (mode === "due") {
    query += " AND cs.due < ?";
    params.push(startOfNextDayISO());
  } else if (mode === "new") {
    query += " AND cs.reps = 0";
  } else if (mode === "all") {
  }

  // Exclude "dominado" (suspended) cards from the rotation, unless a specific
  // card was requested directly (e.g. opened from search).
  if (!cardId) {
    query += " AND COALESCE(cs.suspended, 0) = 0";
  }

  query += " ORDER BY cs.due ASC LIMIT ?";
  params.push(limit);

  const cards = db.prepare(query).all(...params) as any[];

  return NextResponse.json({ cards });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const { cardId, rating } = body;

  if (!cardId || !rating || rating < 1 || rating > 4) {
    return NextResponse.json({ error: "cardId and rating (1-4) required" }, { status: 400 });
  }

  const card = db.prepare("SELECT id FROM cards WHERE id = ?").get(cardId);
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const existing = db.prepare("SELECT * FROM card_states WHERE card_id = ?").get(cardId) as any;

  const state = existing
    ? {
        stability: existing.stability,
        difficulty: existing.difficulty,
        due: existing.due,
        elapsed_days: existing.elapsed_days,
        scheduled_days: existing.scheduled_days,
        reps: existing.reps,
        lapses: existing.lapses,
        last_review: existing.last_review,
        state: existing.state ?? (existing.reps > 0 ? "review" : "new"),
        learning_step: existing.learning_step ?? 0,
      }
    : createInitialState();

  const newState = schedule(state, rating as Rating);

  const upsertState = db.prepare(
    `INSERT INTO card_states
      (card_id, stability, difficulty, due, elapsed_days, scheduled_days, reps, lapses, last_review, state, learning_step)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET
      stability = excluded.stability,
      difficulty = excluded.difficulty,
      due = excluded.due,
      elapsed_days = excluded.elapsed_days,
      scheduled_days = excluded.scheduled_days,
      reps = excluded.reps,
      lapses = excluded.lapses,
      last_review = excluded.last_review,
      state = excluded.state,
      learning_step = excluded.learning_step`
  );

  const insertLog = db.prepare(
    `INSERT INTO review_log (card_id, rating, review_date, elapsed_days, scheduled_days, stability, difficulty)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const persist = db.transaction(() => {
    upsertState.run(
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
      newState.learning_step
    );

    insertLog.run(
      cardId,
      rating,
      new Date().toISOString(),
      newState.elapsed_days,
      newState.scheduled_days,
      newState.stability,
      newState.difficulty
    );
  });

  persist();

  return NextResponse.json({ success: true, state: newState });
}
