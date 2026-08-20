"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import {
  deleteTopic,
  setTopicStatus,
  topicProgressSummary,
} from "@/lib/preparation/topicOps";
import { getDb } from "@/lib/preparation/db";
import type { Topic } from "@/lib/preparation/types";

/**
 * Menu de ações de um assunto do ciclo.
 *
 * Suspender é reversível e preserva tudo. Excluir apaga de verdade — por isso
 * confere antes se há estudo registrado e diz, em números, o que se perde.
 */
export default function TopicActions({ topic }: { topic: Topic }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const suspenso = topic.status === "suspended";

  const pausar = () => {
    setAberto(false);
    if (suspenso) {
      setTopicStatus(topic.id, "active");
      return;
    }
    const motivo = window.prompt(
      `Pausar "${topic.name}".\n\nEle sai do ciclo, some da revisão de flashcards e deixa de contar no progresso da camada. Volta quando você quiser.\n\nMotivo (opcional):`,
      ""
    );
    if (motivo === null) return;
    setTopicStatus(topic.id, "suspended", motivo);
  };

  const excluir = () => {
    setAberto(false);
    const p = topicProgressSummary(getDb(), topic.id);

    const aviso = p.temProgresso
      ? `Excluir "${topic.name}" apaga também o progresso dele:\n\n` +
        `· ${p.camadas} camada(s) cumprida(s)\n` +
        `· ${p.questoes} questão(ões) registrada(s)\n\n` +
        `Isso não tem volta. Se você só quer tirar do caminho por enquanto, use Pausar.\n\nExcluir mesmo assim?`
      : `Excluir "${topic.name}"? Ele não tem progresso registrado.` +
        (topic.origin === "deck"
          ? "\n\nOs flashcards continuam no banco — só deixam de aparecer no seu ciclo."
          : "");

    if (!window.confirm(aviso)) return;
    deleteTopic(topic.id);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Ações do assunto"
        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="sr-only">Ações de {topic.name}</span>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-left"
        >
          <button
            type="button"
            role="menuitem"
            onClick={pausar}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {suspenso ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {suspenso ? "Reativar" : "Pausar"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={excluir}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}
