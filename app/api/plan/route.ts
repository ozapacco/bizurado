import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { todayStr, startOfNextDayISO } from "@/lib/day";
import { estimateFromNeed } from "@/lib/cycle";

const DEFAULT_BUDGET = 120;
const MAX_DISTINCT_SUBJECTS = 3;

interface PlanRow {
  topic_id: number;
  kind: "novo" | "revisao";
  est_minutes: number;
  position: number;
  done: number;
  subject_id: number;
  subject_name: string;
  topic_name: string;
  priority: number;
  study_count: number;
}

interface Candidate {
  topicId: number;
  subjectId: number;
  subjectName: string;
  topicName: string;
  kind: "novo" | "revisao";
  estMinutes: number;
  priority: number;
  studyCount: number;
  reviewNeeded: number;
  newNeeded: number;
  order: number;
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);

  const day = searchParams.get("date") || todayStr();
  const regenerate = searchParams.get("regenerate") === "1";
  const minutesParam = searchParams.get("minutes");

  // --- If a plan already exists and we're not regenerating, return it. -------
  const existing = db
    .prepare(
      `SELECT dp.topic_id, dp.kind, dp.est_minutes, dp.position, dp.done,
              t.subject_id, s.name AS subject_name, t.name AS topic_name,
              ts.priority, ts.study_count
       FROM daily_plan dp
       JOIN topics t ON t.id = dp.topic_id
       JOIN subjects s ON s.id = t.subject_id
       JOIN topic_study ts ON ts.topic_id = dp.topic_id
       WHERE dp.day = ?
       ORDER BY dp.position ASC`
    )
    .all(day) as PlanRow[];

  if (existing.length > 0 && !regenerate) {
    const budgetRow = db
      .prepare("SELECT minutes FROM daily_budget WHERE day = ?")
      .get(day) as { minutes: number } | undefined;
    return NextResponse.json(buildResponse(day, budgetRow?.minutes ?? DEFAULT_BUDGET, existing));
  }

  // --- Determine the budget. -------------------------------------------------
  let budget: number;
  if (minutesParam !== null && minutesParam !== "" && !Number.isNaN(Number(minutesParam))) {
    budget = Number(minutesParam);
  } else {
    const budgetRow = db
      .prepare("SELECT minutes FROM daily_budget WHERE day = ?")
      .get(day) as { minutes: number } | undefined;
    budget = budgetRow?.minutes ?? DEFAULT_BUDGET;
  }

  // --- Gather candidates (CARD-DRIVEN). --------------------------------------
  // The topic is the unit, but whether it enters the day — and how long it
  // takes — is driven by its CARDS, not a mechanical topic clock. For each topic
  // we count, in one pass:
  //   reviewNeeded = seen cards (reps>0) that are due now and not "dominado"
  //   newNeeded    = never-seen cards (reps=0) not "dominado"
  // A topic is a candidate iff it has any such cards. As a topic matures and its
  // cards space out (familiar cards get long intervals and drop out), its load
  // shrinks on its own — so each revisit shows fewer, different cards.
  const boundary = startOfNextDayISO();
  const loadRows = db
    .prepare(
      `SELECT
         ts.topic_id        AS topicId,
         ts.priority        AS priority,
         ts.study_count     AS studyCount,
         ts.min_per_card    AS minPerCard,
         t.subject_id       AS subjectId,
         t.name             AS topicName,
         t."order"          AS topicOrder,
         s.name             AS subjectName,
         SUM(CASE WHEN cs.card_id IS NOT NULL
                   AND COALESCE(cs.suspended, 0) = 0
                   AND COALESCE(cs.reps, 0) > 0
                   AND cs.due < @boundary
                  THEN 1 ELSE 0 END) AS reviewNeeded,
         SUM(CASE WHEN c.id IS NOT NULL
                   AND COALESCE(cs.suspended, 0) = 0
                   AND COALESCE(cs.reps, 0) = 0
                  THEN 1 ELSE 0 END) AS newNeeded
       FROM topic_study ts
       JOIN topics t   ON t.id = ts.topic_id
       JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN cards c        ON c.topic_id = t.id
       LEFT JOIN card_states cs ON cs.card_id = c.id
       GROUP BY ts.topic_id
       HAVING reviewNeeded + newNeeded > 0`
    )
    .all({ boundary }) as {
    topicId: number;
    priority: number;
    studyCount: number;
    minPerCard: number | null;
    subjectId: number;
    topicName: string;
    topicOrder: number;
    subjectName: string;
    reviewNeeded: number;
    newNeeded: number;
  }[];

  const candidates: Candidate[] = loadRows.map((r) => ({
    topicId: r.topicId,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
    topicName: r.topicName,
    // A topic with any due review cards is a "revisao"; otherwise it is brand-new.
    kind: r.reviewNeeded > 0 ? "revisao" : "novo",
    estMinutes: estimateFromNeed(r.reviewNeeded + r.newNeeded, r.minPerCard),
    priority: r.priority,
    studyCount: r.studyCount,
    reviewNeeded: r.reviewNeeded,
    newNeeded: r.newNeeded,
    order: r.topicOrder,
  }));

  // --- Order each pool. ------------------------------------------------------
  // Reviews first (avoid pile-up): heavier due load first, then priority.
  const reviewCandidates = candidates
    .filter((c) => c.reviewNeeded > 0)
    .sort((a, b) => b.reviewNeeded - a.reviewNeeded || b.priority - a.priority);
  // New after: priority desc, then topic order asc, then name asc.
  const newCandidates = candidates
    .filter((c) => c.reviewNeeded === 0)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.order - b.order ||
        a.topicName.localeCompare(b.topicName)
    );

  // Reviews always rank ahead of new topics globally.
  const ordered: Candidate[] = [...reviewCandidates, ...newCandidates];

  // --- Round-robin selection with subject diversity. -------------------------
  // Group candidates by subject preserving the global ordering within each
  // group. Then repeatedly take the best remaining candidate from a subject,
  // rotating across subjects so the day mixes disciplines. Allow several topics
  // per subject, but cap the number of DISTINCT subjects at MAX_DISTINCT_SUBJECTS.
  const bySubject = new Map<number, Candidate[]>();
  const subjectOrder: number[] = [];
  for (const c of ordered) {
    if (!bySubject.has(c.subjectId)) {
      bySubject.set(c.subjectId, []);
      subjectOrder.push(c.subjectId);
    }
    bySubject.get(c.subjectId)!.push(c);
  }

  const selected: Candidate[] = [];
  const usedSubjects = new Set<number>();
  let total = 0;
  let rr = 0;

  const canAddSubject = (subjectId: number): boolean =>
    usedSubjects.has(subjectId) || usedSubjects.size < MAX_DISTINCT_SUBJECTS;

  // Round-robin until no eligible candidate can be taken.
  while (true) {
    let progressed = false;
    const n = subjectOrder.length;
    for (let step = 0; step < n; step++) {
      const subjectId = subjectOrder[(rr + step) % n];
      const queue = bySubject.get(subjectId)!;
      if (queue.length === 0) continue;
      if (!canAddSubject(subjectId)) continue;

      const next = queue[0];
      // Budget gate: only add if it still fits. The very first pick is always
      // taken (guarantee >=1 item) even if it alone exceeds the budget.
      if (selected.length > 0 && total + next.estMinutes > budget) {
        // This subject's head doesn't fit; skip it this rotation. (Its other
        // items are no smaller in spirit; we stop considering it.)
        queue.shift();
        continue;
      }

      queue.shift();
      selected.push(next);
      usedSubjects.add(subjectId);
      total += next.estMinutes;
      rr = (rr + step + 1) % n; // advance so the next pick favors another subject
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  // Guarantee at least one item if any candidate existed.
  if (selected.length === 0 && ordered.length > 0) {
    const first = ordered[0];
    selected.push(first);
    total += first.estMinutes;
  }

  // --- Persist in a transaction. ---------------------------------------------
  const persist = db.transaction((items: Candidate[], budgetMinutes: number) => {
    db.prepare("DELETE FROM daily_plan WHERE day = ?").run(day);
    const insert = db.prepare(
      `INSERT INTO daily_plan (day, topic_id, kind, est_minutes, position, done)
       VALUES (?, ?, ?, ?, ?, 0)`
    );
    items.forEach((c, i) => {
      insert.run(day, c.topicId, c.kind, c.estMinutes, i + 1);
    });
    db.prepare(
      `INSERT INTO daily_budget (day, minutes) VALUES (?, ?)
       ON CONFLICT(day) DO UPDATE SET minutes = excluded.minutes`
    ).run(day, budgetMinutes);
  });
  persist(selected, budget);

  const rows: PlanRow[] = selected.map((c, i) => ({
    topic_id: c.topicId,
    kind: c.kind,
    est_minutes: c.estMinutes,
    position: i + 1,
    done: 0,
    subject_id: c.subjectId,
    subject_name: c.subjectName,
    topic_name: c.topicName,
    priority: c.priority,
    study_count: c.studyCount,
  }));

  return NextResponse.json(buildResponse(day, budget, rows));
}

function buildResponse(day: string, budgetMinutes: number, rows: PlanRow[]) {
  const items = rows.map((r) => ({
    position: r.position,
    topicId: r.topic_id,
    subjectName: r.subject_name,
    topicName: r.topic_name,
    kind: r.kind,
    estMinutes: r.est_minutes,
    priority: r.priority,
    studyCount: r.study_count,
    done: r.done === 1,
  }));
  const totalEstMinutes =
    Math.round(items.reduce((sum, i) => sum + i.estMinutes, 0) * 10) / 10;
  const disciplinas = new Set(items.map((i) => i.subjectName)).size;
  return {
    day,
    budgetMinutes,
    totalEstMinutes,
    disciplinas,
    items,
  };
}
