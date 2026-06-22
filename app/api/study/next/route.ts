import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

// Aponta o PRÓXIMO baralho a girar depois de fechar uma volta. "Mais quente":
// prioridade alta primeiro, depois quem tem mais cards para reativar, depois a
// ordem do tópico. Só entram baralhos com algo a fazer (vencidos ou novos) e
// que não sejam o que acabou de ser estudado.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const excludeTopicId = Number(searchParams.get("excludeTopicId"));
  const sameSubjectId = searchParams.get("subjectId");

  const boundary = startOfNextDayISO();
  const params: unknown[] = [boundary, Number.isInteger(excludeTopicId) ? excludeTopicId : -1];

  // Prefere o mesmo assunto (continuar a disciplina) quando informado, mas cai
  // para qualquer baralho quente se não houver mais nada na disciplina.
  let subjectPref = "";
  if (sameSubjectId && Number.isInteger(Number(sameSubjectId))) {
    params.push(Number(sameSubjectId));
    subjectPref = `CASE WHEN t.subject_id = $${params.length} THEN 0 ELSE 1 END,`;
  }

  const next = (await queryOne(
    `SELECT
       t.id AS "topicId", t.name AS "topicName", s.name AS "subjectName",
       COALESCE(ts.priority, 3)::int AS "priority",
       SUM(CASE WHEN cs.card_id IS NOT NULL AND COALESCE(cs.reps,0)>0
                 AND cs.due < $1 AND COALESCE(cs.suspended,0)=0
                THEN 1 ELSE 0 END)::int AS "dueNow",
       SUM(CASE WHEN COALESCE(cs.reps,0)=0 THEN 1 ELSE 0 END)::int AS "novos"
     FROM topics t
     JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN cards c ON c.topic_id = t.id
     LEFT JOIN card_states cs ON cs.card_id = c.id
     LEFT JOIN topic_study ts ON ts.topic_id = t.id
     WHERE t.id <> $2
     GROUP BY t.id, t.name, s.name, t."order", ts.priority
     HAVING SUM(CASE WHEN cs.card_id IS NOT NULL AND COALESCE(cs.reps,0)>0
                      AND cs.due < $1 AND COALESCE(cs.suspended,0)=0
                     THEN 1 ELSE 0 END)
          + SUM(CASE WHEN COALESCE(cs.reps,0)=0 THEN 1 ELSE 0 END) > 0
     ORDER BY ${subjectPref} COALESCE(ts.priority,3) DESC, "dueNow" DESC, t."order" ASC
     LIMIT 1`,
    params
  )) as
    | {
        topicId: number;
        topicName: string;
        subjectName: string;
        priority: number;
        dueNow: number;
        novos: number;
      }
    | undefined;

  return NextResponse.json({ next: next ?? null });
}
