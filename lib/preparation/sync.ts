"use client";

// Backup do Ciclo de Estudos no Neon.
//
// Modelo: o navegador é a fonte da verdade e a nuvem guarda o documento inteiro
// a cada mudança. Simples de propósito — é um usuário só, e um snapshot íntegro
// vale mais que um merge esperto que pode errar.
//
// Garantias:
//  1. Toda escrita na nuvem empilha a versão anterior em `cycle_snapshots`.
//  2. Antes de adotar a nuvem, a cópia local é estacionada lá também.
//  3. Um navegador recém-aberto (seed de fábrica) nunca sobrepõe a nuvem.

import { getDb, getMeta, replaceDb, setMeta } from "./db";
import type { DatabaseState } from "./types";
import { setChannelStatus } from "@/lib/client/syncStatus";

// Curto de propósito: o requisito é que todo avanço esteja no banco, não que o
// navegador economize requisições. Ainda agrupa uma rajada de cliques.
const PUSH_DEBOUNCE_MS = 600;

let hydrated = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<boolean> | null = null;

function refreshPending() {
  const meta = getMeta();
  setChannelStatus("cycle", {
    pending: meta.dirty ? 1 : 0,
    lastSyncedAt: meta.lastSyncedAt,
  });
}

/**
 * Puxa a nuvem e decide quem vence — uma vez por carregamento da página.
 * Só depois disso os envios são liberados, para não empurrar o seed por cima
 * de meses de progresso.
 */
export function isCycleHydrated(): boolean {
  return hydrated;
}

/** Reabre a janela de hidratação (usado pelo reset, que zera a revisão local). */
export function resetHydration(): void {
  hydrated = false;
}

