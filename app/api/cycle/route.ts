import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

// Estado da "Trilha do Aprovado" (o Mapa do Ciclo). Calculado AO VIVO de
// cards + card_states + topic_study — sem tabela nova. Define, por disciplina:
//   - camada (1 Varredura / 2 Consolidação / 3 Compilados)
//   - progresso (cobertura% na C1, domínio% na C2/C3)
//   - prioridade média (peso de banca, topic_study.priority 1-5)
//   - última vez estudada (review_log) → usado pela rotação justa
// e o ponteiro de avanço (Fluxo B): a disciplina C1 estudada há mais tempo,
// no seu tópico pendente de maior prioridade. dueTotal = Fluxo A (revisão).
export const dynamic = "force-dynamic";

// Limiar Camada 2→3 (DECIDIDO: 80% de domínio). "Domínio" = maduro
// (scheduled_days>=21) OU dominado (suspended) — marcar dominado conta.
const DOMINIO_C3 = 80;
const MATURE_DAYS = 21;

type TopicRow = {
  subjectId: number;
  subjectName: string;
  topicId: number;
  topicName: string;
  topicOrder: number;
  priority: number;
  total: number;
  novos: number;
  dominio: number;
  dueNow: number;
};

type TopicOut = {
  id: number;
  name: string;
  priority: number;
  total: number;
  novos: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  estado: "novo" | "andamento" | "dominado";
};

