// Zera TODO o progresso de estudo, preservando o conteúdo (cards, tópicos,
// disciplinas). Use com um backup na mão: `backups/neon-*.json`.
//
// Rodar: npx tsx scripts/reset-progress.ts --confirmo
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
try {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  const m = env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
  if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
} catch {
  /* usa a env já exportada */
}

async function main() {
  if (!process.argv.includes("--confirmo")) {
    console.error("Recusado: rode com --confirmo. Isto apaga todo o progresso.");
    process.exit(1);
  }

  const { getPool, closePool, query } = await import("../lib/db");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Progresso puro: sai inteiro.
    await client.query(`DELETE FROM review_log`);
    await client.query(`DELETE FROM topic_sessions`);
    await client.query(`DELETE FROM daily_plan`);
    await client.query(`DELETE FROM daily_budget`);
    await client.query(`DELETE FROM cycle_snapshots`);
    await client.query(`DELETE FROM cycle_state`);

    // Estado por card: a LINHA continua (o seed mantém uma por card), os
    // valores voltam ao de fábrica. Deletar quebraria o invariante de
    // `lib/seed.ts` e faria o próximo seed recriar tudo do zero à toa.
    await client.query(`
      UPDATE card_states SET
        stability = 0, difficulty = 0,
        due = to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        elapsed_days = 0, scheduled_days = 0, reps = 0, lapses = 0,
        last_review = NULL, suspended = 0, state = 'new', learning_step = 0
    `);

    // Voltas e prioridade por baralho.
    await client.query(`
      UPDATE topic_study SET
        priority = 3, study_count = 0, interval_days = 0,
        due = NULL, last_studied = NULL, avg_minutes = NULL,
        min_per_card = NULL, status = 'new'
    `);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const conf = await query<Record<string, number>>(`SELECT
    (SELECT count(*) FROM review_log)::int AS review_log,
    (SELECT count(*) FROM card_states WHERE state <> 'new')::int AS estados_nao_novos,
    (SELECT count(*) FROM topic_study WHERE study_count > 0)::int AS baralhos_com_volta,
    (SELECT count(*) FROM cycle_state)::int AS cycle_state,
    (SELECT count(*) FROM cycle_snapshots)::int AS cycle_snapshots,
    (SELECT count(*) FROM cards)::int AS cards_preservados,
    (SELECT count(*) FROM topics)::int AS topicos_preservados`);
  console.log("Depois do reset:", conf[0]);
  await closePool();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
