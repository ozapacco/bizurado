import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

// Motor de rotação da Trilha (Fluxo B · avanço). Aponta o PRÓXIMO tópico depois
// de fechar um: round-robin JUSTO entre disciplinas — a disciplina em Camada 1
// (tem cards novos) estudada há MAIS tempo (MAX review_date) entra primeiro; e
// dentro dela o tópico pendente de maior prioridade de banca (depois ordem do
// arquivo). excludeTopicId tira o que acabou de ser estudado da disputa.
export const dynamic = "force-dynamic";

type Row = {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  priority: number;
  topicOrder: number;
  lastStudied: string | null;
  novos: number;
  dueNow: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exclude = Number(searchParams.get("excludeTopicId"));
  const excludeId = Number.isInteger(exclude) ? exclude : -1;
  const boundary = startOfNextDayISO();

  const rows = (await query(
    `WITH last AS (
       SELECT t.subject_id AS subject_id, MAX(rl.review_date) AS last_studied
       FROM topics t
       JOIN cards c       ON c.topic_id = t.id
       JOIN review_log rl ON rl.card_id = c.id
       GROUP BY t.subject_id
     )
     SELECT * FROM (
       SELECT
         t.id          AS "topicId",
         t.name        AS "topicName",
         s.id          AS "subjectId",
         s.name        AS "subjectName",
         COALESCE(ts.priority, 3)::int AS priority,
         t."order"     AS "topicOrder",
         l.last_studied AS "lastStudied",
         SUM(CASE WHEN COALESCE(cs.reps,0)=0 AND COALESCE(cs.suspended,0)=0
                  THEN 1 ELSE 0 END)::int AS novos,
         SUM(CASE WHEN COALESCE(cs.reps,0)>0 AND cs.due < $2
                   AND COALESCE(cs.suspended,0)=0
                  THEN 1 ELSE 0 END)::int AS "dueNow"
       FROM topics t
       JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN cards c        ON c.topic_id = t.id
       LEFT JOIN card_states cs ON cs.card_id = c.id
       LEFT JOIN topic_study ts ON ts.topic_id = t.id
       LEFT JOIN last l         ON l.subject_id = s.id
       WHERE t.id <> $1
       GROUP BY t.id, t.name, s.id, s.name, ts.priority, t."order", l.last_studied
     ) q
     WHERE q.novos > 0`,
    [excludeId, boundary]
  )) as Row[];

  if (rows.length === 0) {
    return NextResponse.json({ next: null });
  }

  // A disciplina do tópico recém-fechado deve ir pro FIM da fila (acabamos de
  // estudá-la) — assim a rotação gira pra próxima disciplina em vez de pegar
  // outro tópico da mesma. Se ela for a ÚNICA em Camada 1, ainda vence (sem
  // outro candidato) e seguimos nela. Não dependemos do timing do review_log.
  const SENTINEL_RECENTE = "9999-12-31T23:59:59Z";
  let excludedSubjectId: number | null = null;
  if (excludeId > 0) {
    const row = (await queryOne("SELECT subject_id AS s FROM topics WHERE id = $1", [
      excludeId,
    ])) as { s: number } | undefined;
    excludedSubjectId = row?.s ?? null;
  }

  // Disciplina da vez = menos estudada recentemente (nunca estudada primeiro).
  const subjLast = new Map<number, string>();
  for (const r of rows) {
    const v = r.lastStudied ?? "";
    const cur = subjLast.get(r.subjectId);
    if (cur === undefined || v > cur) subjLast.set(r.subjectId, v);
  }
  if (excludedSubjectId !== null && subjLast.has(excludedSubjectId)) {
    subjLast.set(excludedSubjectId, SENTINEL_RECENTE);
  }
  const subjectIds = [...subjLast.keys()].sort((a, b) => {
    const la = subjLast.get(a)!;
    const lb = subjLast.get(b)!;
    if (la !== lb) return la < lb ? -1 : 1;
    return a - b;
  });

  const winnerSubject = subjectIds[0];
  const topic = rows
    .filter((r) => r.subjectId === winnerSubject)
    .sort((a, b) => b.priority - a.priority || a.topicOrder - b.topicOrder || a.topicId - b.topicId)[0];

  return NextResponse.json({
    next: {
      topicId: topic.topicId,
      topicName: topic.topicName,
      subjectName: topic.subjectName,
      priority: topic.priority,
      dueNow: topic.dueNow,
      novos: topic.novos,
    },
  });
}
