import { NextRequest, NextResponse } from "next/server";
import { tx } from "@/lib/db";
import { CardState } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

type SyncPayload = {
  reviews: { cardId: number; rating: number; reviewDate: string; state?: any }[];
  suspensions: { cardId: number }[];
  voltas: { topicId: number; priority: number; voltas: number; intervalDays: number; status: string; due: string | null; lastStudied: string | null }[];
  priorities: { topicId: number; priority: number }[];
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as SyncPayload;
    const { reviews, suspensions, voltas, priorities } = payload;

    await tx(async (client) => {
      // 1. Process Reviews
      if (reviews && reviews.length > 0) {
        for (const rev of reviews) {
          await client.query(
            `INSERT INTO review_log (card_id, rating, review_date) VALUES ($1, $2, $3)`,
            [rev.cardId, rev.rating, rev.reviewDate]
          );

          if (rev.state) {
            await client.query(
              `INSERT INTO card_states (
                 card_id, stability, difficulty, due, elapsed_days, scheduled_days, reps, lapses, state, last_review
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (card_id) DO UPDATE SET
                 stability = EXCLUDED.stability,
                 difficulty = EXCLUDED.difficulty,
                 due = EXCLUDED.due,
                 elapsed_days = EXCLUDED.elapsed_days,
                 scheduled_days = EXCLUDED.scheduled_days,
                 reps = EXCLUDED.reps,
                 lapses = EXCLUDED.lapses,
                 state = EXCLUDED.state,
                 last_review = EXCLUDED.last_review`,
              [
                rev.cardId,
                rev.state.stability,
                rev.state.difficulty,
                rev.state.due ?? null,
                rev.state.elapsed_days,
                rev.state.scheduled_days,
                rev.state.reps,
                rev.state.lapses,
                rev.state.state,
                rev.state.last_review ?? null,
              ]
            );
          }
        }
      }

      // 2. Process Suspensions
      if (suspensions && suspensions.length > 0) {
        for (const sus of suspensions) {
          // ensure card_states row exists before suspending
          await client.query(
            `INSERT INTO card_states (card_id, state) VALUES ($1, 'new') ON CONFLICT DO NOTHING`,
            [sus.cardId]
          );
          await client.query(`UPDATE card_states SET suspended = 1 WHERE card_id = $1`, [sus.cardId]);
        }
      }

      // 3. Process Topic Priorities
      if (priorities && priorities.length > 0) {
        for (const p of priorities) {
          await client.query(
            `INSERT INTO topic_study (topic_id, priority) VALUES ($1, $2)
             ON CONFLICT (topic_id) DO UPDATE SET priority = EXCLUDED.priority`,
            [p.topicId, p.priority]
          );
        }
      }

      // 4. Process Voltas (cycle finish)
      if (voltas && voltas.length > 0) {
        for (const v of voltas) {
          await client.query(
            `INSERT INTO topic_study (topic_id, priority, study_count, interval_days, status, due, last_studied)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (topic_id) DO UPDATE SET
               study_count = EXCLUDED.study_count,
               interval_days = EXCLUDED.interval_days,
               status = EXCLUDED.status,
               due = EXCLUDED.due,
               last_studied = EXCLUDED.last_studied`,
            [
              v.topicId,
              v.priority,
              v.voltas,
              v.intervalDays,
              v.status,
              v.due,
              v.lastStudied,
            ]
          );
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Sync Up Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
