// Relatório de cobertura entre o ciclo de estudos e os baralhos de flashcards.
//
// Responde a duas perguntas, que são diferentes e igualmente importantes:
//   1. Todo assunto do ciclo alcança cards?  (senão, você estuda no escuro)
//   2. Todo card é alcançável pelo ciclo?    (senão, você comprou card que nunca vai revisar)
//
// Uso:
//   npm run cobertura            -- lê o ciclo real do Neon
//   npm run cobertura -- --local -- lê de um arquivo de backup exportado pelo app
//   npm run cobertura -- --ci    -- sai com código 1 se a cobertura de cards < META
//
// A META existe para que "100%" seja um número verificável, não uma impressão.

import { readFileSync } from "node:fs";
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

const META_CARDS = 100; // porcentagem de cards que devem ser alcançáveis

type DeckTopic = { id: number; name: string; cardCount?: number };
type DeckIndex = { subjects: { id: number; name: string; topics: DeckTopic[] }[] };
type CycleState = {
  studyPlans: { id: string }[];
  subjects: { id: string; name: string; study_plan_id: string }[];
  topics: {
    id: string;
    subject_id: string;
    name: string;
    status?: "active" | "suspended";
    active?: boolean;
  }[];
  topicTombstones?: { subject_name: string; deck_unit_key: string; last_name: string }[];
};

async function loadCycle(): Promise<CycleState> {
  const fileArg = process.argv.indexOf("--local");
  if (fileArg !== -1) {
    const path = process.argv[fileArg + 1];
    if (!path) throw new Error("--local exige o caminho do arquivo de backup");
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return (parsed.ciclo?.db ?? parsed) as CycleState;
  }
  const { queryOne, closePool } = await import("../lib/db");
  const row = await queryOne<{ data: CycleState }>(
    `SELECT data FROM cycle_state WHERE id = 1`
  );
  await closePool();
  if (!row) throw new Error("Nenhum ciclo salvo na nuvem ainda (cycle_state vazia).");
  return row.data;
}

