import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

export const dynamic = "force-dynamic";

// Aggregates per topic from cards + card_states. Anki-anchored:
//   novo = reps 0, visto = reps>0, maduro = scheduled_days>=21,
//   jovem = reps>0 & scheduled_days<21, dueNow = due < startOfNextDay.
interface TopicAggRow {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  total: number;
  novos: number;
  vistos: number;
  jovens: number;
  maduros: number;
  dueNow: number;
}

interface AccuracyRow {
  topicId: number;
  totalRevs: number;
  goodRevs: number;
  ultimoEstudo: string | null;
}

interface TopicProgress {
  id: number;
  name: string;
  total: number;
  novos: number;
  vistos: number;
  jovens: number;
  maduros: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  acertoPct: number | null;
  ultimoEstudo: string | null;
  jaEstudouTudo: boolean;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const subjectIdParam = searchParams.get("subjectId");
  const subjectNameParam = searchParams.get("subject");

  let subjectFilterId: number | null = null;
  if (subjectIdParam) {
    const parsed = parseInt(subjectIdParam, 10);
    if (!Number.isNaN(parsed)) subjectFilterId = parsed;
  } else if (subjectNameParam) {
    const row = (await queryOne("SELECT id FROM subjects WHERE name = $1", [
      subjectNameParam,
    ])) as { id: number } | undefined;
    subjectFilterId = row ? row.id : -1;
  }

  const dueBoundary = startOfNextDayISO();

  // --- Card-level aggregates grouped by topic. $1 = dueBoundary; $2 = subject. -
  const aggParams: unknown[] = [dueBoundary];
  let aggFilter = "";
  if (subjectFilterId !== null) {
    aggParams.push(subjectFilterId);
    aggFilter = "WHERE s.id = $2";
  }

  const aggRows = (await query(
    `SELECT
       t.id              AS "topicId",
       t.name            AS "topicName",
       s.id              AS "subjectId",
       s.name            AS "subjectName",
       COUNT(c.id)::int  AS total,
       SUM(CASE WHEN COALESCE(cs.reps, 0) = 0 THEN 1 ELSE 0 END)::int AS novos,
       SUM(CASE WHEN COALESCE(cs.reps, 0) > 0 THEN 1 ELSE 0 END)::int AS vistos,
       SUM(CASE WHEN COALESCE(cs.reps, 0) > 0
                 AND COALESCE(cs.scheduled_days, 0) < 21 THEN 1 ELSE 0 END)::int AS jovens,
       SUM(CASE WHEN COALESCE(cs.scheduled_days, 0) >= 21 THEN 1 ELSE 0 END)::int AS maduros,
       SUM(CASE WHEN cs.due IS NOT NULL AND cs.due < $1
                 AND COALESCE(cs.suspended, 0) = 0
                THEN 1 ELSE 0 END)::int AS "dueNow"
     FROM subjects s
     JOIN topics t ON t.subject_id = s.id
     LEFT JOIN cards c ON c.topic_id = t.id
     LEFT JOIN card_states cs ON cs.card_id = c.id
     ${aggFilter}
     GROUP BY t.id, t.name, s.id, s.name, t."order"
     ORDER BY s.name, t."order", t.name`,
    aggParams
  )) as TopicAggRow[];

  // --- Accuracy + last-study date from review_log, per topic. $1 = subject. ---
  const accParams: unknown[] = [];
  let accFilter = "";
  if (subjectFilterId !== null) {
    accParams.push(subjectFilterId);
    accFilter = "WHERE s.id = $1";
  }

  const accRows = (await query(
    `SELECT
       t.id AS "topicId",
       COUNT(*)::int AS "totalRevs",
       SUM(CASE WHEN rl.rating >= 3 THEN 1 ELSE 0 END)::int AS "goodRevs",
       MAX(rl.review_date) AS "ultimoEstudo"
     FROM review_log rl
     JOIN cards c ON c.id = rl.card_id
     JOIN topics t ON t.id = c.topic_id
     JOIN subjects s ON s.id = t.subject_id
     ${accFilter}
     GROUP BY t.id`,
    accParams
  )) as AccuracyRow[];

  const accByTopic = new Map<number, AccuracyRow>();
  for (const a of accRows) accByTopic.set(a.topicId, a);

  interface SubjectAcc {
    id: number;
    name: string;
    topics: TopicProgress[];
    total: number;
    novos: number;
    vistos: number;
    jovens: number;
    maduros: number;
    dueNow: number;
    goodRevs: number;
    totalRevs: number;
    ultimoEstudo: string | null;
  }
  const subjectMap = new Map<number, SubjectAcc>();

  for (const r of aggRows) {
    let subj = subjectMap.get(r.subjectId);
    if (!subj) {
      subj = {
        id: r.subjectId,
        name: r.subjectName,
        topics: [],
        total: 0,
        novos: 0,
        vistos: 0,
        jovens: 0,
        maduros: 0,
        dueNow: 0,
        goodRevs: 0,
        totalRevs: 0,
        ultimoEstudo: null,
      };
      subjectMap.set(r.subjectId, subj);
    }

    const acc = accByTopic.get(r.topicId);
    const topicAcertoPct =
      acc && acc.totalRevs > 0 ? pct(acc.goodRevs, acc.totalRevs) : null;
    const topicUltimoEstudo = acc ? acc.ultimoEstudo : null;

    subj.topics.push({
      id: r.topicId,
      name: r.topicName,
      total: r.total,
      novos: r.novos,
      vistos: r.vistos,
      jovens: r.jovens,
      maduros: r.maduros,
      dueNow: r.dueNow,
      coberturaPct: pct(r.vistos, r.total),
      dominioPct: pct(r.maduros, r.total),
      acertoPct: topicAcertoPct,
      ultimoEstudo: topicUltimoEstudo,
      jaEstudouTudo: r.total > 0 && r.novos === 0,
    });

    subj.total += r.total;
    subj.novos += r.novos;
    subj.vistos += r.vistos;
    subj.jovens += r.jovens;
    subj.maduros += r.maduros;
    subj.dueNow += r.dueNow;
    if (acc) {
      subj.goodRevs += acc.goodRevs;
      subj.totalRevs += acc.totalRevs;
      if (
        acc.ultimoEstudo &&
        (!subj.ultimoEstudo || acc.ultimoEstudo > subj.ultimoEstudo)
      ) {
        subj.ultimoEstudo = acc.ultimoEstudo;
      }
    }
  }

  const subjects = Array.from(subjectMap.values()).map((s) => ({
    id: s.id,
    name: s.name,
    total: s.total,
    novos: s.novos,
    vistos: s.vistos,
    jovens: s.jovens,
    maduros: s.maduros,
    dueNow: s.dueNow,
    coberturaPct: pct(s.vistos, s.total),
    dominioPct: pct(s.maduros, s.total),
    acertoPct: s.totalRevs > 0 ? pct(s.goodRevs, s.totalRevs) : null,
    ultimoEstudo: s.ultimoEstudo,
    jaEstudouTudo: s.total > 0 && s.novos === 0,
    topics: s.topics,
  }));

  return NextResponse.json({ subjects });
}
