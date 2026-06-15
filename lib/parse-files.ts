import { getDb } from "./db";
import { scanDirectory } from "./parser";
import path from "path";
import fs from "fs";

const MATERIALS_DIR = path.join(process.cwd());

const db = getDb();

// Snapshot the DB before importing so a bad/unexpected import can always be
// restored from data/backups/.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { backupDatabase } = require("./backup.js") as {
  backupDatabase: (reason?: string) => string | null;
};
backupDatabase("pre-import");

const topics = scanDirectory(MATERIALS_DIR);

const subjectCache = new Map<string, number>();
const topicCache = new Map<string, number>();
const seenCards = new Set<string>();
let cardCount = 0;
let skipCount = 0;

const insertSubject = db.prepare(
  "INSERT OR IGNORE INTO subjects (name) VALUES (?)"
);
const selectSubject = db.prepare("SELECT id FROM subjects WHERE name = ?");
const insertTopic = db.prepare(
  `INSERT OR IGNORE INTO topics (subject_id, name, file_path, "order") VALUES (?, ?, ?, ?)`
);
const selectTopic = db.prepare(
  "SELECT id FROM topics WHERE subject_id = ? AND name = ?"
);
  const insertCard = db.prepare(
    "INSERT INTO cards (topic_id, question, answer, bizu, source, tags, card_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
const insertState = db.prepare(
  "INSERT INTO card_states (card_id) VALUES (?)"
);

db.exec("BEGIN");
try {
  for (const topic of topics) {
    let subjectId = subjectCache.get(topic.subjectName);
    if (!subjectId) {
      insertSubject.run(topic.subjectName);
      const row = selectSubject.get(topic.subjectName) as
        | { id: number }
        | undefined;
      if (!row) {
        console.error(`Could not find/create subject: ${topic.subjectName}`);
        continue;
      }
      subjectId = row.id;
      subjectCache.set(topic.subjectName, subjectId);
    }

    const topicKey = `${subjectId}|${topic.topicName}`;
    let topicId = topicCache.get(topicKey);
    if (!topicId) {
      insertTopic.run(subjectId, topic.topicName, topic.filePath, 0);
      const row = selectTopic.get(subjectId, topic.topicName) as
        | { id: number }
        | undefined;
      if (!row) {
        console.error(`Could not find/create topic: ${topic.topicName}`);
        continue;
      }
      topicId = row.id;
      topicCache.set(topicKey, topicId);
    }

    for (const card of topic.cards) {
      const cardKey = `${topicId}|${card.question}`;
      if (seenCards.has(cardKey)) {
        skipCount++;
        continue;
      }
      seenCards.add(cardKey);
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
      } else {
        skipCount++;
      }
    }
  }
  db.exec("COMMIT");
  console.log(`Importação concluída!`);
  console.log(`  ${subjectCache.size} disciplina(s)`);
  console.log(`  ${topicCache.size} tópico(s)`);
  console.log(`  ${cardCount} card(s) importados`);
  console.log(`  ${skipCount} card(s) ignorados (já existiam)`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error("Erro na importação:", e);
}
