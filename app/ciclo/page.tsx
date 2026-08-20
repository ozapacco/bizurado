"use client";

import { useState } from "react";
import { resolveSubjectName } from "@/lib/subjectMatch";
import Link from "next/link";
import { useDb } from "@/lib/preparation/useDb";
import { getPlanId, getCurrentSubject, getActiveCycleSubjects } from "@/lib/preparation/cycle";
import { buildConsolidatedPlan } from "@/lib/preparation/consolidatedPlanEngine";
import { generateCycleSuggestions } from "@/lib/preparation/cycleBuilderEngine";
import { saveDb } from "@/lib/preparation/db";
import { ArrowRight, Check, Sparkles } from "lucide-react";

export default function CyclePage() {
  const db = useDb();
  const planId = getPlanId();
  const activeSubjects = getActiveCycleSubjects();
  const currentSubject = getCurrentSubject();
  const plan = buildConsolidatedPlan(db);
  const suggestions = generateCycleSuggestions(db);

  const [isEditing, setIsEditing] = useState(false);
  const [editBlocks, setEditBlocks] = useState<Record<string, number>>({});

  const handleEditToggle = () => {
    if (isEditing) {
      // Save changes
      db.subjects.forEach((s) => {
        if (editBlocks[s.id] !== undefined) {
          s.block_minutes = editBlocks[s.id];
          (s as any).user_override = true;
          const rs = db.subjectRoundStates.find((r) => r.subject_id === s.id);
          if (rs && rs.planned_minutes !== s.block_minutes) {
            rs.planned_minutes = s.block_minutes;
            rs.remaining_minutes = Math.max(0, rs.planned_minutes - rs.consumed_minutes);
          }
        }
      });
      saveDb({ ...db });
    } else {
      // Init edit state
      const initial: Record<string, number> = {};
      db.subjects.forEach((s) => {
        initial[s.id] = s.block_minutes;
      });
      setEditBlocks(initial);
    }
    setIsEditing(!isEditing);
  };

  const handleApplySuggestions = () => {
    suggestions.forEach((sug) => {
      const s = db.subjects.find((sub) => sub.id === sug.subject_id);
      if (s) {
        s.block_minutes = sug.recommended_block_minutes;
        (s as any).user_override = false;
        const rs = db.subjectRoundStates.find((r) => r.subject_id === s.id);
        if (rs) {
          rs.planned_minutes = sug.recommended_block_minutes;
          rs.remaining_minutes = Math.max(0, rs.planned_minutes - rs.consumed_minutes);
        }
      }
    });
    saveDb({ ...db });
    const initial: Record<string, number> = {};
    db.subjects.forEach((s) => {
      initial[s.id] = s.block_minutes;
    });
    setEditBlocks(initial);
  };

  const allSubjects = db.subjects
    .filter((s) => s.study_plan_id === planId)
    .sort((a, b) => a.cycle_order - b.cycle_order);

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans pb-12">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CICLO DE ESTUDOS</h1>
          <div className="text-slate-500 mt-1 text-sm">
            Sua fila de matérias (ênfase proporcional aos seus objetivos)
          </div>
        </div>
        <div className="space-x-3 flex items-center self-start sm:self-auto">
          {isEditing && (
            <button
              onClick={handleApplySuggestions}
              className="px-3 py-2 rounded-lg font-medium text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center border border-teal-200"
            >
              <Sparkles className="w-4 h-4 mr-1 text-teal-600" />
              USAR SUGESTÕES
            </button>
          )}
          <button
            onClick={handleEditToggle}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              isEditing ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {isEditing ? "SALVAR CICLO" : "EDITAR CICLO"}
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg font-medium text-sm bg-slate-800 text-white hover:bg-slate-900 inline-block"
          >
            VOLTAR PARA HOJE
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse min-w-[750px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4 w-12 text-center">#</th>
              <th className="p-4">Matéria</th>
              <th className="p-4">Ênfase</th>
              <th className="p-4 text-right">Bloco</th>
              <th className="p-4 text-right">Feito</th>
              <th className="p-4 text-right">Restante</th>
              <th className="p-4">Onde parou</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {allSubjects.map((subject, idx) => {
              const rs = db.subjectRoundStates.find((r) => r.subject_id === subject.id);
              const material = db.materials.find((m) => m.subject_id === subject.id);
              const ls = db.subjectLayerStates.find((l) => l.subject_id === subject.id);

              const isCurrent = currentSubject?.id === subject.id;
              const isCompleted = ls?.completed_in_layer;
              const isDoneInRound = !isCompleted && rs && rs.remaining_minutes === 0;

              // Consolidated discipline info
              // O nome do ciclo e o do edital divergem ("Português" x "Língua
              // Portuguesa"). A ponte já sabe resolver isso; comparar à mão aqui
              // fazia 4 das 11 disciplinas caírem no rótulo genérico "MÉDIA".
              const discInfo = plan.disciplines.find(
                (d) =>
                  d.name === resolveSubjectName(subject.name, plan.disciplines.map((x) => x.name))
              );
              const sug = suggestions.find((s) => s.subject_id === subject.id || s.name === subject.name);

              const emphasisText = discInfo ? discInfo.emphasis_label : "MÉDIA";

              return (
                <tr
                  key={subject.id}
                  className={`
                  ${isCurrent ? "bg-teal-50/50" : ""} 
                  ${isCompleted ? "opacity-50 grayscale" : ""}
                  hover:bg-slate-50 transition-colors
                `}
                >
                  <td className="p-4 text-center">
                    {isCurrent ? (
                      <ArrowRight className="w-5 h-5 text-teal-600 mx-auto" />
                    ) : isDoneInRound ? (
                      <Check className="w-5 h-5 text-slate-400 mx-auto" />
                    ) : (
                      <span className="text-slate-400 font-medium">{idx + 1}</span>
                    )}
                  </td>
                  <td className={`p-4 font-medium ${isCurrent ? "text-teal-900" : "text-slate-800"}`}>
                    <div>{subject.name}</div>
                    {isEditing && sug && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Sugerido: {sug.recommended_block_minutes}m | {sug.reason}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        emphasisText === "MUITO ALTA"
                          ? "bg-purple-100 text-purple-800"
                          : emphasisText === "ALTA"
                          ? "bg-teal-100 text-teal-800"
                          : emphasisText === "MÉDIA"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {emphasisText}
                    </span>
                  </td>
                  <td className="p-4 text-right text-slate-600 tabular-nums">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editBlocks[subject.id] || 0}
                        onChange={(e) =>
                          setEditBlocks({
                            ...editBlocks,
                            [subject.id]: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-16 p-1 text-right border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 bg-white"
                      />
                    ) : (
                      `${subject.block_minutes}m`
                    )}
                  </td>
                  <td className="p-4 text-right text-slate-600 tabular-nums">{rs?.consumed_minutes || 0}m</td>
                  <td
                    className={`p-4 text-right tabular-nums font-bold ${
                      isCurrent ? "text-teal-700" : "text-slate-600"
                    }`}
                  >
                    {rs?.remaining_minutes || 0}m
                  </td>
                  <td className="p-4 text-slate-600 truncate max-w-[150px]">
                    {material?.current_unit ? `Aula ${material.current_unit}` : "-"}
                  </td>
                  <td className="p-4">
                    {isCompleted ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        concluído
                      </span>
                    ) : isCurrent ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800">
                        atual
                      </span>
                    ) : !subject.active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                        inativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        ativo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
