"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { CloudCheck, CloudAlert, RefreshCw, Loader2 } from "lucide-react";
import { pendingSyncCount, syncWithNeon } from "@/lib/client/engine";
import {
  describeChannel,
  getServerSyncSnapshot,
  getSyncSnapshot,
  setChannelStatus,
  subscribeSync,
} from "@/lib/client/syncStatus";
import {
  hydrateCycleFromCloud,
  isCycleHydrated,
  pushCycleNow,
  scheduleCyclePush,
} from "@/lib/preparation/sync";
import { applyDeckAlignment } from "@/lib/preparation/alignWithDecks";
import { getMeta } from "@/lib/preparation/db";

const SYNC_INTERVAL_MS = 60_000;

/**
 * Guardião do backup. Mantém dois canais no ar — revisões de flashcards e o
 * documento do ciclo — e mostra o estado real: um backup que falha em silêncio
 * é pior que backup nenhum, porque parece que está tudo salvo.
 */
export default function SyncManager() {
  const status = useSyncExternalStore(subscribeSync, getSyncSnapshot, getServerSyncSnapshot);

  const syncAll = useCallback(async () => {
    // Uma hidratação que falhou (offline no boot, cold start do Neon) travava o
    // backup do ciclo pela sessão inteira: `pushCycleNow` desiste enquanto
    // `hydrated` for falso, e ninguém tentava de novo. Agora toda rodada de
    // sincronia reabre a tentativa.
    if (!isCycleHydrated()) await hydrateCycleFromCloud();
    await Promise.allSettled([syncWithNeon(), pushCycleNow()]);
  }, []);

  // Primeira carga: puxa o ciclo da nuvem antes de liberar qualquer envio, e
  // conta o que já estava na fila de flashcards.
  useEffect(() => {
    void hydrateCycleFromCloud().then(() => {
      // Depois de ter o estado certo em mãos, garante que o ciclo conheça todos
      // os baralhos. É idempotente: sem novidade, não escreve nada.
      if (!getMeta().alignedAt) void applyDeckAlignment();
    });
    void pendingSyncCount().then((n) => setChannelStatus("cards", { pending: n }));
    void syncWithNeon();
  }, []);

  // Toda edição do ciclo agenda um backup (rajadas viram uma escrita só).
  useEffect(() => {
    const onDbUpdated = () => scheduleCyclePush();
    // Falha ao gravar no localStorage (cota, aba privada) não pode ficar muda:
    // sem isso a barra continuaria dizendo "Tudo salvo".
    const onWriteError = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setChannelStatus("cycle", { error: detail, pending: 1, busy: false });
    };
    window.addEventListener("db-updated", onDbUpdated);
    window.addEventListener("cycle-write-error", onWriteError);
    return () => {
      window.removeEventListener("db-updated", onDbUpdated);
      window.removeEventListener("cycle-write-error", onWriteError);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void syncAll(), SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void syncAll();
    };
    const onOnline = () => void syncAll();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    // Última chance de avisar: se ainda há coisa na fila ao fechar a aba, o
    // navegador segura a saída em vez de deixar o progresso preso aqui.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const snap = getSyncSnapshot();
      if (snap.cards.pending > 0 || snap.cycle.pending > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [syncAll]);

  const busy = status.cards.busy || status.cycle.busy;
  const error = status.cards.error ?? status.cycle.error;
  const pending = status.cards.pending + status.cycle.pending;

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-soft motion-reduce:animate-none" />
          ) : error ? (
            <CloudAlert className="w-3.5 h-3.5 text-grade-again" />
          ) : (
            <CloudCheck className="w-3.5 h-3.5 text-accent" />
          )}
          <span className={error ? "text-grade-again" : "text-ink-soft"}>
            {error ? "Backup pendente" : pending > 0 ? "Salvando…" : "Tudo salvo"}
          </span>
        </span>

        <button
          type="button"
          onClick={() => void syncAll()}
          disabled={busy}
          title="Sincronizar agora"
          className="p-1 rounded text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="sr-only">Sincronizar agora</span>
        </button>
      </div>

      <dl className="mt-2 space-y-1 text-[11px] text-ink-soft">
        <div className="flex justify-between gap-2">
          <dt>Flashcards</dt>
          <dd className="text-right truncate" title={describeChannel(status.cards)}>
            {describeChannel(status.cards)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Ciclo</dt>
          <dd className="text-right truncate" title={describeChannel(status.cycle)}>
            {describeChannel(status.cycle)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Aviso compacto para o mobile, onde não há barra lateral. Fica invisível
 * enquanto está tudo salvo e só aparece quando há algo em risco — o usuário
 * não deve precisar procurar essa informação.
 */
export function SyncBanner() {
  const status = useSyncExternalStore(subscribeSync, getSyncSnapshot, getServerSyncSnapshot);
  const error = status.cards.error ?? status.cycle.error;
  const pending = status.cards.pending + status.cycle.pending;

  if (!error && pending === 0) return null;

  return (
    <div
      role="status"
      className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {error ? (
        <CloudAlert className="w-4 h-4 shrink-0" />
      ) : (
        <Loader2 className="w-4 h-4 shrink-0 animate-spin motion-reduce:animate-none" />
      )}
      <span className="min-w-0 flex-1">
        {error ? `Backup pendente — ${error}` : "Salvando seu progresso…"}
      </span>
    </div>
  );
}
