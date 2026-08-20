"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, Loader2, RotateCcw, Upload } from "lucide-react";
import { exportLocalProgress, restoreFromNeon } from "@/lib/client/engine";
import { getDb, getMeta, replaceDb, type CycleMeta } from "@/lib/preparation/db";
import type { DatabaseState } from "@/lib/preparation/types";
import { pushCycleNow, restoreCycleSnapshot } from "@/lib/preparation/sync";
import { relativeTime } from "@/lib/client/syncStatus";

type CloudVersion = {
  id: number;
  revision: number;
  origin: string;
  createdAt: string;
  size: number;
};

const ORIGIN_LABEL: Record<string, string> = {
  web: "backup automático",
  "web-force": "backup automático (sobrepôs a nuvem)",
  superseded: "versão substituída",
  "local-divergente": "cópia deste navegador",
  "pre-restauracao": "antes de restaurar",
  parked: "cópia guardada",
};

/**
 * Backup do estudo em três camadas: a nuvem (automática), o histórico de
 * versões (para voltar atrás) e o arquivo local (para não depender de nada).
 */
export default function BackupPanel() {
  const [meta, setLocalMeta] = useState<CycleMeta | null>(null);
  const [versions, setVersions] = useState<CloudVersion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "erro"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setLocalMeta(getMeta());
    refresh();
    window.addEventListener("cycle-sync-meta", refresh);
    window.addEventListener("db-updated", refresh);
    return () => {
      window.removeEventListener("cycle-sync-meta", refresh);
      window.removeEventListener("db-updated", refresh);
    };
  }, []);

  const loadVersions = useCallback(async () => {
    setBusy("versions");
    setMessage(null);
    try {
      const res = await fetch("/api/cycle-state/snapshots", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setVersions(body.snapshots as CloudVersion[]);
    } catch (err) {
      setMessage({ kind: "erro", text: describe(err) });
    } finally {
      setBusy(null);
    }
  }, []);

  const downloadBackup = useCallback(async () => {
    setBusy("download");
    setMessage(null);
    try {
      const progress = await exportLocalProgress();
      const payload = {
        formato: "bizurado-backup",
        versao: 1,
        exportadoEm: new Date().toISOString(),
        ciclo: { meta: getMeta(), db: getDb() },
        flashcards: progress,
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bizurado-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({
        kind: "ok",
        text: `Arquivo gerado — ${progress.log.length} revisões e ${progress.states.length} cards em progresso.`,
      });
    } catch (err) {
      setMessage({ kind: "erro", text: describe(err) });
    } finally {
      setBusy(null);
    }
  }, []);

  const importFile = useCallback(async (file: File) => {
    setBusy("import");
    setMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as { ciclo?: { db?: DatabaseState } };
      const db = parsed?.ciclo?.db;
      if (!db || !Array.isArray(db.subjects)) {
        throw new Error("Arquivo não parece um backup do Bizurado.");
      }
      // A cópia atual sobe para a nuvem antes de ser trocada — o histórico
      // guarda o que estava aqui, então importar continua reversível.
      await pushCycleNow();
      replaceDb(db, getMeta().revision);
      await pushCycleNow();
      setMessage({ kind: "ok", text: "Ciclo restaurado do arquivo e re-enviado para a nuvem." });
    } catch (err) {
      setMessage({ kind: "erro", text: describe(err) });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const restoreVersion = useCallback(
    async (id: number) => {
      const confirmed = window.confirm(
        "Restaurar esta versão do ciclo? A versão atual fica guardada no histórico."
      );
      if (!confirmed) return;
      setBusy(`v${id}`);
      setMessage(null);
      try {
        await restoreCycleSnapshot(id);
        setMessage({ kind: "ok", text: "Versão restaurada." });
        await loadVersions();
      } catch (err) {
        setMessage({ kind: "erro", text: describe(err) });
      } finally {
        setBusy(null);
      }
    },
    [loadVersions]
  );

  const restoreCards = useCallback(async () => {
    const confirmed = window.confirm(
      "Baixar o progresso dos flashcards da nuvem e substituir o local? Use se este navegador estiver desatualizado."
    );
    if (!confirmed) return;
    setBusy("cards");
    setMessage(null);
    try {
      const ok = await restoreFromNeon();
      setMessage(
        ok
          ? { kind: "ok", text: "Progresso dos flashcards restaurado da nuvem." }
          : { kind: "erro", text: "Não foi possível restaurar — verifique a conexão." }
      );
    } catch (err) {
      setMessage({ kind: "erro", text: describe(err) });
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
          Backup e segurança
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {meta?.lastSyncedAt ? (
            <>
              Ciclo salvo na nuvem {relativeTime(meta.lastSyncedAt)} (versão {meta.revision}).
              {meta.dirty && " Há alterações ainda na fila."}
            </>
          ) : (
            "O ciclo ainda não foi enviado para a nuvem nesta sessão."
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <BackupButton onClick={downloadBackup} busy={busy === "download"} icon={Download}>
          Baixar backup completo
        </BackupButton>

        <BackupButton
          onClick={() => fileRef.current?.click()}
          busy={busy === "import"}
          icon={Upload}
        >
          Restaurar de arquivo
        </BackupButton>

        <BackupButton onClick={loadVersions} busy={busy === "versions"} icon={History}>
          Versões na nuvem
        </BackupButton>

        <BackupButton onClick={restoreCards} busy={busy === "cards"} icon={RotateCcw}>
          Puxar flashcards da nuvem
        </BackupButton>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>

      {message && (
        <p
          role="status"
          className={`text-sm ${message.kind === "ok" ? "text-teal-700" : "text-red-700"}`}
        >
          {message.text}
        </p>
      )}

      {versions && (
        <div className="border-t border-slate-200 pt-3">
          {versions.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma versão guardada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800 tabular-nums">v{v.revision}</span>{" "}
                    <span className="text-slate-500">
                      · {ORIGIN_LABEL[v.origin] ?? v.origin} · {relativeTime(v.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void restoreVersion(v.id)}
                    disabled={busy !== null}
                    className="text-xs font-bold text-teal-700 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 px-2 py-1 rounded disabled:opacity-40 shrink-0"
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function BackupButton({
  onClick,
  busy,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof Download;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon className="w-4 h-4" />
      )}
      {children}
    </button>
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
