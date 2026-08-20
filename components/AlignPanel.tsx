"use client";

import { useCallback, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { applyDeckAlignment, type AlignReport } from "@/lib/preparation/alignWithDecks";

/**
 * Traz para o ciclo o que existe de baralho: nomes canônicos das disciplinas e
 * uma entrada de assunto para cada unidade dos cards. Roda sozinho na primeira
 * carga; o botão existe para repetir depois de importar material novo.
 */
export default function AlignPanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AlignReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await applyDeckAlignment());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
          Ciclo e baralhos
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Cada unidade dos seus baralhos vira um assunto do ciclo, e as disciplinas passam a
          usar o mesmo nome dos cards. Não remove nada: assuntos antigos mantêm o progresso.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Link2 className="w-4 h-4" />
        )}
        Alinhar ciclo aos baralhos
      </button>

      {error && (
        <p role="status" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {report && !error && (
        <div role="status" className="text-sm text-slate-700 space-y-1">
          {report.changed ? (
            <>
              {report.renamedSubjects.length > 0 && (
                <p>
                  Renomeadas:{" "}
                  {report.renamedSubjects.map((r) => `${r.from} → ${r.to}`).join(", ")}
                </p>
              )}
              {report.addedSubjects.length > 0 && (
                <p>Disciplinas adicionadas: {report.addedSubjects.join(", ")}</p>
              )}
              {report.addedTopics.length > 0 && (
                <p>
                  {report.addedTopics.length} assuntos novos vindos dos baralhos.
                </p>
              )}
            </>
          ) : (
            <p>O ciclo já está alinhado aos baralhos.</p>
          )}
          {report.subjectsWithoutDecks.length > 0 && (
            <p className="text-slate-500">
              Sem baralho, mantidas no ciclo: {report.subjectsWithoutDecks.join(", ")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
