import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, tx } from "@/lib/db";

export const dynamic = "force-dynamic";

type CycleRow = { revision: number; data: unknown; updated_at: string };

/** Estado atual do ciclo na nuvem. `revision: 0` = nunca houve backup. */
export async function GET() {
  try {
    const row = await queryOne<CycleRow>(
      `SELECT revision, data, updated_at FROM cycle_state WHERE id = 1`
    );
    if (!row) {
      return NextResponse.json({ revision: 0, data: null, updatedAt: null });
    }
    return NextResponse.json({
      revision: row.revision,
      data: row.data,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

/**
 * Grava o snapshot do ciclo.
 *
 * Concorrência otimista: o cliente manda a `revision` que ele acredita ser a da
 * nuvem. Se a nuvem já avançou (outro dispositivo gravou), responde 409 com a
 * cópia do servidor — o cliente decide. Com `force: true` a escrita acontece
 * mesmo assim, e a versão sobreposta continua íntegra em `cycle_snapshots`.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      revision?: number;
      data?: unknown;
      force?: boolean;
      origin?: string;
    };

    if (!body || typeof body.data !== "object" || body.data === null) {
      return NextResponse.json({ error: "payload sem `data`" }, { status: 400 });
    }

    const baseRevision = Number(body.revision ?? 0);
    const origin = typeof body.origin === "string" ? body.origin.slice(0, 40) : "push";

    const result = await tx(async (client) => {
      const cur = await client.query<CycleRow>(
        `SELECT revision, data, updated_at FROM cycle_state WHERE id = 1 FOR UPDATE`
      );
      const current = cur.rows[0];
      const currentRevision = current?.revision ?? 0;

      if (current && currentRevision > baseRevision && !body.force) {
        return {
          conflict: true as const,
          revision: currentRevision,
          data: current.data,
          updatedAt: current.updated_at,
        };
      }

      const nextRevision = Math.max(currentRevision, baseRevision) + 1;
      const updatedAt = new Date().toISOString();
      const json = JSON.stringify(body.data);

      // Empilha a versão que está sendo sobreposta antes de trocá-la.
      if (current) {
        await client.query(
          `INSERT INTO cycle_snapshots (revision, origin, data, created_at)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [currentRevision, "superseded", JSON.stringify(current.data), updatedAt]
        );
      }

      await client.query(
        `INSERT INTO cycle_state (id, revision, data, updated_at)
         VALUES (1, $1, $2::jsonb, $3)
         ON CONFLICT (id) DO UPDATE SET
           revision = EXCLUDED.revision,
           data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
        [nextRevision, json, updatedAt]
      );

      await client.query(
        `INSERT INTO cycle_snapshots (revision, origin, data, created_at)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [nextRevision, origin, json, updatedAt]
      );

      // Mantém as 200 versões mais recentes — meses de histórico, sem inchar.
      await client.query(
        `DELETE FROM cycle_snapshots WHERE id NOT IN (
           SELECT id FROM cycle_snapshots ORDER BY id DESC LIMIT 200
         )`
      );

      return { conflict: false as const, revision: nextRevision, updatedAt };
    });

    if (result.conflict) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/relation "cycle_state" does not exist/i.test(raw)) {
    return "Tabelas do ciclo ausentes no banco — rode `npm run db:init`.";
  }
  return raw;
}
