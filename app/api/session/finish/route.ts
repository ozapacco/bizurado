import { NextRequest, NextResponse } from "next/server";
import { queryOne, tx } from "@/lib/db";
import { todayStr } from "@/lib/day";
import { graduate, updateAvg, updateMinPerCard } from "@/lib/cycle";

export const dynamic = "force-dynamic";

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
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: number;
    topicId?: number;
  };

  // Locate the open session by id, or the latest open one for the topic.
  let session: { id: number; topic_id: number; started_at: string } | undefined;
  if (body.sessionId !== undefined && body.sessionId !== null) {
    session = (await queryOne(
      `SELECT id, topic_id, started_at FROM topic_sessions
       WHERE id = $1 AND finished_at IS NULL`,
      [Number(body.sessionId)]
    )) as typeof session;
  } else if (body.topicId !== undefined && body.topicId !== null) {
    session = (await queryOne(
      `SELECT id, topic_id, started_at FROM topic_sessions
       WHERE topic_id = $1 AND finished_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [Number(body.topicId)]
    )) as typeof session;
  }

  if (!session) {
    return NextResponse.json({ error: "no open session found" }, { status: 404 });
  }

  const topicId = session.topic_id;
  const day = todayStr();
  const now = new Date();
  const startedMs = new Date(session.started_at).getTime();
  const minutes = Math.max(
    0.1,
    Math.round(((now.getTime() - startedMs) / 60000) * 10) / 10
  );

  const study = (await queryOne(
    `SELECT topic_id, priority, study_count, interval_days, due,
            last_studied, avg_minutes, min_per_card, status
     FROM topic_study WHERE topic_id = $1`,
    [topicId]
  )) as TopicStudyRow;

  const r = await tx(async (client) => {
    // Record the finished session.
    await client.query(
      `UPDATE topic_sessions SET finished_at = $1, minutes = $2 WHERE id = $3`,
      [now.toISOString(), minutes, session!.id]
    );

    // EMA pace update (whole-session minutes — kept for display).
    const newAvg = updateAvg(study.avg_minutes, minutes);
    await client.query(
      "UPDATE topic_study SET avg_minutes = $1 WHERE topic_id = $2",
      [newAvg, topicId]
    );

    // Card-driven pace: minutes per distinct card reviewed during this session.
    const cardsRow = (
      await client.query(
        `SELECT COUNT(DISTINCT rl.card_id)::int AS c
         FROM review_log rl
         JOIN cards c ON c.id = rl.card_id
         WHERE c.topic_id = $1
           AND rl.review_date >= $2
           AND rl.review_date <= $3`,
        [topicId, session!.started_at, now.toISOString()]
      )
    ).rows[0] as { c: number };
    const cardsStudied = cardsRow.c;

    const newMinPerCard = updateMinPerCard(
      study.min_per_card,
      minutes,
      cardsStudied
    );
    if (newMinPerCard !== null && newMinPerCard !== undefined) {
      await client.query(
        "UPDATE topic_study SET min_per_card = $1 WHERE topic_id = $2",
        [newMinPerCard, topicId]
      );
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
      await client.query(
        `UPDATE topic_study
         SET study_count = $1, interval_days = $2, status = $3, due = $4, last_studied = $5
         WHERE topic_id = $6`,
        [g.study_count, g.interval_days, g.status, g.dueDayStr, day, topicId]
      );
      resultStudyCount = g.study_count;
      resultInterval = g.interval_days;
      resultStatus = g.status;
      resultDue = g.dueDayStr;
    }

    // Mark the plan item done, if present.
    await client.query(
      "UPDATE daily_plan SET done = 1 WHERE day = $1 AND topic_id = $2",
      [day, topicId]
    );

    return { resultStudyCount, resultInterval, resultStatus, resultDue, newAvg };
  });

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
