import { NextRequest, NextResponse } from "next/server";
import { query, tx } from "@/lib/db";

export const dynamic = "force-dynamic";

// Cards criados pelo app ficam marcados assim. É o que os distingue dos 44.908
// importados dos arquivos .txt, sem precisar de tabela separada.
const FONTE_APP = "app";

// Cada assunto do ciclo ganha uma "gaveta" própria sob demanda. O nome é
// `<assunto> > Meus cards`: o casamento por módulo (lib/subjectMatch) enxerga
// "<assunto>" como módulo, então a gaveta entra no mesmo grupo dos baralhos
// oficiais daquele assunto, sem nenhuma regra especial.
const GAVETA = "Meus cards";

type Body = {
  subjectName?: string;
  topicName?: string;
  question?: string;
  answer?: string;
  bizu?: string;
  tags?: string;
};

/** Lista os cards criados no app, para os outros dispositivos os receberem. */
export async function GET() {
  try {
    const cards = await query(
      `SELECT c.id, c.topic_id AS "topicId", c.question, c.answer,
              COALESCE(c.bizu,'') AS bizu, COALESCE(c.source,'') AS source,
              COALESCE(c.tags,'') AS tags, COALESCE(c.card_type,'normal') AS "cardType",
              t.name AS "topicName", t.subject_id AS "subjectId", s.name AS "subjectName"
       FROM cards c
       JOIN topics t ON t.id = c.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE c.source = $1
       ORDER BY c.id`,
      [FONTE_APP]
    );
    return NextResponse.json({ cards });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const subjectName = (body.subjectName ?? "").trim();
    const topicName = (body.topicName ?? "").trim();
    const question = (body.question ?? "").trim();
    const answer = (body.answer ?? "").trim();

    if (!subjectName || !topicName) {
      return NextResponse.json({ error: "disciplina e assunto são obrigatórios" }, { status: 400 });
    }
    if (!question || !answer) {
      return NextResponse.json({ error: "pergunta e resposta são obrigatórias" }, { status: 400 });
    }

    const criado = await tx(async (client) => {
      const sub = await client.query<{ id: number }>(
        `SELECT id FROM subjects WHERE name = $1`,
        [subjectName]
      );
      if (sub.rows.length === 0) {
        throw new Error(`disciplina "${subjectName}" não existe`);
      }
      const subjectId = sub.rows[0].id;
      const nomeGaveta = `${topicName} > ${GAVETA}`;

      // Gaveta sob demanda: criada na primeira vez, reaproveitada depois.
      const topico = await client.query<{ id: number }>(
        `INSERT INTO topics (subject_id, name, file_path, "order")
         VALUES ($1, $2, NULL, 9999)
         ON CONFLICT (subject_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [subjectId, nomeGaveta]
      );
      const topicId = topico.rows[0].id;

      const card = await client.query<{ id: number }>(
        `INSERT INTO cards (topic_id, question, answer, bizu, source, tags, card_type)
         VALUES ($1, $2, $3, $4, $5, $6, 'normal')
         ON CONFLICT (topic_id, question) DO NOTHING
         RETURNING id`,
        [topicId, question, answer, body.bizu?.trim() || null, FONTE_APP, body.tags?.trim() || ""]
      );

      if (card.rows.length === 0) {
        throw new Error("já existe um card com essa mesma pergunta neste assunto");
      }
      const cardId = card.rows[0].id;

      // Todo card precisa da linha de estado, igual ao que o seed faz.
      await client.query(
        `INSERT INTO card_states (card_id, state) VALUES ($1, 'new') ON CONFLICT DO NOTHING`,
        [cardId]
      );
      await client.query(
        `INSERT INTO topic_study (topic_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [topicId]
      );

      return { cardId, topicId, topicName: nomeGaveta, subjectId, subjectName };
    });

    return NextResponse.json({ ok: true, ...criado });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 400 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
