"use client";

// Estado de sincronização visível na interface. Dois canais independentes:
// `cards` (revisões FSRS, fila no IndexedDB) e `cycle` (documento do ciclo, no
// localStorage). O SyncManager assina daqui — falha de backup nunca fica muda.

export type SyncChannel = "cards" | "cycle";

export type ChannelStatus = {
  /** Alterações locais ainda não confirmadas pela nuvem. */
  pending: number;
  /** Envio em andamento. */
  busy: boolean;
  /** Último sucesso (ISO) ou null se nunca sincronizou nesta sessão. */
  lastSyncedAt: string | null;
  /** Mensagem do último erro, ou null quando está tudo em dia. */
  error: string | null;
};

export type SyncSnapshot = Record<SyncChannel, ChannelStatus>;

const initial: ChannelStatus = { pending: 0, busy: false, lastSyncedAt: null, error: null };

let snapshot: SyncSnapshot = { cards: { ...initial }, cycle: { ...initial } };

const listeners = new Set<() => void>();

/** Snapshot estável: só troca de identidade quando algo muda de verdade. */
export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function getServerSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setChannelStatus(channel: SyncChannel, patch: Partial<ChannelStatus>): void {
  const current = snapshot[channel];
  const next = { ...current, ...patch };
  if (
    next.pending === current.pending &&
    next.busy === current.busy &&
    next.lastSyncedAt === current.lastSyncedAt &&
    next.error === current.error
  ) {
    return;
  }
  snapshot = { ...snapshot, [channel]: next };
  listeners.forEach((l) => l());
}

/** Texto curto e honesto do estado de um canal, para a barra lateral. */
export function describeChannel(status: ChannelStatus): string {
  if (status.error) return status.error;
  if (status.busy) return "Salvando…";
  if (status.pending > 0) {
    return status.pending === 1 ? "1 alteração na fila" : `${status.pending} alterações na fila`;
  }
  if (!status.lastSyncedAt) return "Sem alterações";
  return `Salvo ${relativeTime(status.lastSyncedAt)}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