export async function hydrateCycleFromCloud(): Promise<void> {
  if (hydrated) return;

  setChannelStatus("cycle", { busy: true, error: null });
  try {
    const res = await fetch("/api/cycle-state", { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Falha ao ler o backup (HTTP ${res.status})`);
    }

    const remote = (await res.json()) as {
      revision: number;
      data: DatabaseState | null;
      updatedAt: string | null;
    };
    const meta = getMeta();

    const cloudHasData = remote.revision > 0 && remote.data !== null;
    const localIsUntouched = meta.seeded && !meta.dirty;
    const cloudIsAhead = remote.revision > meta.revision;

    if (cloudHasData && (localIsUntouched || (cloudIsAhead && !meta.dirty))) {
      // A nuvem vence. Quando o local não é mais o seed de fábrica, guardamos a
      // cópia antes de sobrepor: o sinal `dirty` pode ter se perdido (quota
      // estourada, aba fechada no meio de um envio) e o que está aqui pode ser
      // a única cópia de uma edição.
      if (!meta.seeded && !(await parkCurrentCycle("local-substituido"))) {
        // Não conseguimos guardar a cópia local: melhor conviver com a
        // divergência do que destruí-la sem rede de segurança.
        setChannelStatus("cycle", {
          error: "Não deu para guardar a cópia local — a versão da nuvem não foi aplicada",
        });
        hydrated = true;
        return;
      }
      replaceDb(remote.data as DatabaseState, remote.revision);
    } else if (cloudHasData && cloudIsAhead && meta.dirty) {
      // Divergência real: os dois lados têm mudanças. Guardamos a cópia local
      // na nuvem (nada se perde) e seguimos com ela, que é a mais recente para
      // este dispositivo. O push seguinte usa `force`.
      await parkLocalCopy(getDb(), meta.revision, "local-divergente");
      setMeta({ revision: remote.revision });
    } else if (!cloudHasData) {
      // Primeiro backup: a nuvem está vazia, o local vira a versão 1.
      setMeta({ dirty: true });
    }

    hydrated = true;
    setChannelStatus("cycle", { busy: false, error: null });
    refreshPending();
    await pushCycleNow();
  } catch (err) {
    setChannelStatus("cycle", { busy: false, error: describe(err) });
  }
}

/**
 * Guarda a cópia local na nuvem antes de uma ação destrutiva (reset, import,
 * restauração). Devolve false se não deu — o chamador decide se segue.
 */
export async function parkCurrentCycle(origin: string): Promise<boolean> {
  try {
    await parkLocalCopy(getDb(), getMeta().revision, origin);
    return true;
  } catch {
    return false;
  }
}

/** Estaciona uma cópia na nuvem sem tocar no estado corrente. */
async function parkLocalCopy(data: DatabaseState, revision: number, origin: string) {
  const res = await fetch("/api/cycle-state/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, revision, origin }),
  });
  // `fetch` só rejeita em erro de rede: sem esta checagem um 500 (tabela
  // ausente, Neon fora do ar) devolvia "guardado com sucesso" sem ter guardado
  // nada — e quem chama usa isso para liberar uma ação destrutiva.
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Não foi possível guardar a cópia (HTTP ${res.status})`);
  }
}

/** Envia o estado local agora, se houver algo pendente. */
export async function pushCycleNow(): Promise<boolean> {
  if (!hydrated) return false;
  if (inFlight) return inFlight;

  const meta = getMeta();
  if (!meta.dirty) {
    refreshPending();
    return true;
  }

  inFlight = (async () => {
    setChannelStatus("cycle", { busy: true, error: null });
    const data = getDb();
    // Impressão do documento que está subindo. Se ele mudar enquanto o PUT está
    // em voo, limpar `dirty` no fim apagaria o sinal da edição nova — ela ficaria
    // só neste navegador e morreria na próxima hidratação.
    const enviado = JSON.stringify(data);
    try {
      let res = await fetch("/api/cycle-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: meta.revision, data, origin: "web" }),
      });

      if (res.status === 409) {
        // A nuvem avançou desde o carregamento. Forçar é aceitável quando este
        // navegador tem progresso real (a versão de lá vai para o histórico),
        // mas NUNCA quando o que temos aqui é o seed de fábrica ou uma cópia
        // sem revisão conhecida — seria o demo apagando meses de estudo.
        const podeForcar = !meta.seeded && meta.revision > 0;
        if (!podeForcar) {
          setChannelStatus("cycle", {
            busy: false,
            pending: 1,
            error:
              "A nuvem tem uma versão mais nova — recarregue a página para trazê-la antes de editar",
          });
          return false;
        }
        res = await fetch("/api/cycle-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: meta.revision, data, origin: "web-force", force: true }),
        });
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Backup recusado (HTTP ${res.status})`);
      }

      const out = (await res.json()) as { revision: number; updatedAt: string };
      const mudouDurante = JSON.stringify(getDb()) !== enviado;

      setMeta({
        revision: out.revision,
        dirty: mudouDurante,
        seeded: false,
        lastSyncedAt: out.updatedAt,
      });
      setChannelStatus("cycle", {
        busy: false,
        error: null,
        pending: mudouDurante ? 1 : 0,
        lastSyncedAt: out.updatedAt,
      });

      if (mudouDurante) scheduleCyclePush();
      return true;
    } catch (err) {
      // `dirty` continua ligado: nada é descartado, tentamos de novo depois.
      setChannelStatus("cycle", { busy: false, error: describe(err), pending: 1 });
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Agenda um envio, agrupando rajadas de edição em uma escrita só. */
export function scheduleCyclePush(): void {
  refreshPending();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushCycleNow();
  }, PUSH_DEBOUNCE_MS);
}

/** Restaura uma versão do histórico por cima do estado atual. */
export async function restoreCycleSnapshot(snapshotId: number): Promise<void> {
  const res = await fetch(`/api/cycle-state/snapshots?id=${snapshotId}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Falha ao ler a versão (HTTP ${res.status})`);
  }
  const snap = (await res.json()) as { data: DatabaseState };

  // Guarda o estado atual antes de trocar — restaurar também é reversível.
  await parkLocalCopy(getDb(), getMeta().revision, "pre-restauracao");
  replaceDb(snap.data, getMeta().revision);
  setMeta({ dirty: true });
  await pushCycleNow();
}

function describe(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror/i.test(raw)) return "Sem conexão — o backup continua na fila";
  return raw;
}
