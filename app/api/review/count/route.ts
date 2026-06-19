import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function GET() {
  const row = (await queryOne(
    "SELECT COUNT(*)::int as count FROM card_states WHERE due < $1 AND COALESCE(suspended, 0) = 0",
    [startOfNextDayISO()]
  )) as { count: number };

  return NextResponse.json({ dueCount: row.count });
}
