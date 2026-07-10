import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const states = await query(
      `SELECT cs.card_id AS "cardId", c.topic_id AS "topicId",
              cs.stability, cs.difficulty, cs.due, cs.elapsed_days AS "elapsedDays",
              cs.scheduled_days AS "scheduledDays", cs.reps, cs.lapses,
              cs.last_review AS "lastReview", cs.state,
              cs.learning_step AS "learningStep", COALESCE(cs.suspended,0)::int AS suspended
       FROM card_states cs JOIN cards c ON c.id = cs.card_id
       WHERE cs.state <> 'new' OR COALESCE(cs.suspended,0) = 1`
    );
    const log = await query(
      `SELECT rl.card_id AS "cardId", c.topic_id AS "topicId", t.subject_id AS "subjectId",
              rl.rating, rl.review_date AS "reviewDate"
       FROM review_log rl JOIN cards c ON c.id = rl.card_id JOIN topics t ON t.id = c.topic_id
       ORDER BY rl.review_date`
    );
    const voltas = await query(
      `SELECT topic_id AS "topicId", priority, study_count AS "voltas",
              interval_days AS "intervalDays", due, last_studied AS "lastStudied",
              avg_minutes AS "avgMinutes", min_per_card AS "minPerCard", status
       FROM topic_study`
    );
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      states,
      log,
      voltas,
    });
  } catch (err: any) {
    console.error("Sync Down Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
