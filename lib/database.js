const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

function getDbPath() {
  return path.join(process.cwd(), "data", "bizurado-v2.db");
}

let db = null;

function getDb() {
  if (!db) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT,
      "order" INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      bizu TEXT,
      source TEXT,
      tags TEXT DEFAULT '',
      card_type TEXT DEFAULT 'normal',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );
    -- card_states holds per-card FSRS scheduling state.
    -- NOTE: the 'suspended' column (INTEGER NOT NULL DEFAULT 0) is added by
    -- migrateSuspendedColumn() rather than declared here, so that existing
    -- databases pick it up via ALTER TABLE. suspended = 1 marks a card the user
    -- has manually flagged as "mastered" (Anki-style suspend) to take it out of
    -- the review rotation; 0 means active/normal.
    CREATE TABLE IF NOT EXISTS card_states (
      card_id INTEGER PRIMARY KEY,
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      due TEXT DEFAULT (datetime('now')),
      elapsed_days INTEGER DEFAULT 0,
      scheduled_days INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      last_review TEXT,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS review_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      review_date TEXT DEFAULT (datetime('now')),
      elapsed_days INTEGER,
      scheduled_days INTEGER,
      stability REAL,
      difficulty REAL,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
  `);

  // --- Study-cycle schema (topic-level spaced study) ---------------------
  // These tables sit on top of the existing card-level FSRS schema and drive
  // a per-TOPIC study cycle: each topic is studied, timed, and re-scheduled
  // on its own expanding interval, and a daily plan is generated from the
  // topics that are due against the minutes the user has available that day.
  // All CREATE ... IF NOT EXISTS, so this is safe on an already-populated DB.
  database.exec(`
    -- topic_study: current spaced-study state for one topic (1 row per topic).
    CREATE TABLE IF NOT EXISTS topic_study (
      topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
      priority INTEGER NOT NULL DEFAULT 3,        -- 1..5, user-set importance (more-tested themes rank higher)
      study_count INTEGER NOT NULL DEFAULT 0,     -- number of times this topic was studied/completed
      interval_days REAL NOT NULL DEFAULT 0,      -- current spacing window, in days
      due TEXT,                                   -- next target date 'YYYY-MM-DD' (NULL = never studied)
      last_studied TEXT,                          -- last date the topic was studied 'YYYY-MM-DD'
      avg_minutes REAL,                           -- moving-average study pace, NULL until first measurement
      status TEXT NOT NULL DEFAULT 'new',         -- new | learning | review
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- topic_sessions: per-topic stopwatch / time measurements.
    CREATE TABLE IF NOT EXISTS topic_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      day TEXT,                                   -- study day 'YYYY-MM-DD'
      started_at TEXT,                            -- stopwatch start timestamp
      finished_at TEXT,                           -- stopwatch stop timestamp; NULL = session still running
      minutes REAL,                               -- elapsed minutes once finished
      rep_number INTEGER                          -- which repetition of the topic this session was
    );

    -- daily_plan: the plan generated for a given day plus its completion flag.
    CREATE TABLE IF NOT EXISTS daily_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,                          -- plan day 'YYYY-MM-DD'
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                         -- 'novo' (first study) | 'revisao' (review)
      est_minutes REAL,                           -- estimated minutes to complete this item
      position INTEGER,                           -- ordering within the day's plan
      done INTEGER NOT NULL DEFAULT 0,            -- 0 = pending, 1 = completed
      UNIQUE(day, topic_id)                       -- a topic appears at most once per day's plan
    );

    -- daily_budget: minutes the user reports as available for a given day.
    CREATE TABLE IF NOT EXISTS daily_budget (
      day TEXT PRIMARY KEY,                       -- budget day 'YYYY-MM-DD'
      minutes REAL                                -- available study minutes for that day
    );
  `);

  // --- Schema migrations (idempotent, safe on a populated DB) ---
  migrateDedupeCards(database);
  migrateDedupeTopics(database);
  migrateSuspendedColumn(database);
  migrateCardLearningColumns(database);
  migrateTopicPaceColumn(database);
  backfillTopicStudy(database);

  // --- Uniqueness constraint (idempotent) ---
  // Prevents re-importing an edited .txt from duplicating cards: an
  // INSERT OR IGNORE on (topic_id, question) now becomes a true no-op for
  // already-present cards instead of inserting a duplicate. Must be created
  // AFTER migrateDedupeCards() has removed any existing duplicates, otherwise
  // index creation would fail on a dirty DB.
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cards_topic_question
      ON cards(topic_id, question);
  `);

  // Prevents a re-import from creating duplicate (phantom) topic rows: without
  // this, `INSERT OR IGNORE INTO topics` had nothing to conflict on and inserted
  // a new row each time. Must be created AFTER migrateDedupeTopics() has merged
  // any existing duplicates, or index creation would fail on a dirty DB.
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_topics_subject_name
      ON topics(subject_id, name);
  `);

  // --- Performance indexes (idempotent) ---
  // Plain indexes for join/filter columns.
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
    CREATE INDEX IF NOT EXISTS idx_cards_topic ON cards(topic_id);
    CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(card_type);
    CREATE INDEX IF NOT EXISTS idx_reviewlog_card ON review_log(card_id);
  `);
  // Expression indexes for the date()-wrapped filters the app uses.
  // These let "WHERE date(due) <= date('now')" and
  // "WHERE date(review_date) = ?" be served by an index.
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cardstates_due ON card_states(date(due));
    CREATE INDEX IF NOT EXISTS idx_reviewlog_date ON review_log(date(review_date));
  `);
  // Raw (non-expression) index on due, for the absolute-instant range filter
  // "WHERE due < ?" used by the review queue, due counters and progress.
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cardstates_due_raw ON card_states(due);
  `);
  // Study-cycle indexes: support "topics due today", status filters, the
  // daily-plan lookup, and per-topic / running-session queries.
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_topicstudy_due ON topic_study(due);
    CREATE INDEX IF NOT EXISTS idx_topicstudy_status ON topic_study(status);
    CREATE INDEX IF NOT EXISTS idx_dailyplan_day ON daily_plan(day);
    CREATE INDEX IF NOT EXISTS idx_topicsessions_topic ON topic_sessions(topic_id);
    CREATE INDEX IF NOT EXISTS idx_topicsessions_finished ON topic_sessions(finished_at);
  `);

  initFts(database);
}

// Deduplicate cards by (topic_id, question) BEFORE the unique index is created.
// For each duplicate group we keep a single survivor — the card whose card_states
// has the highest `reps` (most learning progress); ties are broken by the lowest
// id. All other cards in the group, along with their card_states and review_log
// rows, are removed. The whole thing runs in one transaction.
//
// This is idempotent in practice: on a DB with no duplicates the candidate query
// returns nothing and the function is a no-op, so re-running getDb() never
// reprocesses or mutates a clean database.
function migrateDedupeCards(database) {
  // Find the (topic_id, question) groups that still have more than one card.
  const dupGroups = database
    .prepare(
      `SELECT topic_id, question
       FROM cards
       GROUP BY topic_id, question
       HAVING COUNT(*) > 1`
    )
    .all();

  if (dupGroups.length === 0) return; // Clean DB: nothing to do.

  // For a given duplicate group, list its card ids ordered so that the survivor
  // (highest reps, then lowest id) is first. card_states may be missing for a
  // card, so COALESCE its reps to -1 to rank it below any real progress.
  const selectGroupCards = database.prepare(
    `SELECT c.id AS id, COALESCE(cs.reps, -1) AS reps
     FROM cards c
     LEFT JOIN card_states cs ON cs.card_id = c.id
     WHERE c.topic_id = ? AND c.question = ?
     ORDER BY reps DESC, c.id ASC`
  );

  // ON DELETE CASCADE would remove card_states / review_log automatically when
  // foreign_keys is ON, but we delete them explicitly so the migration is
  // correct regardless of the pragma state at run time.
  const deleteReviewLog = database.prepare(
    "DELETE FROM review_log WHERE card_id = ?"
  );
  const deleteCardState = database.prepare(
    "DELETE FROM card_states WHERE card_id = ?"
  );
  const deleteCard = database.prepare("DELETE FROM cards WHERE id = ?");

  const run = database.transaction(() => {
    for (const group of dupGroups) {
      const rows = selectGroupCards.all(group.topic_id, group.question);
      // rows[0] is the survivor; delete the rest.
      for (let i = 1; i < rows.length; i++) {
        const loserId = rows[i].id;
        deleteReviewLog.run(loserId);
        deleteCardState.run(loserId);
        deleteCard.run(loserId);
      }
    }
  });

  run();
}

// Deduplicate topics by (subject_id, name) BEFORE the unique index is created.
// A re-import used to create duplicate topic rows (the `topics` table had no
// uniqueness guard), leaving empty phantom topics that polluted the planner. For
// each duplicate group we keep the survivor (most cards, then lowest id), move
// the losers' cards onto the survivor — dropping any that would collide with the
// uq_cards_topic_question index — then remove the losers' cycle rows and topic.
// Idempotent: on a clean DB the candidate query is empty and this is a no-op.
function migrateDedupeTopics(database) {
  const dupGroups = database
    .prepare(
      `SELECT subject_id, name
       FROM topics
       GROUP BY subject_id, name
       HAVING COUNT(*) > 1`
    )
    .all();

  if (dupGroups.length === 0) return;

  const groupTopics = database.prepare(
    `SELECT t.id AS id,
            (SELECT COUNT(*) FROM cards c WHERE c.topic_id = t.id) AS n
     FROM topics t
     WHERE t.subject_id = ? AND t.name = ?
     ORDER BY n DESC, t.id ASC`
  );
  const loserCards = database.prepare(
    "SELECT id, question FROM cards WHERE topic_id = ?"
  );
  const survivorHasQuestion = database.prepare(
    "SELECT 1 FROM cards WHERE topic_id = ? AND question = ?"
  );
  const moveCard = database.prepare("UPDATE cards SET topic_id = ? WHERE id = ?");
  const deleteReviewLog = database.prepare(
    "DELETE FROM review_log WHERE card_id = ?"
  );
  const deleteCardState = database.prepare(
    "DELETE FROM card_states WHERE card_id = ?"
  );
  const deleteCard = database.prepare("DELETE FROM cards WHERE id = ?");
  const deletePlan = database.prepare(
    "DELETE FROM daily_plan WHERE topic_id = ?"
  );
  const deleteSessions = database.prepare(
    "DELETE FROM topic_sessions WHERE topic_id = ?"
  );
  const deleteTopicStudy = database.prepare(
    "DELETE FROM topic_study WHERE topic_id = ?"
  );
  const deleteTopic = database.prepare("DELETE FROM topics WHERE id = ?");

  const run = database.transaction(() => {
    for (const g of dupGroups) {
      const rows = groupTopics.all(g.subject_id, g.name);
      const survivorId = rows[0].id; // most cards, then lowest id
      for (let i = 1; i < rows.length; i++) {
        const loserId = rows[i].id;
        for (const card of loserCards.all(loserId)) {
          if (survivorHasQuestion.get(survivorId, card.question)) {
            // Survivor already has this question — drop the loser's copy.
            deleteReviewLog.run(card.id);
            deleteCardState.run(card.id);
            deleteCard.run(card.id);
          } else {
            moveCard.run(survivorId, card.id);
          }
        }
        deletePlan.run(loserId);
        deleteSessions.run(loserId);
        deleteTopicStudy.run(loserId);
        deleteTopic.run(loserId);
      }
    }
  });

  run();
}

// Add the `suspended` flag to card_states if it is not already present.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we probe PRAGMA table_info first.
function migrateSuspendedColumn(database) {
  const cols = database.prepare("PRAGMA table_info(card_states)").all();
  const hasSuspended = cols.some((col) => col.name === "suspended");
  if (!hasSuspended) {
    database.exec(
      "ALTER TABLE card_states ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0"
    );
  }
}

// Add FSRS learning-step columns to card_states if not already present, then
// backfill the textual state from existing reps. These columns are written by
// lib/fsrs.ts (this module only provisions them):
//   - state:         new | learning | review | relearning
//   - learning_step: index into the (re)learning step ladder
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we probe PRAGMA table_info per
// column before each ALTER. The backfill is idempotent: it only promotes rows
// that are still 'new' but already have reps > 0 (i.e. pre-existing reviewed
// cards from before these columns existed); once promoted it never matches
// them again.
function migrateCardLearningColumns(database) {
  const cols = database.prepare("PRAGMA table_info(card_states)").all();
  const hasState = cols.some((col) => col.name === "state");
  const hasLearningStep = cols.some((col) => col.name === "learning_step");

  if (!hasState) {
    database.exec(
      "ALTER TABLE card_states ADD COLUMN state TEXT NOT NULL DEFAULT 'new'"
    );
  }
  if (!hasLearningStep) {
    database.exec(
      "ALTER TABLE card_states ADD COLUMN learning_step INTEGER NOT NULL DEFAULT 0"
    );
  }

  // Seed the state of cards that already had review history before the column
  // existed. Cards with reps = 0 correctly keep the 'new' default.
  database.exec(
    "UPDATE card_states SET state='review' WHERE reps > 0 AND state='new'"
  );
}

// Add the per-card pace column to topic_study if absent. min_per_card is an EMA
// of measured minutes-per-card for a topic (written by app/api/session/finish),
// used to estimate how long the topic's CURRENT due/new card load will take.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we probe PRAGMA table_info first.
function migrateTopicPaceColumn(database) {
  const cols = database.prepare("PRAGMA table_info(topic_study)").all();
  const hasMinPerCard = cols.some((col) => col.name === "min_per_card");
  if (!hasMinPerCard) {
    database.exec("ALTER TABLE topic_study ADD COLUMN min_per_card REAL");
  }
}

// Ensure topic_study has one row per topic. Runs on every init so that topics
// imported after the cycle schema was introduced are picked up automatically.
// INSERT OR IGNORE makes this a no-op for topics that already have a row, so it
// never duplicates rows or overwrites user-set priority/progress.
function backfillTopicStudy(database) {
  database.exec(
    "INSERT OR IGNORE INTO topic_study (topic_id) SELECT id FROM topics"
  );
}

function initFts(database) {
  // External-content FTS5 table over cards. unicode61 tokenizer with
  // remove_diacritics=2 so accented terms match regardless of accents.
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
      question,
      answer,
      bizu,
      tags,
      content='cards',
      content_rowid='id',
      tokenize="unicode61 remove_diacritics 2"
    );
  `);

  // Triggers to keep the FTS index in sync. For external-content tables the
  // delete/update triggers must insert the special 'delete' row.
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
      INSERT INTO cards_fts(rowid, question, answer, bizu, tags)
      VALUES (new.id, new.question, new.answer, new.bizu, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
      INSERT INTO cards_fts(cards_fts, rowid, question, answer, bizu, tags)
      VALUES ('delete', old.id, old.question, old.answer, old.bizu, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
      INSERT INTO cards_fts(cards_fts, rowid, question, answer, bizu, tags)
      VALUES ('delete', old.id, old.question, old.answer, old.bizu, old.tags);
      INSERT INTO cards_fts(rowid, question, answer, bizu, tags)
      VALUES (new.id, new.question, new.answer, new.bizu, new.tags);
    END;
  `);

  // Idempotent backfill: only populate when the FTS index is empty but cards
  // exist. NOTE: for an external-content FTS5 table, "SELECT COUNT(*) FROM
  // cards_fts" reflects the *content* table's row count, not the index's own
  // contents, so it cannot be used to detect an empty index. Instead we probe
  // the internal '%_data' shadow table: a freshly created (unpopulated) FTS5
  // index holds only its structural rows there, while a populated index holds
  // many more. When empty, we (re)build the index from the content table via
  // the authoritative 'rebuild' command.
  const dataRows = database
    .prepare("SELECT COUNT(*) AS c FROM cards_fts_data")
    .get().c;
  const cardsCount = database
    .prepare("SELECT COUNT(*) AS c FROM cards")
    .get().c;
  if (dataRows <= 2 && cardsCount > 0) {
    database
      .prepare("INSERT INTO cards_fts(cards_fts) VALUES ('rebuild')")
      .run();
  }
}

module.exports = { getDb };
