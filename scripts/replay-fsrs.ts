// Recomputa TODOS os estados FSRS a partir do review_log (append-only).
// O log é a fonte da verdade e o estado é derivável dele (garantia registrada
// em lib/client/idb.ts) — rode este script após qualquer correção no algoritmo
// (lib/fsrs.ts) para realinhar o banco ao histórico real.
//
// Faz backup dos card_states não-novos antes de escrever. `suspended` é
// preservado. Depois de rodar: npm run build (regenera o progress-seed.json)
// e, em cada navegador, "Restaurar progresso da nuvem" na home.
//
// Rodar: npx tsx scripts/replay-fsrs.ts [--dry-run]
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(__dirname, "..");

// .env.local (o script roda fora do Next, que é quem normalmente carrega isso)
try {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  const m = env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
  if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
} catch {
  /* sem .env.local: usa a env já exportada */
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const { query, tx, closePool } = await import("../lib/db");
  const { createInitialState, schedule } = await import("../lib/fsrs");
  type Rating = 1 | 2 | 3 | 4;
  type CardState = import("../lib/fsrs").CardState;

  // 1. Histórico completo, em ordem cronológica.
  const events = await query<{ card_id: number; rating: number; review_date: string }>(
    `SELECT card_id, rating, review_date FROM review_log ORDER BY review_date ASC, id ASC`
  );
  console.log(`review_log: ${events.length} eventos`);

  // 2. Estados atuais (para backup e para preservar `suspended`).
  const current = await query<Record<string, unknown> & { card_id: number; suspended: number | null }>(
    `SELECT * FROM card_states WHERE state <> 'new' OR COALESCE(suspended,0) = 1`
  );
  const suspendedOf = new Map(current.map((c) => [c.card_id, Number(c.suspended ?? 0)]));

  const backupPath =
    process.env.BACKUP_PATH ?? join(tmpdir(), `bizurado-card-states-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ takenAt: new Date().toISOString(), card_states: current }, null, 2));
  console.log(`backup de ${current.length} estados: ${backupPath}`);

  // 3. Replay por card.
  const byCard = new Map<number, { rating: Rating; date: Date }[]>();
  for (const e of events) {
    const iso = e.review_date.includes("T") ? e.review_date : e.review_date.replace(" ", "T") + "Z";
    const list = byCard.get(e.card_id) ?? [];
    list.push({ rating: e.rating as Rating, date: new Date(iso) });
    byCard.set(e.card_id, list);
  }

  const rows: Record<string, unknown>[] = [];
  for (const [cardId, evs] of byCard) {
    let state = createInitialState(evs[0].date);
    for (const ev of evs) state = schedule(state, ev.rating, ev.date);
    rows.push({
      card_id: cardId,
      stability: state.stability,
      difficulty: state.difficulty,
      due: state.due,
      elapsed_days: state.elapsed_days,
      scheduled_days: state.scheduled_days,
      reps: state.reps,
      lapses: state.lapses,
      last_review: state.last_review,
      state: state.state,
      learning_step: state.learning_step,
      suspended: suspendedOf.get(cardId) ?? 0,
    });
  }
  const untouched = current.filter((c) => !byCard.has(c.card_id));
  console.log(`replay: ${rows.length} cards recomputados · ${untouched.length} sem eventos no log (mantidos)`);

  // 4. Escrever (uma transação, um UPDATE em lote).
  if (!DRY_RUN) {
    await tx(async (client) => {
      const res = await client.query(
        `UPDATE card_states cs SET
           stability = v.stability, difficulty = v.difficulty, due = v.due,
           elapsed_days = v.elapsed_days, scheduled_days = v.scheduled_days,
           reps = v.reps, lapses = v.lapses, last_review = v.last_review,
           state = v.state, learning_step = v.learning_step, suspended = v.suspended
         FROM jsonb_to_recordset($1::jsonb) AS v(
           card_id int, stability float8, difficulty float8, due text,
           elapsed_days float8, scheduled_days float8, reps int, lapses int,
           last_review text, state text, learning_step int, suspended int)
         WHERE cs.card_id = v.card_id`,
        [JSON.stringify(rows)]
      );
      console.log(`card_states atualizados: ${res.rowCount}`);
    });
  } else {
    console.log("(dry-run: nada escrito)");
  }

  // 5. Relatório: distribuição e previsão de carga (14 dias).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const dist = new Map<string, number>();
  const forecast = new Map<string, number>();
  let dueBacklog = 0;
  for (const r of rows) {
    if (r.suspended === 1) continue;
    dist.set(r.state as string, (dist.get(r.state as string) ?? 0) + 1);
    const due = new Date(r.due as string);
    const bucket = due < today ? today : due;
    if (bucket.getTime() - today.getTime() < 14 * 86400000) {
      const key = dayStr(bucket);
      forecast.set(key, (forecast.get(key) ?? 0) + 1);
      if (due < today) dueBacklog++;
    }
  }
  console.log("\nestados:", Object.fromEntries(dist));
  console.log(`vencidos acumulados (entram hoje): ${dueBacklog}`);
  console.log("\nprevisão de revisões por dia (14 dias):");
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const n = forecast.get(dayStr(d)) ?? 0;
    console.log(`  ${dayStr(d)}  ${String(n).padStart(4)}  ${"█".repeat(Math.min(60, n))}`);
  }

  // 6. Simulação: zerando a fila de hoje só com "Bom", como fica a semana?
  const endOfToday = new Date(today.getTime() + 86400000);
  const sim = new Map<string, number>();
  let hitsToday = 0;
  for (const r of rows) {
    if (r.suspended === 1) continue;
    let st: CardState = {
      stability: r.stability as number,
      difficulty: r.difficulty as number,
      due: r.due as string,
      elapsed_days: r.elapsed_days as number,
      scheduled_days: r.scheduled_days as number,
      reps: r.reps as number,
      lapses: r.lapses as number,
      last_review: r.last_review as string | null,
      state: r.state as string,
      learning_step: r.learning_step as number,
    };
    let cursor = new Date();
    let guard = 0;
    // Cards em learning voltam em minutos dentro do próprio dia — conta cada passada.
    while (new Date(st.due) < endOfToday && guard < 4) {
      st = schedule(st, 3, cursor);
      hitsToday++;
      guard++;
      cursor = new Date(cursor.getTime() + 10 * 60000);
    }
    const due = new Date(st.due);
    if (due.getTime() - today.getTime() < 14 * 86400000) {
      const key = dayStr(due);
      sim.set(key, (sim.get(key) ?? 0) + 1);
    }
  }
  console.log(`\nsimulação — zerar hoje com "Bom" custa ~${hitsToday} avaliações; dias seguintes:`);
  for (let i = 1; i < 14; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const n = sim.get(dayStr(d)) ?? 0;
    console.log(`  ${dayStr(d)}  ${String(n).padStart(4)}  ${"█".repeat(Math.min(60, n))}`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
