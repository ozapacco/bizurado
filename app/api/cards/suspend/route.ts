import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Marcar/desmarcar um card como "dominado" (suspended). Cards dominados saem da
// rotação de revisão (ver app/api/review e os contadores de pendências), mas
// continuam acessíveis diretamente por cardId (busca).
export async function POST(req: NextRequest) {
  const db = getDb();
  const body = (await req.json().catch(() => ({}))) as {
    cardId?: number;
    suspended?: boolean;
  };

  const cardId = Number(body.cardId);
  if (!Number.isInteger(cardId)) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  // Default: marcar como dominado. Passe { suspended: false } para reativar.
  const suspended = body.suspended === false ? 0 : 1;

  const card = db
    .prepare("SELECT id FROM cards WHERE id = ?")
    .get(cardId) as { id: number } | undefined;
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const apply = db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO card_states (card_id) VALUES (?)").run(cardId);
    db.prepare("UPDATE card_states SET suspended = ? WHERE card_id = ?").run(
      suspended,
      cardId
    );
  });
  apply();

  return NextResponse.json({ cardId, suspended: suspended === 1 });
}
