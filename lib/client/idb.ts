"use client";

// Armazenamento local-first (IndexedDB). O navegador é a fonte da verdade;
// o Neon vira backup assíncrono (fila em `queue`). O estado FSRS é sempre
// recomputável a partir do `log` (append-only) — garantia de migração.

const DB_NAME = "bizurado";
const DB_VERSION = 1;

export type StoredState = {
  cardId: number;
  topicId: number;
  stability: number;
  difficulty: number;
  due: string;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
  state: string;
  learningStep: number;
  suspended: number;
};

export type LogEvent = {
  id?: number;
  cardId: number;
  topicId: number;
  subjectId: number;
  rating: number;
  reviewDate: string;
};

export type TopicStudy = {
  topicId: number;
  priority: number;
  voltas: number;
  intervalDays: number;
  due: string | null;
  lastStudied: string | null;
  avgMinutes: number | null;
  minPerCard: number | null;
  status: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const states = db.createObjectStore("states", { keyPath: "cardId" });
      states.createIndex("topicId", "topicId");
      const log = db.createObjectStore("log", { autoIncrement: true });
      log.createIndex("reviewDate", "reviewDate");
      db.createObjectStore("topics", { keyPath: "topicId" });
      db.createObjectStore("meta");
      db.createObjectStore("queue", { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return reqAsPromise(db.transaction(store).objectStore(store).get(key));
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return reqAsPromise(db.transaction(store).objectStore(store).getAll());
}

export async function getAllByIndex<T>(
  store: string,
  index: string,
  key: IDBValidKey
): Promise<T[]> {
  const db = await openDb();
  return reqAsPromise(
    db.transaction(store).objectStore(store).index(index).getAll(key)
  );
}

export async function put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  await reqAsPromise(db.transaction(store, "readwrite").objectStore(store).put(value, key));
}

export async function putMany(store: string, values: unknown[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lê valores junto das chaves. Necessário para a fila de backup: só podemos
 * apagar exatamente o que foi enviado — apagar a store inteira descartaria as
 * revisões que entraram enquanto o envio estava em voo.
 */
export async function getAllWithKeys<T>(
  store: string
): Promise<{ key: IDBValidKey; value: T }[]> {
  const db = await openDb();
  const os = db.transaction(store).objectStore(store);
  const [keys, values] = await Promise.all([
    reqAsPromise<IDBValidKey[]>(os.getAllKeys()),
    reqAsPromise<T[]>(os.getAll()),
  ]);
  return keys.map((key, i) => ({ key, value: values[i] }));
}

/** Apaga um conjunto específico de chaves numa única transação. */
export async function deleteKeys(store: string, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const k of keys) os.delete(k);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Escreve em várias stores dentro de UMA transação. Registrar uma revisão toca
 * `states`, `log` e `queue`: em transações separadas, fechar a aba no meio
 * gravava o novo agendamento sem enfileirar o envio — a revisão passava a
 * existir só neste navegador e sumia no primeiro restore.
 */
export async function putAtomic(
  writes: { store: string; value: unknown; key?: IDBValidKey }[]
): Promise<void> {
  if (writes.length === 0) return;
  const db = await openDb();
  const stores = Array.from(new Set(writes.map((w) => w.store)));
  const tx = db.transaction(stores, "readwrite");
  for (const w of writes) {
    if (w.key === undefined) tx.objectStore(w.store).put(w.value);
    else tx.objectStore(w.store).put(w.value, w.key);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transação abortada"));
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function count(store: string): Promise<number> {
  const db = await openDb();
  return reqAsPromise(db.transaction(store).objectStore(store).count());
}
