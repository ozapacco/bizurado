"use client";

// Engine local-first: replica a lógica das rotas /api no navegador.
// Conteúdo vem dos JSONs estáticos (public/data); estado vive no IndexedDB.
import {
  createInitialState,
  schedule,
  type CardState,
  type Rating,
} from "@/lib/fsrs";
import { graduate } from "@/lib/cycle";
import {
  get,
  getAll,
  getAllByIndex,
  put,
  putMany,
  clearStore,
  type LogEvent,
  type StoredState,
  type TopicStudy,
} from "./idb";

const MATURE_DAYS = 21;

export type IndexTopic = { id: number; name: string; order: number; cardCount: number };
export type IndexSubject = { id: number; name: string; topics: IndexTopic[] };
export type ContentIndex = { generatedAt: string; subjects: IndexSubject[] };

export type DeckCard = {
  id: number;
  question: string;
  answer: string;
  bizu: string;
  source: string;
  tags: string;
  cardType: string;
  subjectName: string;
  topicId: number;
  topicName: string;
  subjectId: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  mode: "rapido" | "normal";
};

let indexCache: ContentIndex | null = null;

export async function getIndex(): Promise<ContentIndex> {
  if (!indexCache) {
    const res = await fetch("/data/index.json");
    indexCache = (await res.json()) as ContentIndex;
  }
  return indexCache;
}

