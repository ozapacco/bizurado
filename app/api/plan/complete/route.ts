import { NextRequest, NextResponse } from "next/server";
import { queryOne, tx } from "@/lib/db";
import { todayStr } from "@/lib/day";
import { graduate } from "@/lib/cycle";

export const dynamic = "force-dynamic";

interface TopicStudyRow {
  topic_id: number;
  priority: number;
  study_count: number;
  interval_days: number;
  due: string | null;
  last_studied: string | null;
  avg_minutes: number | null;
  status: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { topicId?: number };
  const topicId = Number(body.topicId);

  const study = (await queryOne(
    `SELECT topic_id, priority, study_count, interval_days, due,
            last_studied, avg_minutes, status
     FROM topic_study WHERE topic_id = $1`,
    [topicId]
  )) as TopicStudyRow | undefined;

  if (!study) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  const day = todayStr();

  const r = await tx(async (client) => {
    let resultStudyCount = study.study_count;
    let resultInterval = study.interval_days;
    let resultStatus = study.status;
    let resultDue = study.due;

    // Graduate only once per day (idempotent). No timing, no avg_minutes change.
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

    await client.query(
      "UPDATE daily_plan SET done = 1 WHERE day = $1 AND topic_id = $2",
      [day, topicId]
    );

    return { resultStudyCount, resultInterval, resultStatus, resultDue };
  });

  return NextResponse.json({
    topicId,
    topicStudy: {
      study_count: r.resultStudyCount,
      interval_days: r.resultInterval,
      status: r.resultStatus,
      due: r.resultDue,
      avg_minutes: study.avg_minutes,
    },
  });
}