async function main() {
  const { matchTopicDecks, normalize, resolveSubjectName } = await import("../lib/subjectMatch");
  const index = JSON.parse(
    readFileSync(join(root, "public", "data", "index.json"), "utf8")
  ) as DeckIndex;
  const cycle = await loadCycle();

  const plan = cycle.studyPlans[0];
  const subjects = cycle.subjects.filter((s) => s.study_plan_id === plan.id);
  const deckNames = index.subjects.map((s) => s.name);
  const cardsOf = new Map<number, number>();
  for (const s of index.subjects) {
    for (const t of s.topics) cardsOf.set(t.id, t.cardCount ?? 0);
  }

  // Direção 1: assunto do ciclo -> baralhos
  const owners = new Map<number, string[]>();
  // Baralhos que só um assunto PAUSADO reivindica: dispensados por escolha.
  const pausados = new Map<number, string>();
  const semCards: string[] = [];
  let comCards = 0;

  console.log("ASSUNTOS DO CICLO -> BARALHOS\n");
  for (const sub of subjects) {
    const deckName = resolveSubjectName(sub.name, deckNames);
    const deck = deckName ? index.subjects.find((s) => s.name === deckName) : null;
    const doAssunto = cycle.topics.filter((t) => t.subject_id === sub.id);
    const emEscopo = (t: (typeof doAssunto)[number]) =>
      t.status ? t.status === "active" : t.active !== false;
    const topics = doAssunto.filter(emEscopo);
    let ok = 0;

    for (const t of doAssunto) {
      const matched = deck ? matchTopicDecks(t.name, deck.topics) : [];

      if (!emEscopo(t)) {
        // Pausado: os baralhos dele saem da conta, mas não são defeito.
        for (const d of matched) pausados.set(d.id, `${sub.name} › ${t.name}`);
        continue;
      }

      if (matched.length === 0) {
        semCards.push(`${sub.name} › ${t.name}`);
        continue;
      }
      ok++;
      comCards++;
      for (const d of matched) {
        const list = owners.get(d.id) ?? [];
        list.push(`${sub.name} › ${t.name}`);
        owners.set(d.id, list);
      }
    }

    const marca = deckName ? (ok === topics.length ? "ok " : "!! ") : "-- ";
    console.log(
      `  ${marca}${sub.name.padEnd(28)} ${(deckName ?? "sem baralho").padEnd(26)} ${ok}/${topics.length}`
    );
  }

  // Direção 2: baralho -> assuntos do ciclo
  //
  // TRÊS categorias, não duas. Um baralho sem dono porque o usuário excluiu ou
  // pausou o assunto é uma decisão, não um defeito — e só o defeito pode
  // derrubar o `--ci`. Sem essa distinção o portão vira ruído e acaba
  // desligado, que é o pior desfecho possível.
  const lapides = new Set(
    (cycle.topicTombstones ?? []).map((l) => `${l.subject_name}::${l.deck_unit_key}`)
  );
  const moduloDe = (nome: string) =>
    normalize(nome.includes(">") ? nome.split(">")[0] : nome);

  let decks = 0;
  let cards = 0;
  let orfaosDecks = 0;
  let orfaosCards = 0;
  let dispensadosDecks = 0;
  let dispensadosCards = 0;
  let ambiguos = 0;
  const porDisciplina = new Map<string, { decks: number; cards: number; exemplos: string[] }>();

  for (const s of index.subjects) {
    for (const t of s.topics) {
      decks++;
      const n = cardsOf.get(t.id) ?? 0;
      cards += n;
      const donos = owners.get(t.id);
      if (!donos || donos.length === 0) {
        const excluido = lapides.has(`${s.name}::${moduloDe(t.name)}`);
        const pausado = pausados.has(t.id);
        if (excluido || pausado) {
          dispensadosDecks++;
          dispensadosCards += n;
          continue;
        }
        orfaosDecks++;
        orfaosCards += n;
        const bucket = porDisciplina.get(s.name) ?? { decks: 0, cards: 0, exemplos: [] };
        bucket.decks++;
        bucket.cards += n;
        if (bucket.exemplos.length < 5) bucket.exemplos.push(t.name.slice(0, 72));
        porDisciplina.set(s.name, bucket);
      } else if (new Set(donos).size > 1) {
        ambiguos++;
      }
    }
  }

  // O denominador exclui o que foi dispensado por escolha: cobrar 100% de algo
  // que o usuário mandou tirar do ciclo seria cobrar o impossível.
  const decksEmJogo = decks - dispensadosDecks;
  const cardsEmJogo = cards - dispensadosCards;
  const pctDecks = decksEmJogo === 0 ? 100 : Math.round(((decksEmJogo - orfaosDecks) / decksEmJogo) * 1000) / 10;
  const pctCards = cardsEmJogo === 0 ? 100 : Math.round(((cardsEmJogo - orfaosCards) / cardsEmJogo) * 1000) / 10;

  console.log("\nBARALHOS -> ASSUNTOS DO CICLO\n");
  console.log(`  baralhos alcançáveis  ${decksEmJogo - orfaosDecks}/${decksEmJogo}  (${pctDecks}%)`);
  console.log(`  cards alcançáveis     ${cardsEmJogo - orfaosCards}/${cardsEmJogo}  (${pctCards}%)`);
  if (dispensadosDecks > 0) {
    console.log(
      `  dispensados por escolha: ${dispensadosDecks} baralhos · ${dispensadosCards} cards (assunto excluído ou pausado)`
    );
  }
  console.log(`  baralhos disputados por mais de um assunto: ${ambiguos}`);

  if (porDisciplina.size > 0) {
    console.log("\n  órfãos por disciplina:");
    for (const [nome, b] of [...porDisciplina].sort((a, c) => c[1].cards - a[1].cards)) {
      console.log(`    ${nome.padEnd(28)} ${String(b.decks).padStart(3)} baralhos · ${String(b.cards).padStart(5)} cards`);
      for (const e of b.exemplos) console.log(`        ${e}`);
    }
  }

  if (semCards.length > 0) {
    console.log(`\n  assuntos do ciclo sem nenhum card (${semCards.length}):`);
    for (const t of semCards) console.log(`    ${t}`);
  }

  console.log(
    `\nRESUMO  ${comCards}/${comCards + semCards.length} assuntos com cards · ${pctCards}% dos cards alcançáveis`
  );

  if (process.argv.includes("--ci") && pctCards < META_CARDS) {
    console.error(
      `\nFALHOU: ${orfaosCards} cards inalcançáveis (${pctCards}% < meta de ${META_CARDS}%).`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
