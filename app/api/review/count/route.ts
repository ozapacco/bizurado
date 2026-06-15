import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const dueCount = (
    db.prepare(
      "SELECT COUNT(*) as count FROM card_states WHERE due < ? AND COALESCE(suspended, 0) = 0"
    ).get(startOfNextDayISO()) as { count: number }
  ).count;

  return NextResponse.json({ dueCount });
}
