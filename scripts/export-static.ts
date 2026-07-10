// Exporta o conteúdo do banco para JSON estático (arquitetura local-first):
//   public/data/index.json           — disciplinas + tópicos (navegação)
//   public/data/decks/{topicId}.json — cards de cada baralho (conteúdo puro)
//   public/data/progress-seed.json   — snapshot do progresso atual (estados
//                                      FSRS não-novos + review_log + voltas),
//                                      importado pelo cliente no primeiro uso.
// Rodar: npm run export:static (exige DATABASE_URL no .env.local)
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

// .env.local (o script roda fora do Next, que é quem normalmente carrega isso)
try {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  const m = env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
  if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
} catch {
  /* sem .env.local: usa a env já exportada */
}

async function main() {
  const { query, closePool } = await import("../lib/db");

  const outDir = join(root, "public", "data");
  const decksDir = join(outDir, "decks");
  mkdirSync(decksDir, { recursive: true });

  // Índice: disciplinas + tópicos
  const subjects = await query<{ id: number; name: string }>(
    `SELECT id, name FROM subjects ORDER BY name`
  );
  const topics = await query<{
    id: number;
    subject_id: number;
    name: string;
    order: number;
    cards: string;
  }>(
    `SELECT t.id, t.subject_id, t.name, t."order", count(c.id)::text AS cards
     FROM topics t LEFT JOIN cards c ON c.topic_id = t.id
     GROUP BY t.id ORDER BY t.subject_id, t.id`
  );
  const index = {
    generatedAt: new Date().toISOString(),
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      topics: topics
        .filter((t) => t.subject_id === s.id)
        .map((t) => ({
          id: t.id,
          name: t.name,
          order: t.order,
          cardCount: Number(t.cards),
        })),
    })),
  };
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index));
  console.log(
    `index.json: ${subjects.length} disciplinas, ${topics.length} tópicos`
  );

  // Baralhos: um arquivo por tópico, cards em ordem de criação (a "volta")
  let totalCards = 0;
  for (const t of topics) {
    const subject = subjects.find((s) => s.id === t.subject_id);
    const cards = await query(
      `SELECT c.id, c.question, c.answer, c.bizu, c.source, c.tags,
              c.card_type AS "cardType"
       FROM cards c WHERE c.topic_id = $1 ORDER BY c.id ASC`,
      [t.id]
    );
    totalCards += cards.length;
    writeFileSync(
      join(decksDir, `${t.id}.json`),
      JSON.stringify({
        topicId: t.id,
        topicName: t.name,
        subjectId: t.subject_id,
        subjectName: subject?.name ?? "",
        cards,
      })
    );
  }
  console.log(`decks/: ${topics.length} arquivos, ${totalCards} cards`);

  // Snapshot do progresso atual — nada se perde na migração.
  const states = await query(
    `SELECT cs.card_id AS "cardId", c.topic_id AS "topicId",
            cs.stability, cs.difficulty, cs.due, cs.elapsed_days AS "elapsedDays",
            cs.scheduled_days AS "scheduledDays", cs.reps, cs.lapses,
            cs.last_review AS "lastReview", cs.state,
            cs.learning_step AS "learningStep", COALESCE(cs.suspended,0)::int AS suspended
     FROM card_states cs JOIN cards c ON c.id = cs.card_id
     WHERE cs.state <> 'new' OR COALESCE(cs.suspended,0) = 1`
  );
  const log = await query(
    `SELECT rl.card_id AS "cardId", c.topic_id AS "topicId", t.subject_id AS "subjectId",
            rl.rating, rl.review_date AS "reviewDate"
     FROM review_log rl JOIN cards c ON c.id = rl.card_id JOIN topics t ON t.id = c.topic_id
     ORDER BY rl.review_date`
  );
  const voltas = await query(
    `SELECT topic_id AS "topicId", priority, study_count AS "voltas",
            interval_days AS "intervalDays", due, last_studied AS "lastStudied",
            avg_minutes AS "avgMinutes", min_per_card AS "minPerCard", status
     FROM topic_study`
  );
  writeFileSync(
    join(outDir, "progress-seed.json"),
    JSON.stringify({ exportedAt: new Date().toISOString(), states, log, voltas })
  );
  console.log(
    `progress-seed.json: ${states.length} estados, ${log.length} revisões, ${voltas.length} voltas`
  );

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
