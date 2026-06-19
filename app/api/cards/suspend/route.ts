import { NextRequest, NextResponse } from "next/server";
import { queryOne, tx } from "@/lib/db";

export const dynamic = "force-dynamic";

// Marcar/desmarcar um card como "dominado" (suspended). Cards dominados saem da
// rotação de revisão (ver app/api/review e os contadores de pendências), mas
// continuam acessíveis diretamente por cardId (busca).
export async function POST(req: NextRequest) {
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

  const card = (await queryOne("SELECT id FROM cards WHERE id = $1", [
    cardId,
  ])) as { id: number } | undefined;
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  await tx(async (client) => {
    await client.query(
      "INSERT INTO card_states (card_id) VALUES ($1) ON CONFLICT (card_id) DO NOTHING",
      [cardId]
    );
    await client.query(
      "UPDATE card_states SET suspended = $1 WHERE card_id = $2",
      [suspended, cardId]
    );
  });

  return NextResponse.json({ cardId, suspended: suspended === 1 });
}
