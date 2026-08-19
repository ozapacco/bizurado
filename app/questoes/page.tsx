"use client";

import React, { useState } from "react";
import { useDb } from "@/lib/preparation/useDb";
import { getPlanId, getCurrentLayer } from "@/lib/preparation/cycle";
import { saveDb } from "@/lib/preparation/db";

export default function Questions() {
  const db = useDb();
  const planId = getPlanId();
  const activeSubjects = db.subjects.filter((s) => s.study_plan_id === planId && s.active);
  const currentLayer = getCurrentLayer();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(activeSubjects[0]?.id || "");
  const [qAula, setQAula] = useState("");
  const [qGroup, setQGroup] = useState<"A" | "B" | "C" | "D">("A");
  const [qQuestions, setQQuestions] = useState("");
  const [qCorrect, setQCorrect] = useState("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qQuestions || !qCorrect) return;

    db.questionLogs.push({
      id: `q_${Date.now()}`,
      user_id: db.studyPlans[0].user_id,
      subject_id: selectedSubject,
      material_unit_optional: qAula,
      layer: currentLayer,
      group: qGroup,
      questions: parseInt(qQuestions),
      correct: parseInt(qCorrect),
      date: new Date().toISOString(),
    });

    saveDb({ ...db });
    setIsModalOpen(false);
    setQAula("");
    setQQuestions("");
    setQCorrect("");
  };

  const getStats = (subjectId: string, group?: "A" | "B" | "C" | "D") => {
    const logs = db.questionLogs.filter(
      (l) => l.subject_id === subjectId && (group ? l.group === group : true)
    );

    if (logs.length === 0) return "—";

    const totalQ = logs.reduce((acc, l) => acc + l.questions, 0);
    const totalC = logs.reduce((acc, l) => acc + l.correct, 0);

    if (totalQ === 0) return "—";
    return `${Math.round((totalC / totalQ) * 100)}%`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">QUESTÕES</h1>
          <div className="text-slate-500 mt-1 text-sm">Desempenho por baterias</div>
        </div>
        <button
          onClick={() => {
            setSelectedSubject(activeSubjects[0]?.id || "");
            setIsModalOpen(true);
          }}
          className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          REGISTRAR QUESTÕES
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4 w-1/3">Matéria</th>
              <th className="p-4 text-center">Grupo A</th>
              <th className="p-4 text-center">Grupo B</th>
              <th className="p-4 text-center">Grupo C</th>
              <th className="p-4 text-center">Grupo D</th>
              <th className="p-4 text-center text-slate-800">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm font-medium">
            {activeSubjects.map((subject) => {
              const total = getStats(subject.id);
              return (
                <tr key={subject.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-slate-800">{subject.name}</td>
                  <td className="p-4 text-center text-slate-600">{getStats(subject.id, "A")}</td>
                  <td className="p-4 text-center text-slate-600">{getStats(subject.id, "B")}</td>
                  <td className="p-4 text-center text-slate-600">{getStats(subject.id, "C")}</td>
                  <td className="p-4 text-center text-slate-600">{getStats(subject.id, "D")}</td>
                  <td className="p-4 text-center font-bold text-slate-900">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 uppercase tracking-wider text-slate-900">Registrar Questões</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Matéria</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {activeSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Aula/Unidade (opcional)</label>
                <input
                  type="text"
                  value={qAula}
                  onChange={(e) => setQAula(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  placeholder="Ex: 05"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Grupo</label>
                  <select
                    value={qGroup}
                    onChange={(e) => setQGroup(e.target.value as any)}
                    className="w-full border border-slate-300 rounded p-2 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Questões</label>
                  <input
                    type="number"
                    value={qQuestions}
                    onChange={(e) => setQQuestions(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Acertos</label>
                  <input
                    type="number"
                    value={qCorrect}
                    onChange={(e) => setQCorrect(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="14"
                    required
                  />
                </div>
              </div>
              <div className="pt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 rounded font-medium text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded font-bold text-white bg-teal-700 hover:bg-teal-800"
                >
                  SALVAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
