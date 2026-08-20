"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { createCard } from "@/lib/client/engine";
import ImportCardsPanel from "./ImportCardsPanel";

type Props = {
  subjectName: string;
  topicName: string;
  onClose: () => void;
};

/**
 * Cria um card dentro de um assunto do ciclo.
 *
 * O card vai para o Postgres e é espelhado no navegador na mesma hora — aparece
 * na revisão em seguida, sem esperar reimportação de arquivo. Fica numa gaveta
 * "<assunto> > Meus cards", que o casamento por módulo já agrupa junto dos
 * baralhos oficiais do mesmo assunto.
 */
export default function AddCardModal({ subjectName, topicName, onClose }: Props) {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");
  const [bizu, setBizu] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criados, setCriados] = useState(0);
  const [aba, setAba] = useState<"escrever" | "importar">("escrever");
  const perguntaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    perguntaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const salvar = useCallback(
    async (continuar: boolean) => {
      if (!pergunta.trim() || !resposta.trim()) {
        setErro("Pergunta e resposta são obrigatórias.");
        return;
      }
      setSalvando(true);
      setErro(null);
      try {
        await createCard({
          subjectName,
          topicName,
          question: pergunta.trim(),
          answer: resposta.trim(),
          bizu: bizu.trim() || undefined,
        });
        setCriados((n) => n + 1);
        if (continuar) {
          // Fluxo de quem está criando uma bateria: limpa e mantém o foco.
          setPergunta("");
          setResposta("");
          setBizu("");
          perguntaRef.current?.focus();
        } else {
          onClose();
        }
      } catch (err) {
        setErro(err instanceof Error ? err.message : String(err));
      } finally {
        setSalvando(false);
      }
    },
    [pergunta, resposta, bizu, subjectName, topicName, onClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Novo card em ${topicName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-lg max-h-[92vh] overflow-y-auto">
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900">Novo card</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {subjectName} › {topicName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <X className="w-5 h-5" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="px-5 pt-4">
          <div className="flex gap-1 border-b border-slate-200">
            {(["escrever", "importar"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAba(k)}
                aria-current={aba === k ? "page" : undefined}
                className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${
                  aba === k
                    ? "border-teal-700 text-teal-800 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {k === "escrever" ? "Escrever um" : "Importar .txt"}
              </button>
            ))}
          </div>
        </div>

        {aba === "importar" ? (
          <div className="p-5">
            <ImportCardsPanel
              subjectName={subjectName}
              topicName={topicName}
              onDone={onClose}
            />
          </div>
        ) : (
        <>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Pergunta
            </span>
            <textarea
              ref={perguntaRef}
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus-visible:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Resposta
            </span>
            <textarea
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              rows={5}
              className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus-visible:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Bizu <span className="font-normal normal-case tracking-normal">(opcional)</span>
            </span>
            <textarea
              value={bizu}
              onChange={(e) => setBizu(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus-visible:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>

          <p className="text-xs text-slate-500">
            Aceita HTML simples: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>,{" "}
            <code>&lt;br&gt;</code> — igual aos cards importados.
          </p>

          {erro && (
            <p role="status" className="text-sm text-red-700">
              {erro}
            </p>
          )}
          {criados > 0 && !erro && (
            <p role="status" className="text-sm text-teal-700">
              {criados} {criados === 1 ? "card criado" : "cards criados"} neste assunto.
            </p>
          )}
        </div>

        <footer className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end p-5 border-t border-slate-200 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {criados > 0 ? "Concluir" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => void salvar(true)}
            disabled={salvando}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-teal-200 text-teal-700 hover:bg-teal-50 disabled:opacity-50"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Salvar e criar outro
          </button>
          <button
            type="button"
            onClick={() => void salvar(false)}
            disabled={salvando}
            className="px-4 py-2.5 rounded-lg text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </footer>
        </>
        )}
      </div>
    </div>
  );
}
