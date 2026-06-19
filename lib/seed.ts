import path from "path";
import { loadLocalEnv } from "./env";
import { scanDirectory } from "./parser";
import { query, queryOne, closePool } from "./db";

const MATERIALS_DIR = path.join(process.cwd());

// Cap rows per multi-value INSERT so we never approach Postgres' 65535-param
// limit (7 params/card -> ~9300 cards/insert worst case; 300 is comfortable).
const CARD_CHUNK = 300;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Import all .txt materials from `baseDir` into Postgres (Neon).
 *
 * Idempotent: subjects/topics upsert by their unique keys; cards use
 * ON CONFLICT (topic_id, question) DO NOTHING, so re-running only inserts what's
 * new and never duplicates or clobbers existing FSRS progress. Each newly
 * inserted card gets a fresh card_states row; each topic gets a topic_study row.
 */
export async function importAllMaterials(
  baseDir: string = MATERIALS_DIR
): Promise<{ subjects: number; topics: number; cards: number }> {
  const topics = scanDirectory(baseDir);

  const subjectCache = new Map<string, number>();
  const topicCache = new Map<string, number>();
  let cardCount = 0;

  for (const topic of topics) {
    // --- Subject (upsert, return id) ---
    let subjectId = subjectCache.get(topic.subjectName);
    if (!subjectId) {
      const row = await queryOne<{ id: number }>(
        `INSERT INTO subjects (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [topic.subjectName]
      );
      subjectId = row!.id;
      subjectCache.set(topic.subjectName, subjectId);
    }

    // --- Topic (upsert, return id) + ensure its topic_study row ---
    const topicKey = `${subjectId}|${topic.topicName}`;
    let topicId = topicCache.get(topicKey);
    if (!topicId) {
      const row = await queryOne<{ id: number }>(
        `INSERT INTO topics (subject_id, name, file_path, "order") VALUES ($1, $2, $3, 0)
         ON CONFLICT (subject_id, name) DO UPDATE SET file_path = EXCLUDED.file_path
         RETURNING id`,
        [subjectId, topic.topicName, topic.filePath]
      );
      topicId = row!.id;
      topicCache.set(topicKey, topicId);
      await query(
        `INSERT INTO topic_study (topic_id) VALUES ($1) ON CONFLICT (topic_id) DO NOTHING`,
        [topicId]
      );
    }

    // --- Cards (batched multi-row insert; collect newly inserted ids) ---
    for (const part of chunk(topic.cards, CARD_CHUNK)) {
      const values: string[] = [];
      const params: unknown[] = [];
      part.forEach((card, i) => {
        const b = i * 7;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`
        );
        params.push(
          topicId,
          card.question,
          card.answer,
          card.bizu,
          card.source,
          card.tags.join(","),
          card.cardType
        );
      });

      const inserted = await query<{ id: number }>(
        `INSERT INTO cards (topic_id, question, answer, bizu, source, tags, card_type)
         VALUES ${values.join(", ")}
         ON CONFLICT (topic_id, question) DO NOTHING
         RETURNING id`,
        params
      );

      if (inserted.length > 0) {
        const ids = inserted.map((r) => r.id);
        await query(
          `INSERT INTO card_states (card_id)
           SELECT x FROM unnest($1::int[]) AS x
           ON CONFLICT (card_id) DO NOTHING`,
          [ids]
        );
        cardCount += inserted.length;
      }
    }
  }

  return {
    subjects: subjectCache.size,
    topics: topicCache.size,
    cards: cardCount,
  };
}

// CLI: `npm run seed` runs a full import from the project root against the DB in
// DATABASE_URL (.env.local locally, or the Neon production URL).
if (require.main === module) {
  loadLocalEnv();
  importAllMaterials()
    .then(async (r) => {
      console.log(
        `Importação concluída: ${r.subjects} disciplina(s), ${r.topics} tópico(s), ${r.cards} card(s) novos.`
      );
      await closePool();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error("Falha na importação:", e);
      await closePool();
      process.exit(1);
    });
}
