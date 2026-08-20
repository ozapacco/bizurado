"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addTopic } from "@/lib/preparation/topicOps";

/**
 * Cria um assunto à mão dentro de uma disciplina.
 *
 * É o caminho para temas que existem no edital mas não têm baralho — "Crase" é
 * o caso concreto. Nasce ativo e aparece marcado como "sem baralho" até que
 * algum card seja criado ou importado nele.
 */
export default function AddTopicButton({
  subjectId,
  subjectName,
  parentId,
  parentName,
  compact = false,
}: {
  subjectId: string;
  subjectName: string;
  /** Quando presente, cria um SUBassunto dentro deste. Profundidade livre. */
  parentId?: string;
  parentName?: string;
  compact?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);

  const criar = () => {
    const onde = parentName ? parentName : subjectName;
    const nome = window.prompt(
      parentName ? `Novo subassunto dentro de "${onde}":` : `Novo assunto em ${onde}:`,
      ""
    );
    if (nome === null || !nome.trim()) return;
    try {
      addTopic(subjectId, nome, parentId);
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={criar}
        title={parentName ? `Criar subassunto dentro de ${parentName}` : undefined}
        className={
          compact
            ? "mr-1 p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            : "inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        }
      >
        <Plus className="w-3.5 h-3.5" />
        {compact ? <span className="sr-only">Criar subassunto</span> : "assunto"}
      </button>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </span>
  );
}
