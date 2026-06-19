import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

async function main() {
  const { initSchema } = await import("../lib/schema");
  const { query } = await import("../lib/db");

  await initSchema();

  const tables = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log("Schema aplicado. Tabelas:");
  for (const t of tables) console.log("  -", t.table_name);

  process.exit(0);
}

main().catch((e) => {
  console.error("Falha ao inicializar o schema:", e);
  process.exit(1);
});