type SubjectOut = {
  id: number;
  name: string;
  camada: 1 | 2 | 3;
  total: number;
  novos: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  progressPct: number;
  prioridadeMedia: number;
  lastStudied: string | null;
  topics: TopicOut[];
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export async function GET() {
  const boundary = startOfNextDayISO();

  // Agregado por TÓPICO (com info da disciplina e a prioridade do ciclo).
  const rows = (await query(
    `SELECT
       s.id            AS "subjectId",
       s.name          AS "subjectName",
       t.id            AS "topicId",
       t.name          AS "topicName",
       t."order"       AS "topicOrder",
       COALESCE(ts.priority, 3)::int AS priority,
       COUNT(c.id)::int AS total,
       SUM(CASE WHEN COALESCE(cs.reps,0)=0 AND COALESCE(cs.suspended,0)=0
                THEN 1 ELSE 0 END)::int AS novos,
       SUM(CASE WHEN COALESCE(cs.scheduled_days,0)>=$2 OR COALESCE(cs.suspended,0)=1
                THEN 1 ELSE 0 END)::int AS dominio,
       SUM(CASE WHEN COALESCE(cs.reps,0)>0 AND cs.due < $1
                 AND COALESCE(cs.suspended,0)=0
                THEN 1 ELSE 0 END)::int AS "dueNow"
     FROM subjects s
     JOIN topics t        ON t.subject_id = s.id
     LEFT JOIN cards c        ON c.topic_id = t.id
     LEFT JOIN card_states cs ON cs.card_id = c.id
     LEFT JOIN topic_study ts ON ts.topic_id = t.id
     GROUP BY s.id, s.name, t.id, t.name, t."order", ts.priority
     ORDER BY s.name, t."order", t.name`,
    [boundary, MATURE_DAYS]
  )) as TopicRow[];

  // Última atividade por disciplina (rotação justa = a menos estudada primeiro).
  const lastRows = (await query(
    `SELECT s.id AS "subjectId", MAX(rl.review_date) AS "lastStudied"
     FROM subjects s
     JOIN topics t      ON t.subject_id = s.id
     JOIN cards c       ON c.topic_id = t.id
     JOIN review_log rl ON rl.card_id = c.id
     GROUP BY s.id`,
    []
  )) as { subjectId: number; lastStudied: string | null }[];
  const lastBySubject = new Map<number, string | null>();
  for (const r of lastRows) lastBySubject.set(r.subjectId, r.lastStudied);

  // Monta disciplinas + tópicos.
  const subjectMap = new Map<number, SubjectOut>();
  for (const r of rows) {
    let subj = subjectMap.get(r.subjectId);
    if (!subj) {
      subj = {
        id: r.subjectId,
        name: r.subjectName,
        camada: 1,
        total: 0,
        novos: 0,
        dueNow: 0,
        coberturaPct: 0,
        dominioPct: 0,
        progressPct: 0,
        prioridadeMedia: 0,
        lastStudied: lastBySubject.get(r.subjectId) ?? null,
        topics: [],
      };
      subjectMap.set(r.subjectId, subj);
    }

    const coberturaPct = pct(r.total - r.novos, r.total);
    const dominioPct = pct(r.dominio, r.total);
    const estado: TopicOut["estado"] =
      r.novos > 0 ? (coberturaPct > 0 ? "andamento" : "novo") : "dominado";

    subj.topics.push({
      id: r.topicId,
      name: r.topicName,
      priority: r.priority,
      total: r.total,
      novos: r.novos,
      dueNow: r.dueNow,
      coberturaPct,
      dominioPct,
      estado: r.novos > 0 && coberturaPct === 0 ? "novo" : estado,
    });

    subj.total += r.total;
    subj.novos += r.novos;
    subj.dueNow += r.dueNow;
  }

  // Fecha os agregados por disciplina (camada, %s, prioridade média).
  const subjects: SubjectOut[] = [];
  for (const subj of subjectMap.values()) {
    let dominioCards = 0;
    let prioSum = 0;
    for (const r of rows) {
      if (r.subjectId !== subj.id) continue;
      dominioCards += r.dominio;
      prioSum += r.priority;
    }
    subj.coberturaPct = pct(subj.total - subj.novos, subj.total);
    subj.dominioPct = pct(dominioCards, subj.total);
    subj.prioridadeMedia =
      subj.topics.length > 0
        ? Math.round((prioSum / subj.topics.length) * 10) / 10
        : 3;

    // Camada por disciplina: C1 enquanto houver card novo; senão C2 até bater
    // o domínio; aí C3.
    if (subj.novos > 0) subj.camada = 1;
    else if (subj.dominioPct < DOMINIO_C3) subj.camada = 2;
    else subj.camada = 3;

    subj.progressPct = subj.camada === 1 ? subj.coberturaPct : subj.dominioPct;
    subjects.push(subj);
  }

  // --- Ponteiro de AVANÇO (Fluxo B) ------------------------------------------
  // Candidatas = disciplinas em C1 (têm material novo). Rotação justa: a menos
  // estudada recentemente primeiro (nunca estudada = mais antiga). Dentro dela,
  // o tópico pendente de maior prioridade (depois ordem do arquivo).
  const rotation = subjects
    .filter((s) => s.novos > 0)
    .sort((a, b) => {
      const la = a.lastStudied ?? "";
      const lb = b.lastStudied ?? "";
      if (la !== lb) return la < lb ? -1 : 1; // mais antigo primeiro
      return a.name.localeCompare(b.name);
    });

  const pickTopic = (s: SubjectOut) =>
    s.topics
      .filter((t) => t.novos > 0)
      .sort((a, b) => b.priority - a.priority || a.id - b.id)[0];

  const toPointer = (s: SubjectOut | undefined) => {
    if (!s) return null;
    const t = pickTopic(s);
    if (!t) return null;
    return {
      subjectId: s.id,
      subjectName: s.name,
      topicId: t.id,
      topicName: t.name,
      camada: s.camada,
      priority: t.priority,
      novos: t.novos,
    };
  };

  const agora = toPointer(rotation[0]);
  const depois = toPointer(rotation[1]);

  const dueTotal = subjects.reduce((sum, s) => sum + s.dueNow, 0);

  // Ordena a lista do mapa: onde há ação primeiro (camada asc), depois quem está
  // mais perto de subir de nível (progresso desc).
  subjects.sort(
    (a, b) => a.camada - b.camada || b.progressPct - a.progressPct || a.name.localeCompare(b.name)
  );

  return NextResponse.json({ dueTotal, agora, depois, subjects });
}
