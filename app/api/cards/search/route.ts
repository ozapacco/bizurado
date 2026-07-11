import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Accent-insensitive substring search over cards.search_text (lower+unaccent,
// kept by trigger), accelerated by the GIN pg_trgm index. Each token must match
// (AND); results are ranked by trigram similarity to the full query.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  if (!q.trim()) {
    return NextResponse.json({ cards: [] });
  }

  const tokens = q
    .split(/[^\p{L}\p{N}_]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return NextResponse.json({ cards: [] });
  }

  const params: unknown[] = [];
  const conds = tokens.map((t) => {
    params.push(t);
    return `c.search_text LIKE '%' || unaccent(lower($${params.length})) || '%'`;
  });
  params.push(q);
  const simIdx = params.length;
  params.push(limit);
  const limIdx = params.length;

  const sql = `
    SELECT c.id, c.topic_id as "topicId", c.question, c.answer, c.bizu, c.tags,
           c.card_type as "cardType",
           s.name as "subjectName", t.name as "topicName"
    FROM cards c
    JOIN topics t ON t.id = c.topic_id
    JOIN subjects s ON s.id = t.subject_id
    WHERE ${conds.join(" AND ")}
    ORDER BY similarity(c.search_text, unaccent(lower($${simIdx}))) DESC, c.id ASC
    LIMIT $${limIdx}`;

  try {
    const cards = await query(sql, params);
    return NextResponse.json({ cards });
  } catch {
    return NextResponse.json({ cards: [] });
  }
}
