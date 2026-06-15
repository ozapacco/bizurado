import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Build a safe FTS5 MATCH query from arbitrary user input.
// Strategy: extract alphanumeric/word tokens (unicode-aware), wrap each in
// double quotes (escaping embedded quotes) and append `*` for prefix search.
// Returns null when there is nothing searchable.
function buildFtsQuery(raw: string): string | null {
  // Split on anything that is not a letter, digit or underscore (unicode).
  const tokens = raw
    .split(/[^\p{L}\p{N}_]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  return tokens
    .map((t) => {
      const escaped = t.replace(/"/g, '""');
      return `"${escaped}"*`;
    })
    .join(" ");
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  if (!q.trim()) {
    return NextResponse.json({ cards: [] });
  }

  const matchQuery = buildFtsQuery(q);
  if (!matchQuery) {
    return NextResponse.json({ cards: [] });
  }

  const sql = `SELECT c.id, c.question, c.answer, c.bizu, c.tags, c.card_type as cardType,
              s.name as subjectName, t.name as topicName
       FROM cards_fts f
       JOIN cards c ON c.id = f.rowid
       JOIN topics t ON t.id = c.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE cards_fts MATCH ?
       ORDER BY rank
       LIMIT ?`;

  try {
    const cards = db.prepare(sql).all(matchQuery, limit) as any[];
    return NextResponse.json({ cards });
  } catch {
    // Graceful fallback: an invalid FTS expression should not 500 the route.
    return NextResponse.json({ cards: [] });
  }
}
