import { getDb } from "./db";
import { scanDirectory } from "./parser";
import path from "path";

const MATERIALS_DIR = path.join(process.cwd());

export function importAllMaterials(baseDir: string = MATERIALS_DIR): {
  subjects: number;
  topics: number;
  cards: number;
} {
  const db = getDb();

  // Snapshot the DB before importing so a bad/unexpected import can always be
  // restored from data/backups/.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { backupDatabase } = require("./backup.js") as {
    backupDatabase: (reason?: string) => string | null;
  };
  backupDatabase("pre-import");

  const topics = scanDirectory(baseDir);

  const subjectCache = new Map<string, number>();
  const topicCache = new Map<string, number>();
  let cardCount = 0;

  const insertSubject = db.prepare(
    "INSERT OR IGNORE INTO subjects (name) VALUES (?)"
  );
  const selectSubject = db.prepare(
    "SELECT id FROM subjects WHERE name = ?"
  );
  const insertTopic = db.prepare(
    `INSERT OR IGNORE INTO topics (subject_id, name, file_path, "order") VALUES (?, ?, ?, ?)`
  );
  const selectTopic = db.prepare(
    "SELECT id FROM topics WHERE subject_id = ? AND name = ?"
  );
  const insertCard = db.prepare(
    "INSERT OR IGNORE INTO cards (topic_id, question, answer, bizu, source, tags, card_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertState = db.prepare(
    "INSERT OR IGNORE INTO card_states (card_id) VALUES (?)"
  );

  db.exec("BEGIN");
  try {
    for (const topic of topics) {
      let subjectId = subjectCache.get(topic.subjectName);
      if (!subjectId) {
        insertSubject.run(topic.subjectName);
        const row = selectSubject.get(topic.subjectName) as { id: number } | undefined;
        if (!row) continue;
        subjectId = row.id;
        subjectCache.set(topic.subjectName, subjectId);
      }

      const topicKey = `${subjectId}|${topic.topicName}`;
      let topicId = topicCache.get(topicKey);
      if (!topicId) {
        insertTopic.run(subjectId, topic.topicName, topic.filePath, 0);
        const row = selectTopic.get(subjectId, topic.topicName) as { id: number } | undefined;
        if (!row) continue;
        topicId = row.id;
        topicCache.set(topicKey, topicId);
      }

      for (const card of topic.cards) {
        const tagsStr = card.tags.join(",");
        const result = insertCard.run(
          topicId,
          card.question,
          card.answer,
          card.bizu,
          card.source,
          tagsStr,
          card.cardType
        );
        if (result.changes > 0) {
          insertState.run(Number(result.lastInsertRowid));
          cardCount++;
        }
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return {
    subjects: subjectCache.size,
    topics: topicCache.size,
    cards: cardCount,
  };
}

// CLI: `npm run seed` runs a full import from the project root (taking a
// pre-import backup first, exactly like the in-app "Reimportar" button).
if (require.main === module) {
  const r = importAllMaterials();
  console.log(
    `Importação concluída: ${r.subjects} disciplina(s), ${r.topics} tópico(s), ${r.cards} card(s) novos.`
  );
}