// Início do PRÓXIMO dia local em ISO — mesmo corte de /api (lib/day).
function startOfNextDayISO(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function storedToCardState(s: StoredState): CardState {
  return {
    stability: s.stability,
    difficulty: s.difficulty,
    due: s.due,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    last_review: s.lastReview,
    state: s.state,
    learning_step: s.learningStep,
  };
}

function cardStateToStored(cardId: number, topicId: number, c: CardState, suspended = 0): StoredState {
  return {
    cardId,
    topicId,
    stability: c.stability,
    difficulty: c.difficulty,
    due: c.due,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: c.last_review,
    state: c.state,
    learningStep: c.learning_step,
    suspended,
  };
}

// Importa o snapshot exportado do Neon (uma vez, no primeiro uso).
export async function ensureSeeded(): Promise<void> {
  const done = await get<boolean>("meta", "seeded");
  if (done) return;
  try {
    const res = await fetch("/data/progress-seed.json");
    if (res.ok) {
      const seed = (await res.json()) as {
        states: StoredState[];
        log: LogEvent[];
        voltas: TopicStudy[];
      };
      await putMany("states", seed.states);
      await putMany("log", seed.log);
      await putMany("topics", seed.voltas);
    }
  } catch {
    /* sem seed: começa do zero */
  }
  await put("meta", true, "seeded");
}

export async function loadDeck(topicId: number): Promise<{
  deck: { topicId: number; topicName: string; subjectName: string; subjectId: number; voltas: number; total: number };
  cards: DeckCard[];
}> {
  await ensureSeeded();
  const res = await fetch(`/data/decks/${topicId}.json`);
  if (!res.ok) throw new Error("Baralho não encontrado.");
  const raw = (await res.json()) as {
    topicId: number;
    topicName: string;
    subjectId: number;
    subjectName: string;
    cards: Omit<DeckCard, "subjectName" | "topicName" | "stability" | "difficulty" | "scheduledDays" | "reps" | "lapses" | "state" | "mode">[];
  };

  const states = await getAllByIndex<StoredState>("states", "topicId", topicId);
  const byCard = new Map(states.map((s) => [s.cardId, s]));
  const ts = await get<TopicStudy>("topics", topicId);
  const boundary = startOfNextDayISO();

  const cards: DeckCard[] = raw.cards
    .filter((c) => (byCard.get(c.id)?.suspended ?? 0) === 0)
    .map((c) => {
      const s = byCard.get(c.id);
      const reps = s?.reps ?? 0;
      const scheduledDays = s?.scheduledDays ?? 0;
      const due = s?.due ?? "";
      const rapido = reps > 0 && scheduledDays >= MATURE_DAYS && due >= boundary;
      return {
        ...c,
        subjectName: raw.subjectName,
        topicName: raw.topicName,
        subjectId: raw.subjectId,
        topicId: raw.topicId,
        stability: s?.stability ?? 0,
        difficulty: s?.difficulty ?? 0,
        scheduledDays,
        reps,
        lapses: s?.lapses ?? 0,
        state: s?.state ?? "new",
        mode: rapido ? "rapido" : "normal",
      };
    });

  return {
    deck: {
      topicId: raw.topicId,
      topicName: raw.topicName,
      subjectId: raw.subjectId,
      subjectName: raw.subjectName,
      voltas: ts?.voltas ?? 0,
      total: cards.length,
    },
    cards,
  };
}

export async function loadReviewCards(opts: {
  subjectId?: string;
  topicId?: string;
  mode?: string; // "due" | "all" | "new"
  limit?: number;
}): Promise<{ cards: DeckCard[] }> {
  await ensureSeeded();
  const states = await getAll<StoredState>("states");
  const boundary = startOfNextDayISO();
  const mode = opts.mode || "due";
  const limit = opts.limit || 30;

  const [index] = await Promise.all([getIndex()]);
  const subjectsMap = new Map(index.subjects.map((s) => [String(s.id), s]));
  const topicsMap = new Map(
    index.subjects.flatMap((s) => s.topics.map((t) => [String(t.id), t]))
  );

  let filtered = states.filter((s) => s.suspended === 0);

  if (opts.topicId) {
    filtered = filtered.filter((s) => String(s.topicId) === opts.topicId);
  } else if (opts.subjectId) {
    const s = subjectsMap.get(opts.subjectId) || index.subjects.find(s => s.name === opts.subjectId);
    if (s) {
      const topicIds = new Set(s.topics.map((t) => t.id));
      filtered = filtered.filter((s) => topicIds.has(s.topicId));
    }
  }

  if (mode === "due") {
    filtered = filtered.filter((s) => s.due < boundary && s.reps > 0);
  } else if (mode === "new") {
    filtered = filtered.filter((s) => s.reps === 0);
  }

  // FSRS always schedules due dates, we sort by due ascending
  filtered.sort((a, b) => (a.due < b.due ? -1 : 1));
  filtered = filtered.slice(0, limit);

  if (filtered.length === 0) return { cards: [] };

  const topicsToFetch = [...new Set(filtered.map((s) => s.topicId))];
  const fetchedDecks = await Promise.all(
    topicsToFetch.map(async (tId) => {
      try {
        const res = await fetch(`/data/decks/${tId}.json`);
        if (!res.ok) return null;
        return (await res.json()) as {
          topicId: number;
          topicName: string;
          subjectId: number;
          subjectName: string;
          cards: any[];
        };
      } catch {
        return null;
      }
    })
  );

  const deckMap = new Map();
  for (const d of fetchedDecks) {
    if (d) deckMap.set(d.topicId, d);
  }

  const cards: DeckCard[] = [];
  for (const s of filtered) {
    const deck = deckMap.get(s.topicId);
    if (!deck) continue;
    const c = deck.cards.find((c: any) => c.id === s.cardId);
    if (!c) continue;

    const reps = s.reps;
    const scheduledDays = s.scheduledDays;
    const due = s.due;
    const rapido = reps > 0 && scheduledDays >= MATURE_DAYS && due >= boundary;

    cards.push({
      ...c,
      subjectName: deck.subjectName,
      topicName: deck.topicName,
      subjectId: deck.subjectId,
      topicId: deck.topicId,
      stability: s.stability,
      difficulty: s.difficulty,
      scheduledDays,
      reps,
      lapses: s.lapses,
      state: s.state,
      mode: rapido ? "rapido" : "normal",
    });
  }

  return { cards };
}


// Avalia um card: FSRS + log append-only + fila de sync.
export async function rateCard(
  card: { id: number; topicId: number; subjectId: number },
  rating: Rating
): Promise<void> {
  const now = new Date();
  const stored = await get<StoredState>("states", card.id);
  const prev = stored ? storedToCardState(stored) : createInitialState(now);
  const next = schedule(prev, rating, now);
  await put("states", cardStateToStored(card.id, card.topicId, next, stored?.suspended ?? 0));
  const event: LogEvent = {
    cardId: card.id,
    topicId: card.topicId,
    subjectId: card.subjectId,
    rating,
    reviewDate: now.toISOString(),
  };
  await put("log", event);
  await put("queue", { type: "review", ...event, state: next });
}

export async function suspendCard(cardId: number, topicId: number): Promise<void> {
  const stored = await get<StoredState>("states", cardId);
  const base = stored ?? cardStateToStored(cardId, topicId, createInitialState());
  await put("states", { ...base, suspended: 1 });
  await put("queue", { type: "suspend", cardId, topicId });
}

// Fecha a volta: study_count+1, janela expansiva, status. (port de session/finish)
export async function finishVolta(topicId: number): Promise<TopicStudy> {
  const ts =
    (await get<TopicStudy>("topics", topicId)) ??
    ({
      topicId,
      priority: 3,
      voltas: 0,
      intervalDays: 0,
      due: null,
      lastStudied: null,
      avgMinutes: null,
      minPerCard: null,
      status: "new",
    } as TopicStudy);
  const g = graduate({
    study_count: ts.voltas,
    interval_days: ts.intervalDays,
    priority: ts.priority,
  });
  const next: TopicStudy = {
    ...ts,
    voltas: g.study_count,
    intervalDays: g.interval_days,
    status: g.status,
    due: g.dueDayStr,
    lastStudied: new Date().toISOString(),
  };
  await put("topics", next);
  await put("queue", { type: "volta", ...next });
  return next;
}

// Rotação da Trilha (port de /api/cycle/next): disciplina em Camada 1 estudada
// há mais tempo primeiro; dentro dela, tópico pendente de maior prioridade.
export async function nextDeck(excludeTopicId?: number): Promise<{
  topicId: number;
  topicName: string;
  subjectName: string;
  priority: number;
  novos: number;
} | null> {
  await ensureSeeded();
  const [index, states, log, topicStudies] = await Promise.all([
    getIndex(),
    getAll<StoredState>("states"),
    getAll<LogEvent>("log"),
    getAll<TopicStudy>("topics"),
  ]);

  // cards tocados (reps>0) ou suspensos por tópico
  const touched = new Map<number, number>();
  for (const s of states) {
    if (s.reps > 0 || s.suspended === 1) {
      touched.set(s.topicId, (touched.get(s.topicId) ?? 0) + 1);
    }
  }
  const prio = new Map(topicStudies.map((t) => [t.topicId, t.priority]));

  // última revisão por disciplina
  const subjLast = new Map<number, string>();
  for (const e of log) {
    const cur = subjLast.get(e.subjectId);
    if (cur === undefined || e.reviewDate > cur) subjLast.set(e.subjectId, e.reviewDate);
  }

  type Cand = {
    topicId: number;
    topicName: string;
    subjectId: number;
    subjectName: string;
    priority: number;
    order: number;
    novos: number;
  };
  const cands: Cand[] = [];
  for (const s of index.subjects) {
    for (const t of s.topics) {
      if (t.id === excludeTopicId) continue;
      const novos = t.cardCount - (touched.get(t.id) ?? 0);
      if (novos > 0) {
        cands.push({
          topicId: t.id,
          topicName: t.name,
          subjectId: s.id,
          subjectName: s.name,
          priority: prio.get(t.id) ?? 3,
          order: t.order,
          novos,
        });
      }
    }
  }
  if (cands.length === 0) return null;

  // disciplina recém-fechada vai para o fim da fila
  const SENTINEL = "9999-12-31T23:59:59Z";
  let excludedSubject: number | null = null;
  if (excludeTopicId) {
    for (const s of index.subjects) {
      if (s.topics.some((t) => t.id === excludeTopicId)) excludedSubject = s.id;
    }
  }
  const subjectsInPlay = [...new Set(cands.map((c) => c.subjectId))];
  const lastOf = (id: number) =>
    id === excludedSubject ? SENTINEL : subjLast.get(id) ?? "";
  subjectsInPlay.sort((a, b) => {
    const la = lastOf(a);
    const lb = lastOf(b);
    if (la !== lb) return la < lb ? -1 : 1;
    return a - b;
  });

  const winner = subjectsInPlay[0];
  const topic = cands
    .filter((c) => c.subjectId === winner)
    .sort((a, b) => b.priority - a.priority || a.order - b.order || a.topicId - b.topicId)[0];

  return {
    topicId: topic.topicId,
    topicName: topic.topicName,
    subjectName: topic.subjectName,
    priority: topic.priority,
    novos: topic.novos,
  };
}

// ==============================================================================
// Ciclo (Trilha do Aprovado)
// ==============================================================================

export type Pointer = {
  subjectId: number;
  subjectName: string;
  topicId: number;
  topicName: string;
  camada: number;
  priority: number;
  novos: number;
} | null;

export type TopicOut = {
  id: number;
  name: string;
  priority: number;
  total: number;
  novos: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  estado: "novo" | "andamento" | "dominado";
};

export type SubjectOut = {
  id: number;
  name: string;
  camada: 1 | 2 | 3;
  total: number;
  novos: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  progressPct: number;
  prioridadeMedia: number;
  lastStudied: string | null;
  topics: TopicOut[];
};

export type CycleData = {
  dueTotal: number;
  agora: Pointer;
  depois: Pointer;
  subjects: SubjectOut[];
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export async function getCycleData(): Promise<CycleData> {
  await ensureSeeded();
  const [index, states, log, topicStudies] = await Promise.all([
    getIndex(),
    getAll<StoredState>("states"),
    getAll<LogEvent>("log"),
    getAll<TopicStudy>("topics"),
  ]);

  const boundary = startOfNextDayISO();
  const DOMINIO_C3 = 80;

  // Aggregations per topic
  const touchedCount = new Map<number, number>(); // reps > 0 or suspended=1
  const dominioCount = new Map<number, number>(); // scheduledDays >= MATURE_DAYS or suspended=1
  const dueCount = new Map<number, number>();     // reps > 0 and due < boundary and suspended=0

  for (const s of states) {
    const isTouched = s.reps > 0 || s.suspended === 1;
    const isDominio = s.scheduledDays >= MATURE_DAYS || s.suspended === 1;
    const isDue = s.reps > 0 && s.due < boundary && s.suspended === 0;

    if (isTouched) touchedCount.set(s.topicId, (touchedCount.get(s.topicId) ?? 0) + 1);
    if (isDominio) dominioCount.set(s.topicId, (dominioCount.get(s.topicId) ?? 0) + 1);
    if (isDue) dueCount.set(s.topicId, (dueCount.get(s.topicId) ?? 0) + 1);
  }

  const prioMap = new Map(topicStudies.map((t) => [t.topicId, t.priority]));

  const lastBySubject = new Map<number, string>();
  for (const e of log) {
    const cur = lastBySubject.get(e.subjectId);
    if (!cur || e.reviewDate > cur) lastBySubject.set(e.subjectId, e.reviewDate);
  }

  const subjectsMap = new Map<number, SubjectOut>();

  for (const subj of index.subjects) {
    let sOut = subjectsMap.get(subj.id);
    if (!sOut) {
      sOut = {
        id: subj.id,
        name: subj.name,
        camada: 1,
        total: 0,
        novos: 0,
        dueNow: 0,
        coberturaPct: 0,
        dominioPct: 0,
        progressPct: 0,
        prioridadeMedia: 0,
        lastStudied: lastBySubject.get(subj.id) ?? null,
        topics: [],
      };
      subjectsMap.set(subj.id, sOut);
    }

    for (const t of subj.topics) {
      const total = t.cardCount;
      const touched = touchedCount.get(t.id) ?? 0;
      const novos = Math.max(0, total - touched);
      const dominio = dominioCount.get(t.id) ?? 0;
      const dueNow = dueCount.get(t.id) ?? 0;
      const priority = prioMap.get(t.id) ?? 3;

      const coberturaPct = pct(total - novos, total);
      const dominioPct = pct(dominio, total);
      
      let estado: "novo" | "andamento" | "dominado" = "novo";
      if (novos === 0) estado = "dominado";
      else if (coberturaPct > 0) estado = "andamento";

      sOut.topics.push({
        id: t.id,
        name: t.name,
        priority,
        total,
        novos,
        dueNow,
        coberturaPct,
        dominioPct,
        estado: novos > 0 && coberturaPct === 0 ? "novo" : estado,
      });

      sOut.total += total;
      sOut.novos += novos;
      sOut.dueNow += dueNow;
    }
  }

  const subjects: SubjectOut[] = [];
  for (const subj of subjectsMap.values()) {
    let dominioCards = 0;
    let prioSum = 0;
    
    for (const t of subj.topics) {
      dominioCards += Math.round((t.dominioPct * t.total) / 100);
      prioSum += t.priority;
    }

    subj.coberturaPct = pct(subj.total - subj.novos, subj.total);
    subj.dominioPct = pct(dominioCards, subj.total);
    subj.prioridadeMedia = subj.topics.length > 0 ? Math.round((prioSum / subj.topics.length) * 10) / 10 : 3;

    if (subj.novos > 0) subj.camada = 1;
    else if (subj.dominioPct < DOMINIO_C3) subj.camada = 2;
    else subj.camada = 3;

    subj.progressPct = subj.camada === 1 ? subj.coberturaPct : subj.dominioPct;
    subjects.push(subj);
  }

  // Pointer de AVANÇO (Fluxo B)
  const rotation = subjects
    .filter((s) => s.novos > 0)
    .sort((a, b) => {
      const la = a.lastStudied ?? "";
      const lb = b.lastStudied ?? "";
      if (la !== lb) return la < lb ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const pickTopic = (s: SubjectOut) =>
    s.topics
      .filter((t) => t.novos > 0)
      .sort((a, b) => b.priority - a.priority || a.id - b.id)[0];

  const toPointer = (s: SubjectOut | undefined): Pointer => {
    if (!s) return null;
    const t = pickTopic(s);
    if (!t) return null;
    return {
      subjectId: s.id,
      subjectName: s.name,
      topicId: t.id,
      topicName: t.name,
      camada: s.camada,
      priority: t.priority,
      novos: t.novos,
    };
  };

  const agora = toPointer(rotation[0]);
  const depois = toPointer(rotation[1]);

  const dueTotal = subjects.reduce((sum, s) => sum + s.dueNow, 0);

  subjects.sort(
    (a, b) => a.camada - b.camada || b.progressPct - a.progressPct || a.name.localeCompare(b.name)
  );

  return { dueTotal, agora, depois, subjects };
}

export async function setTopicPriorityLocal(topicId: number, priority: number): Promise<void> {
  const ts = await get<TopicStudy>("topics", topicId) ?? ({
    topicId,
    priority: 3,
    voltas: 0,
    intervalDays: 0,
    due: null,
    lastStudied: null,
    avgMinutes: null,
    minPerCard: null,
    status: "new",
  } as TopicStudy);

  const next = { ...ts, priority };
  await put("topics", next);
  await put("queue", { type: "topicPriority", topicId, priority });
}

export async function setSubjectPriorityLocal(subjectId: number, priority: number): Promise<void> {
  const index = await getIndex();
  const subj = index.subjects.find(s => s.id === subjectId);
  if (!subj) return;
  for (const t of subj.topics) {
    await setTopicPriorityLocal(t.id, priority);
  }
}

// ==============================================================================
// Progresso
// ==============================================================================

export type TopicProgress = {
  id: number;
  name: string;
  total: number;
  novos: number;
  vistos: number;
  jovens: number;
  maduros: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  acertoPct: number | null;
  ultimoEstudo: string | null;
  jaEstudouTudo: boolean;
};

export type SubjectProgress = {
  id: number;
  name: string;
  total: number;
  novos: number;
  vistos: number;
  jovens: number;
  maduros: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  acertoPct: number | null;
  ultimoEstudo: string | null;
  jaEstudouTudo: boolean;
  topics: TopicProgress[];
};

export async function getProgressData(): Promise<{ subjects: SubjectProgress[] }> {
  await ensureSeeded();
  const [index, states, log] = await Promise.all([
    getIndex(),
    getAll<StoredState>("states"),
    getAll<LogEvent>("log"),
  ]);

  const dueBoundary = startOfNextDayISO();

  const counts = new Map<number, {
    vistos: number;
    jovens: number;
    maduros: number;
    dueNow: number;
  }>();

  for (const s of states) {
    const isVisto = s.reps > 0;
    const isJovem = s.reps > 0 && s.scheduledDays < MATURE_DAYS;
    const isMaduro = s.scheduledDays >= MATURE_DAYS;
    const isDue = s.due !== null && s.due < dueBoundary && s.suspended === 0;

    const cur = counts.get(s.topicId) ?? { vistos: 0, jovens: 0, maduros: 0, dueNow: 0 };
    if (isVisto) cur.vistos++;
    if (isJovem) cur.jovens++;
    if (isMaduro) cur.maduros++;
    if (isDue) cur.dueNow++;
    counts.set(s.topicId, cur);
  }

  const accByTopic = new Map<number, {
    totalRevs: number;
    goodRevs: number;
    ultimoEstudo: string;
  }>();

  for (const e of log) {
    const cur = accByTopic.get(e.topicId) ?? { totalRevs: 0, goodRevs: 0, ultimoEstudo: "" };
    cur.totalRevs++;
    if (e.rating >= 3) cur.goodRevs++;
    if (e.reviewDate > cur.ultimoEstudo) cur.ultimoEstudo = e.reviewDate;
    accByTopic.set(e.topicId, cur);
  }

  const subjects: SubjectProgress[] = [];

  for (const s of index.subjects) {
    const subj: SubjectProgress = {
      id: s.id,
      name: s.name,
      total: 0,
      novos: 0,
      vistos: 0,
      jovens: 0,
      maduros: 0,
      dueNow: 0,
      coberturaPct: 0,
      dominioPct: 0,
      acertoPct: null,
      ultimoEstudo: null,
      jaEstudouTudo: false,
      topics: [],
    };

    let sGoodRevs = 0;
    let sTotalRevs = 0;

    for (const t of s.topics) {
      const c = counts.get(t.id) ?? { vistos: 0, jovens: 0, maduros: 0, dueNow: 0 };
      const acc = accByTopic.get(t.id);

      const total = t.cardCount;
      const vistos = c.vistos;
      const novos = Math.max(0, total - vistos);
      const jovens = c.jovens;
      const maduros = c.maduros;
      const dueNow = c.dueNow;

      const acertoPct = acc && acc.totalRevs > 0 ? pct(acc.goodRevs, acc.totalRevs) : null;
      const ultimoEstudo = acc?.ultimoEstudo || null;

      subj.topics.push({
        id: t.id,
        name: t.name,
        total,
        novos,
        vistos,
        jovens,
        maduros,
        dueNow,
        coberturaPct: pct(vistos, total),
        dominioPct: pct(maduros, total),
        acertoPct,
        ultimoEstudo,
        jaEstudouTudo: total > 0 && novos === 0,
      });

      subj.total += total;
      subj.novos += novos;
      subj.vistos += vistos;
      subj.jovens += jovens;
      subj.maduros += maduros;
      subj.dueNow += dueNow;
      
      if (acc) {
        sGoodRevs += acc.goodRevs;
        sTotalRevs += acc.totalRevs;
        if (ultimoEstudo && (!subj.ultimoEstudo || ultimoEstudo > subj.ultimoEstudo)) {
          subj.ultimoEstudo = ultimoEstudo;
        }
      }
    }

    if (subj.total > 0) {
      subj.coberturaPct = pct(subj.vistos, subj.total);
      subj.dominioPct = pct(subj.maduros, subj.total);
      subj.acertoPct = sTotalRevs > 0 ? pct(sGoodRevs, sTotalRevs) : null;
      subj.jaEstudouTudo = subj.total > 0 && subj.novos === 0;
      subjects.push(subj);
    }
  }

  return { subjects };
}

// ==============================================================================
// Estatísticas
// ==============================================================================

export async function getStatsData() {
  await ensureSeeded();
  const [index, states, log] = await Promise.all([
    getIndex(),
    getAll<StoredState>("states"),
    getAll<LogEvent>("log"),
  ]);

  const totalCards = index.subjects.reduce(
    (sum, s) => sum + s.topics.reduce((tsum, t) => tsum + t.cardCount, 0),
    0
  );

  const todayIso = startOfTodayISO();
  const nextDayIso = startOfNextDayISO();

  const reviewedTodaySet = new Set<number>();
  for (const e of log) {
    if (e.reviewDate >= todayIso) {
      reviewedTodaySet.add(e.cardId);
    }
  }
  const reviewedToday = reviewedTodaySet.size;

  let dueToday = 0;
  for (const s of states) {
    if (s.due !== null && s.due < nextDayIso && s.suspended === 0) {
      dueToday++;
    }
  }

  const subjects = index.subjects.map(s => ({
    name: s.name,
    cardCount: s.topics.reduce((sum, t) => sum + t.cardCount, 0)
  }));

  const reviewDaySet = new Set<string>();
  for (const e of log) {
    if (!e.reviewDate) continue;
    const iso = e.reviewDate.includes("T") ? e.reviewDate : e.reviewDate.replace(" ", "T") + "Z";
    const d = new Date(iso);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    reviewDaySet.add(day);
  }

  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 1000; i++) {
    const cursor = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (reviewDaySet.has(day)) {
      streak++;
    } else {
      if (i === 0) continue; // It's okay if today is not studied yet, streak continues from yesterday
      break;
    }
  }

  let accuracy = 0;
  if (log.length > 0) {
    const good = log.filter((e) => e.rating >= 3).length;
    accuracy = Math.round((good / log.length) * 100);
  }

  return {
    totalCards,
    reviewedToday,
    dueToday,
    streak,
    accuracy,
    subjects,
  };
}

export async function getStatsHistory() {
  await ensureSeeded();
  const log = await getAll<LogEvent>("log");

  const cutoffDate = new Date(Date.now() - 14 * 86400000).toISOString();
  
  const historyMap = new Map<string, number>();
  for (const e of log) {
    if (e.reviewDate >= cutoffDate) {
      const dateStr = e.reviewDate.substring(0, 10);
      historyMap.set(dateStr, (historyMap.get(dateStr) ?? 0) + 1);
    }
  }

  const filled: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    filled.push({
      date: dateStr.slice(5),
      count: historyMap.get(dateStr) ?? 0,
    });
  }

  return { history: filled };
}

export async function getStatsDifficulty() {
  await ensureSeeded();
  const states = await getAll<StoredState>("states");

  let hard = 0, medium = 0, easy = 0, none = 0;

  for (const s of states) {
    if (s.difficulty >= 7) hard++;
    else if (s.difficulty >= 4) medium++;
    else if (s.difficulty >= 1) easy++;
    else none++;
  }

  const distribution = [];
  if (easy > 0) distribution.push({ name: "Fácil", value: easy });
  if (medium > 0) distribution.push({ name: "Médio", value: medium });
  if (hard > 0) distribution.push({ name: "Difícil", value: hard });
  if (none > 0) distribution.push({ name: "Não avaliado", value: none });

  return { distribution };
}

// ==============================================================================
// Histórico
// ==============================================================================

export type HistoryTopic = {
  subjectName: string;
  topicName: string;
  topicId: number;
  cardsEstudados: number;
  revisoes: number;
  acertoPct: number | null;
};

export type HistoryDay = {
  date: string; // YYYY-MM-DD
  topics: HistoryTopic[];
};

export type HistoryResponse = {
  days: number;
  history: HistoryDay[];
};

export async function getHistoryData(days: number): Promise<HistoryResponse> {
  await ensureSeeded();
  const [index, log] = await Promise.all([
    getIndex(),
    getAll<LogEvent>("log"),
  ]);

  const cutoffDay = new Date(Date.now() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);

  const subjectMap = new Map<number, string>();
  const topicMap = new Map<number, { name: string, subjectId: number }>();
  for (const s of index.subjects) {
    subjectMap.set(s.id, s.name);
    for (const t of s.topics) {
      topicMap.set(t.id, { name: t.name, subjectId: s.id });
    }
  }

  // day -> topicId -> data
  const aggregated = new Map<string, Map<number, {
    cards: Set<number>;
    revisoes: number;
    goodRevs: number;
  }>>();

  for (const e of log) {
    if (!e.reviewDate) continue;
    const iso = e.reviewDate.includes("T") ? e.reviewDate : e.reviewDate.replace(" ", "T") + "Z";
    const day = iso.substring(0, 10);

    if (day >= cutoffDay) {
      let dayMap = aggregated.get(day);
      if (!dayMap) {
        dayMap = new Map();
        aggregated.set(day, dayMap);
      }
      
      let topicData = dayMap.get(e.topicId);
      if (!topicData) {
        topicData = { cards: new Set(), revisoes: 0, goodRevs: 0 };
        dayMap.set(e.topicId, topicData);
      }

      topicData.cards.add(e.cardId);
      topicData.revisoes++;
      if (e.rating >= 3) topicData.goodRevs++;
    }
  }

  const history: HistoryDay[] = [];
  const daysSorted = Array.from(aggregated.keys()).sort().reverse();

  for (const day of daysSorted) {
    const dayMap = aggregated.get(day)!;
    const topics: HistoryTopic[] = [];

    for (const [topicId, data] of dayMap.entries()) {
      const tInfo = topicMap.get(topicId);
      if (!tInfo) continue;

      topics.push({
        subjectName: subjectMap.get(tInfo.subjectId) ?? "Desconhecido",
        topicName: tInfo.name,
        topicId,
        cardsEstudados: data.cards.size,
        revisoes: data.revisoes,
        acertoPct: data.revisoes > 0 ? Math.round((data.goodRevs / data.revisoes) * 100) : null,
      });
    }

    topics.sort((a, b) => b.cardsEstudados - a.cardsEstudados);
    history.push({ date: day, topics });
  }

  return { days, history };
}

// ==============================================================================
// Disciplinas (Baralhos)
// ==============================================================================

export type SubjectTopicOut = {
  id: number;
  name: string;
  filePath: string;
  cardCount: number;
  voltas: number;
  dueNow: number;
  novos: number;
  maduros: number;
};

export async function getSubjectTopics(subjectName: string): Promise<{ subject: { id: number; name: string; dueCount: number }, topics: SubjectTopicOut[] } | null> {
  await ensureSeeded();
  const [index, states, topicStudies] = await Promise.all([
    getIndex(),
    getAll<StoredState>("states"),
    getAll<TopicStudy>("topics"),
  ]);

  const subj = index.subjects.find((s) => s.name === subjectName);
  if (!subj) return null;

  const boundary = startOfNextDayISO();

  // states map per topic
  const dueCountMap = new Map<number, number>();
  const novosCountMap = new Map<number, number>();
  const madurosCountMap = new Map<number, number>();

  let totalDue = 0;

  for (const s of states) {
    const isDue = s.reps > 0 && s.due !== null && s.due < boundary && s.suspended === 0;
    const isNovo = s.reps === 0;
    const isMaduro = s.scheduledDays >= MATURE_DAYS;

    if (isDue) {
      dueCountMap.set(s.topicId, (dueCountMap.get(s.topicId) ?? 0) + 1);
      // We only care if it belongs to this subject, but since we iterate all states we filter later.
    }
    if (isNovo) novosCountMap.set(s.topicId, (novosCountMap.get(s.topicId) ?? 0) + 1);
    if (isMaduro) madurosCountMap.set(s.topicId, (madurosCountMap.get(s.topicId) ?? 0) + 1);
  }

  const topicStudyMap = new Map<number, number>();
  for (const ts of topicStudies) {
    topicStudyMap.set(ts.topicId, ts.voltas);
  }

  const topicsOut: SubjectTopicOut[] = [];

  for (const t of subj.topics) {
    const isDue = dueCountMap.get(t.id) ?? 0;
    totalDue += isDue;

    const storedNovos = novosCountMap.get(t.id) ?? 0;
    const statesCount = states.filter(s => s.topicId === t.id).length;
    // Novos = cards without state + cards with state where reps=0
    const missingStates = t.cardCount - statesCount;
    const novos = storedNovos + Math.max(0, missingStates);

    topicsOut.push({
      id: t.id,
      name: t.name,
      filePath: t.name, // The static index doesn't have filePath, but it's not used in UI anyway
      cardCount: t.cardCount,
      voltas: topicStudyMap.get(t.id) ?? 0,
      dueNow: isDue,
      novos,
      maduros: madurosCountMap.get(t.id) ?? 0,
    });
  }

  return {
    subject: { id: subj.id, name: subj.name, dueCount: totalDue },
    topics: topicsOut,
  };
}

// ==============================================================================

export async function syncWithNeon(): Promise<boolean> {
  const q = await getAll<any>("queue");
  if (q.length === 0) return true;

  const payload = {
    reviews: [] as any[],
    suspensions: [] as any[],
    voltas: [] as any[],
    priorities: [] as any[],
  };

  for (const item of q) {
    if (item.type === "review") payload.reviews.push(item);
    else if (item.type === "suspend") payload.suspensions.push(item);
    else if (item.type === "volta") payload.voltas.push(item);
    else if (item.type === "topicPriority") payload.priorities.push(item);
  }

  try {
    const res = await fetch("/api/sync/up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return false;

    await clearStore("queue");
    return true;
  } catch (err) {
    console.error("Erro no sync:", err);
    return false;
  }
}

export async function restoreFromNeon(): Promise<boolean> {
  try {
    const res = await fetch("/api/sync/down");
    if (!res.ok) return false;
    const data = await res.json();
    
    // Sobrescreve local
    await putMany("states", data.states.map((s: any) => cardStateToStored(s.cardId, s.topicId, s, s.suspended)));
    await putMany("log", data.log);
    await putMany("topics", data.voltas);
    
    // Limpa a queue pois estamos 100% sincados
    await clearStore("queue");
    
    return true;
  } catch (err) {
    console.error("Erro no restore:", err);
    return false;
  }
}

