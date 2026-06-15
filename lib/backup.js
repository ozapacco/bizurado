const fs = require("fs");
const path = require("path");
const { getDb } = require("./database.js");

// Keep the most recent N backups; older ones are pruned automatically.
const MAX_BACKUPS = 20;

function backupsDir() {
  return path.join(process.cwd(), "data", "backups");
}

function dbPath() {
  return path.join(process.cwd(), "data", "bizurado-v2.db");
}

/**
 * Create a timestamped, WAL-consistent copy of the database under
 * data/backups/. Returns the backup path, or null if there is no database to
 * back up yet. `reason` is appended to the filename (e.g. "pre-import",
 * "manual") so a glance at the folder explains why each snapshot exists.
 */
function backupDatabase(reason = "manual") {
  const src = dbPath();
  if (!fs.existsSync(src)) return null;

  const dir = backupsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Flush the WAL into the main .db file so a plain copy is fully consistent.
  try {
    getDb().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // If the db can't be checkpointed for some reason, still copy as-is.
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19); // YYYY-MM-DD_HH-MM-SS
  const safeReason =
    String(reason).replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "manual";
  const dest = path.join(dir, `bizurado-v2-${stamp}-${safeReason}.db`);

  fs.copyFileSync(src, dest);
  pruneOldBackups(dir);
  return dest;
}

function pruneOldBackups(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return;
  }
  const backups = files
    .filter((f) => f.startsWith("bizurado-v2-") && f.endsWith(".db"))
    .sort(); // ISO timestamp embedded in the name sorts chronologically
  while (backups.length > MAX_BACKUPS) {
    const oldest = backups.shift();
    try {
      fs.unlinkSync(path.join(dir, oldest));
    } catch {
      /* ignore */
    }
  }
}

module.exports = { backupDatabase, MAX_BACKUPS };

// CLI: `node lib/backup.js` (npm run backup) -> make a manual snapshot now.
if (require.main === module) {
  const dest = backupDatabase("manual");
  if (dest) {
    console.log(`Backup criado: ${path.relative(process.cwd(), dest)}`);
  } else {
    console.log("Nenhum banco para backup ainda (data/bizurado-v2.db não existe).");
  }
}
