"use client";

import React, { useState } from "react";
import { useDb } from "@/lib/preparation/useDb";
import { getPlanId, getCurrentLayer } from "@/lib/preparation/cycle";
import { evaluateLayer, getOrCreateTopicProgress } from "@/lib/preparation/layerEngine";
import { formatTime } from "@/lib/preparation/utils";
import { Check } from "lucide-react";

export default function ProgressPage() {
  const db = useDb();
  const planId = getPlanId();
  const activeSubjects = db.subjects.filter((s) => s.study_plan_id === planId && s.active);
  const currentLayer = getCurrentLayer();
  const layerState = evaluateLayer(db);

  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const totalQ = db.questionLogs.reduce((acc, l) => acc + l.questions, 0);
  const totalC = db.questionLogs.reduce((acc, l) => acc + l.correct, 0);
  const globalAccuracy = totalQ === 0 ? 0 : Math.round((totalC / totalQ) * 100);

  const allActiveTopics = db.topics.filter((t) => t.status === 'active');
  const coreTopicsCount = allActiveTopics.filter((t) => t.importance_tier === "CORE").length;
  const topicsSeenCount = allActiveTopics.filter(
    (t) => getOrCreateTopicProgress(db, t.id).layer_1_completed
  ).length;

  return (
    <div className="max-w-xl mx-auto space-y-10 font-sans pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">PROGRESSO</h1>
        <div className="text-slate-500 mt-1 text-sm">Visão geral do seu avanço</div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-2 uppercase tracking-wide">
          CAMADA {currentLayer} —{" "}
          {currentLayer === 1
            ? "ORIENTAÇÃO"
            : currentLayer === 2
            ? "CONSOLIDAÇÃO"
            : currentLayer === 3
            ? "ACELERAÇÃO"
            : currentLayer === 4
            ? "CONSTRUÇÃO"
            : "SUSTENTAÇÃO"}
        </h2>
        {currentLayer < 5 && (
          <>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                {layerState.progress}% Concluída
              </span>
            </div>
            <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden mb-6">
              <div
                className="bg-teal-600 h-full transition-all"
                style={{ width: `${layerState.progress}%` }}
              ></div>
            </div>
          </>
        )}

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-slate-700">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-bold text-slate-900">Núcleo identificado:</div>
              <div>{coreTopicsCount} assuntos</div>
            </div>
            <div>
              <div className="font-bold text-slate-900">Primeiro contato concluído:</div>
              <div>
                {topicsSeenCount} / {allActiveTopics.length} assuntos
              </div>
            </div>
            {currentLayer === 1 && (
              <div className="col-span-2 mt-2 pt-2 border-t border-slate-200">
                <div className="font-bold text-slate-900">Ainda não vistos:</div>
                <div>{allActiveTopics.length - topicsSeenCount} assuntos</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Disciplinas</div>
        {activeSubjects.map((subject) => {
          const isExpanded = expandedSubject === subject.id;
          const subjectTopics = db.topics
            .filter((t) => t.subject_id === subject.id && t.status === 'active')
            .sort((a, b) => a.order - b.order);
          const coreT = subjectTopics.filter((t) => t.importance_tier === "CORE");
          const secT = subjectTopics.filter((t) => t.importance_tier === "SECONDARY");
          const terT = subjectTopics.filter((t) => t.importance_tier === "TERTIARY");

          const isCompletedInLayer = (() => {
            if (subjectTopics.length === 0) return false;
            return subjectTopics.every((t) => {
              const prog = getOrCreateTopicProgress(db, t.id);
              if (currentLayer === 1) return prog.layer_1_completed;
              if (currentLayer === 2) return t.importance_tier !== "CORE" || prog.layer_2_completed;
              if (currentLayer === 3) return t.importance_tier !== "CORE" || prog.layer_3_completed;
              if (currentLayer === 4) return t.importance_tier !== "CORE" || prog.layer_4_completed;
              return true;
            });
          })();

          return (
            <div key={subject.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedSubject(isExpanded ? null : subject.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <span className="font-bold text-slate-800">{subject.name}</span>
                <div className="flex items-center space-x-3 text-sm">
                  {isCompletedInLayer ? (
                    <span className="text-teal-700 font-bold flex items-center">
                      <Check className="w-4 h-4 mr-1" /> OK na Camada
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">Em andamento</span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="p-0 bg-white border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-100">Assunto</th>
                        <th className="px-4 py-3 border-b border-slate-100 text-center">Passagens</th>
                        <th className="px-4 py-3 border-b border-slate-100 text-center">Questões</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { title: "NÚCLEO", list: coreT },
                        { title: "SECUNDÁRIOS", list: secT },
                        { title: "TERCIÁRIOS", list: terT },
                      ].map(
                        (group) =>
                          group.list.length > 0 && (
                            <React.Fragment key={group.title}>
                              <tr>
                                <td colSpan={3} className="px-4 py-2 bg-slate-50 text-xs font-bold text-slate-400">
                                  {group.title}
                                </td>
                              </tr>
                              {group.list.map((t) => {
                                const p = getOrCreateTopicProgress(db, t.id);

                                const renderPassage = (num: number, isDone: boolean) => (
                                  <span
                                    className={`mx-1 inline-flex items-center ${
                                      isDone ? "text-teal-600 font-bold" : "text-slate-300"
                                    }`}
                                  >
                                    C{num} {isDone ? "✓" : "○"}
                                  </span>
                                );

                                let qGroup = "-";
                                if (currentLayer === 1) qGroup = "A";
                                else if (currentLayer === 2) qGroup = "B";
                                else if (currentLayer === 3) qGroup = "C";
                                else qGroup = "D";

                                const acc =
                                  p.question_count > 0
                                    ? Math.round((p.correct_count / p.question_count) * 100) + "%"
                                    : "—";

                                return (
                                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-700 truncate max-w-[200px]">
                                      {t.name}
                                      {p.difficulty_flag === "WEAK" && (
                                        <span
                                          className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-500"
                                          title="Dificuldade Marcada"
                                        ></span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs">
                                      {renderPassage(1, p.layer_1_completed)}
                                      {renderPassage(2, p.layer_2_completed)}
                                      {renderPassage(3, p.layer_3_completed)}
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium text-slate-600">
                                      <span className="text-slate-400 mr-2">{qGroup}</span>
                                      {acc}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Horas Líquidas</div>
          <div className="text-xl font-bold text-slate-900">{formatTime(1240)}</div>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Questões</div>
          <div className="text-xl font-bold text-slate-900">{totalQ}</div>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Acertos</div>
          <div className="text-xl font-bold text-slate-900">{globalAccuracy}%</div>
        </div>
      </section>
    </div>
  );
}
