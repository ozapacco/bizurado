import fs from "fs";
import path from "path";

/**
 * Load .env.local into process.env for LOCAL CLI scripts (db:init, seed).
 *
 * In production (Vercel) the platform injects env vars and DATABASE_URL is
 * already present, so this is a no-op there. Next.js itself loads .env.local
 * for the dev server / build, so app routes don't need this — only standalone
 * `tsx`/`node` scripts do. Keeps us from adding a dotenv dependency.
 */
export function loadLocalEnv(): void {
  if (process.env.DATABASE_URL) return;
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
