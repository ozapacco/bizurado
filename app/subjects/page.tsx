"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Subject = {
  id: number;
  name: string;
  cardCount: number;
};

type Topic = {
  id: number;
  name: string;
  cardCount: number;
  filePath: string;
  voltas: number;
  dueNow: number;
  novos: number;
  maduros: number;
};

function SubjectsContent() {
  const searchParams = useSearchParams();
  const selectedName = searchParams.get("name");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.subjects) setSubjects(data.subjects);
      });
  }, []);

  useEffect(() => {
    if (selectedName) {
      fetch(`/api/subjects?name=${encodeURIComponent(selectedName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.topics) setTopics(data.topics);
        });
    }
  }, [selectedName]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-cyan-400 hover:underline text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Disciplinas</h1>
      </header>

      {!selectedName && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((s) => (
            <Link
              key={s.name}
              href={`/subjects?name=${encodeURIComponent(s.name)}`}
              className="p-5 bg-slate-800 rounded-xl border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              <p className="text-lg font-semibold">{s.name}</p>
              <p className="text-sm text-slate-400 mt-2">{s.cardCount} cards</p>
            </Link>
          ))}
        </div>
      )}

      {selectedName && (
        <div>
          <h2 className="text-xl font-semibold mb-4">{selectedName}</h2>
          <div className="flex gap-3 mb-6">
            <Link
              href={`/review?subjectId=${encodeURIComponent(selectedName)}`}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors text-sm"
            >
              Revisar disciplina
            </Link>
            <Link
              href="/subjects"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
            >
              Voltar
            </Link>
          </div>

          {topics.length === 0 && (
            <p className="text-slate-500">Nenhum tópico encontrado.</p>
          )}

          <div className="space-y-2">
            {topics.map((t) => {
              const memoriaPct =
                t.cardCount > 0
                  ? Math.round((t.maduros / t.cardCount) * 100)
                  : 0;
              return (
                <div
                  key={t.id}
                  className="p-4 bg-slate-800 rounded-lg border border-slate-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm">
                        <span
                          className="inline-flex items-center gap-1 font-semibold text-cyan-300"
                          title="Quantas vezes você girou este baralho inteiro"
                        >
                          🔁 {t.voltas} {t.voltas === 1 ? "volta" : "voltas"}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{t.cardCount} cards</span>
                        {t.dueNow > 0 && (
                          <>
                            <span className="text-slate-500">·</span>
                            <span className="text-amber-300">
                              {t.dueNow} para reativar
                            </span>
                          </>
                        )}
                        {t.novos > 0 && (
                          <>
                            <span className="text-slate-500">·</span>
                            <span className="text-slate-400">{t.novos} novos</span>
                          </>
                        )}
                        <span className="text-slate-500">·</span>
                        <span className="text-emerald-300">
                          {memoriaPct}% na memória
                        </span>
                      </div>
                      {/* Barra de memória do baralho */}
                      <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400/80"
                          style={{ width: `${memoriaPct}%` }}
                        />
                      </div>
                    </div>
                    <Link
                      href={`/study?topicId=${t.id}`}
                      className="shrink-0 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg text-sm transition-colors"
                    >
                      Estudar
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Carregando...</div>}>
      <SubjectsContent />
    </Suspense>
  );
}
