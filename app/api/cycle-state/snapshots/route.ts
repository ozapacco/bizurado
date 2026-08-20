import { NextRequest, NextResponse } from "next/server";
import { execute, query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * `GET /api/cycle-state/snapshots` — lista as versões guardadas (só metadados).
 * `GET ...?id=123` — devolve o conteúdo completo de uma versão, para restaurar.
 */
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      const row = await queryOne<{ id: number; revision: number; origin: string; data: unknown; created_at: string }>(
        `SELECT id, revision, origin, data, created_at FROM cycle_snapshots WHERE id = $1`,
        [Number(id)]
      );
      if (!row) return NextResponse.json({ error: "versão não encontrada" }, { status: 404 });
      return NextResponse.json({
        id: row.id,
        revision: row.revision,
        origin: row.origin,
        createdAt: row.created_at,
        data: row.data,
      });
    }

    const rows = await query<{ id: number; revision: number; origin: string; created_at: string; size: number }>(
      `SELECT id, revision, origin, created_at, pg_column_size(data) AS size
       FROM cycle_snapshots ORDER BY id DESC LIMIT 50`
    );
    return NextResponse.json({
      snapshots: rows.map((r) => ({
        id: r.id,
        revision: r.revision,
        origin: r.origin,
        createdAt: r.created_at,
        size: Number(r.size),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

/**
 * Estaciona uma cópia sem tocar no estado corrente. Usado quando o cliente vai
 * abandonar a própria versão local (a nuvem estava mais nova): a cópia perdida
 * fica guardada antes de ser substituída.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { data?: unknown; revision?: number; origin?: string };
    if (!body || typeof body.data !== "object" || body.data === null) {
      return NextResponse.json({ error: "payload sem `data`" }, { status: 400 });
    }
    const res = await execute(
      `INSERT INTO cycle_snapshots (revision, origin, data, created_at)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
      [
        Number(body.revision ?? 0),
        typeof body.origin === "string" ? body.origin.slice(0, 40) : "parked",
        JSON.stringify(body.data),
        new Date().toISOString(),
      ]
    );
    return NextResponse.json({ ok: true, id: res.rows[0]?.id });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/relation "cycle_snapshots" does not exist/i.test(raw)) {
    return "Tabelas do ciclo ausentes no banco — rode `npm run db:init`.";
  }
  return raw;
}
