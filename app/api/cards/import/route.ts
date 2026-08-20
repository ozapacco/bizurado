import { NextRequest, NextResponse } from "next/server";
import { tx } from "@/lib/db";
import { parseContent } from "@/lib/parser";

export const dynamic = "force-dynamic";

const FONTE_APP = "app";
const GAVETA = "Meus cards";

// Teto por importação: evita um arquivo enorme derrubar a transação por tempo.
const LIMITE = 2000;

type Body = {
  subjectName?: string;
  topicName?: string;
  content?: string;
  dryRun?: boolean;
};

/**
 * Importa cards de um arquivo `.txt` no mesmo formato dos materiais originais
 * (`pergunta;resposta` por linha, com `[TAG]`, BIZU e Fonte opcionais).
 *
 * Usa `parseContent` — exatamente o parser que leu os 44.908 cards existentes.
 * Um formato só: o que funciona no script funciona aqui, e vice-versa.
 *
 * Com `dryRun`, não escreve nada e devolve a prévia do que aconteceria.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const subjectName = (body.subjectName ?? "").trim();
    const topicName = (body.topicName ?? "").trim();
    const content = body.content ?? "";

    if (!subjectName || !topicName) {
      return NextResponse.json({ error: "disciplina e assunto são obrigatórios" }, { status: 400 });
    }
    if (!content.trim()) {
      return NextResponse.json({ error: "arquivo vazio" }, { status: 400 });
    }

    const lidos = parseContent(content);
    if (lidos.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhum card reconhecido. Cada linha precisa ser `pergunta;resposta` — o ponto e vírgula separa os dois lados.",
        },
        { status: 400 }
      );
    }
    if (lidos.length > LIMITE) {
      return NextResponse.json(
        { error: `Arquivo com ${lidos.length} cards; o limite por importação é ${LIMITE}.` },
        { status: 400 }
      );
    }

    // Duplicata dentro do próprio arquivo: a primeira ocorrência vence.
    const vistas = new Set<string>();
    const unicos = lidos.filter((c) => {
      if (vistas.has(c.question)) return false;
      vistas.add(c.question);
      return true;
    });

    const nomeGaveta = `${topicName} > ${GAVETA}`;

    if (body.dryRun) {
      return NextResponse.json({
        previa: true,
        lidos: lidos.length,
        aImportar: unicos.length,
        repetidosNoArquivo: lidos.length - unicos.length,
        gaveta: nomeGaveta,
        amostra: unicos.slice(0, 3).map((c) => ({
          question: c.question.slice(0, 160),
          answer: c.answer.slice(0, 160),
          bizu: c.bizu.slice(0, 120),
          tags: c.tags,
        })),
      });
    }

    const resultado = await tx(async (client) => {
      const sub = await client.query<{ id: number }>(`SELECT id FROM subjects WHERE name = $1`, [
        subjectName,
      ]);
      if (sub.rows.length === 0) throw new Error(`disciplina "${subjectName}" não existe`);
      const subjectId = sub.rows[0].id;

      const topico = await client.query<{ id: number }>(
        `INSERT INTO topics (subject_id, name, file_path, "order")
         VALUES ($1, $2, NULL, 9999)
         ON CONFLICT (subject_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [subjectId, nomeGaveta]
      );
      const topicId = topico.rows[0].id;

      const inseridos: {
        id: number;
        question: string;
        answer: string;
        bizu: string;
        tags: string;
        cardType: string;
      }[] = [];

      for (const c of unicos) {
        // ON CONFLICT: reimportar o mesmo arquivo não duplica nem apaga o
        // progresso do que já estava lá.
        const r = await client.query<{ id: number }>(
          `INSERT INTO cards (topic_id, question, answer, bizu, source, tags, card_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (topic_id, question) DO NOTHING
           RETURNING id`,
          [
            topicId,
            c.question,
            c.answer,
            c.bizu || null,
            FONTE_APP,
            c.tags.join(","),
            c.cardType,
          ]
        );
        if (r.rows.length === 0) continue;

        const id = r.rows[0].id;
        await client.query(
          `INSERT INTO card_states (card_id, state) VALUES ($1, 'new') ON CONFLICT DO NOTHING`,
          [id]
        );
        inseridos.push({
          id,
          question: c.question,
          answer: c.answer,
          bizu: c.bizu,
          tags: c.tags.join(","),
          cardType: c.cardType,
        });
      }

      await client.query(
        `INSERT INTO topic_study (topic_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [topicId]
      );

      return { topicId, nomeGaveta, subjectId, inseridos };
    });

    return NextResponse.json({
      ok: true,
      topicId: resultado.topicId,
      topicName: resultado.nomeGaveta,
      subjectId: resultado.subjectId,
      subjectName,
      lidos: lidos.length,
      importados: resultado.inseridos.length,
      jaExistiam: unicos.length - resultado.inseridos.length,
      repetidosNoArquivo: lidos.length - unicos.length,
      cards: resultado.inseridos,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
