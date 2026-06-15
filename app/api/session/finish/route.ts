import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { todayStr } from "@/lib/day";
import { graduate, updateAvg, updateMinPerCard } from "@/lib/cycle";

interface TopicStudyRow {
  topic_id: number;
  priority: number;
  study_count: number;
  interval_days: number;
  due: string | null;
  last_studied: string | null;
  avg_minutes: number | null;
  min_per_card: number | null;
  status: string;
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: number;
    topicId?: number;
  };

  // Locate the open session by id, or the latest open one for the topic.
  let session:
    | { id: number; topic_id: number; started_at: string }
    | undefined;
  if (body.sessionId !== undefined && body.sessionId !== null) {
    session = db
      .prepare(
        `SELECT id, topic_id, started_at FROM topic_sessions
         WHERE id = ? AND finished_at IS NULL`
      )
      .get(Number(body.sessionId)) as typeof session;
  } else if (body.topicId !== undefined && body.topicId !== null) {
    session = db
      .prepare(
        `SELECT id, topic_id, started_at FROM topic_sessions
         WHERE topic_id = ? AND finished_at IS NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(Number(body.topicId)) as typeof session;
  }

  if (!session) {
    return NextResponse.json(
      { error: "no open session found" },
      { status: 404 }
    );
  }

  const topicId = session.topic_id;
  const day = todayStr();
  const now = new Date();
  const startedMs = new Date(session.started_at).getTime();
  const minutes = Math.max(
    0.1,
    Math.round(((now.getTime() - startedMs) / 60000) * 10) / 10
  );

  const study = db
    .prepare(
      `SELECT topic_id, priority, study_count, interval_days, due,
              last_studied, avg_minutes, min_per_card, status
       FROM topic_study WHERE topic_id = ?`
    )
    .get(topicId) as TopicStudyRow;

  const apply = db.transaction(() => {
    // Record the finished session.
    db.prepare(
      `UPDATE topic_sessions
       SET finished_at = ?, minutes = ?
       WHERE id = ?`
    ).run(now.toISOString(), minutes, session!.id);

    // EMA pace update (whole-session minutes — kept for display).
    const newAvg = updateAvg(study.avg_minutes, minutes);
    db.prepare("UPDATE topic_study SET avg_minutes = ? WHERE topic_id = ?").run(
      newAvg,
      topicId
    );

    // Card-driven pace: minutes per distinct card actually reviewed during this
    // session's window. This is what the planner uses to estimate how long a
    // topic's current due/new load will take, and it tends to drop as the user
    // gets faster.
    const cardsStudied = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT rl.card_id) AS c
           FROM review_log rl
           JOIN cards c ON c.id = rl.card_id
           WHERE c.topic_id = ?
             AND rl.review_date >= ?
             AND rl.review_date <= ?`
        )
        .get(topicId, session!.started_at, now.toISOString()) as { c: number }
    ).c;
    const newMinPerCard = updateMinPerCard(
      study.min_per_card,
      minutes,
      cardsStudied
    );
    if (newMinPerCard !== null && newMinPerCard !== undefined) {
      db.prepare(
        "UPDATE topic_study SET min_per_card = ? WHERE topic_id = ?"
      ).run(newMinPerCard, topicId);
    }

    let resultStudyCount = study.study_count;
    let resultInterval = study.interval_days;
    let resultStatus = study.status;
    let resultDue = study.due;

    // Graduate only once per day (idempotent).
    if (study.last_studied !== day) {
      const g = graduate(
        {
          study_count: study.study_count,
          interval_days: study.interval_days,
          priority: study.priority,
        },
        day
      );
      db.prepare(
        `UPDATE topic_study
         SET study_count = ?, interval_days = ?, status = ?, due = ?, last_studied = ?
         WHERE topic_id = ?`
      ).run(g.study_count, g.interval_days, g.status, g.dueDayStr, day, topicId);
      resultStudyCount = g.study_count;
      resultInterval = g.interval_days;
      resultStatus = g.status;
      resultDue = g.dueDayStr;
    }

    // Mark the plan item done, if present.
    db.prepare(
      "UPDATE daily_plan SET done = 1 WHERE day = ? AND topic_id = ?"
    ).run(day, topicId);

    return { resultStudyCount, resultInterval, resultStatus, resultDue, newAvg };
  });

  const r = apply();

  return NextResponse.json({
    topicId,
    minutes,
    topicStudy: {
      study_count: r.resultStudyCount,
      interval_days: r.resultInterval,
      status: r.resultStatus,
      due: r.resultDue,
      avg_minutes: r.newAvg,
    },
  });
}
