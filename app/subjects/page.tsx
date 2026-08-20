"use client";

import { Suspense, useEffect, useState } from "react";
import FlashcardsNav from "@/components/FlashcardsNav";
import { matchTopicDecks } from "@/lib/subjectMatch";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { getStatsData, getSubjectTopics, type SubjectTopicOut as Topic } from "@/lib/client/engine";

type Subject = {
  id: number;
  name: string;
  cardCount: number;
};

function SubjectsContent() {
  const searchParams = useSearchParams();
  const selectedName = searchParams.get("name");
  // Filtro por assunto do ciclo: entra por aqui quem clicou em "ver todos os
  // baralhos deste assunto" e precisa da lista recortada, não dos 39 achatados.
  const assunto = searchParams.get("assunto");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  // null = ainda carregando; [] = disciplina sem baralho.
  const [topics, setTopics] = useState<Topic[] | null>(null);

  useEffect(() => {
    getStatsData().then((data) => {
      if (data.subjects) setSubjects(data.subjects as Subject[]); // StatsData subjects don't have id but it's not strictly needed for rendering. Actually let's use as Subject[]. Wait, we can map to add id.
    });
  }, []);

  useEffect(() => {
    // Limpar antes de buscar: sem isso, uma disciplina sem baralho mantinha na
    // tela os baralhos da disciplina anterior, com links que levavam para outra
    // matéria sob o título errado.
    setTopics(null);
    if (!selectedName) return;
    let cancelled = false;
    getSubjectTopics(selectedName).then((data) => {
      if (!cancelled) setTopics(data?.topics ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedName]);

  // Recorte pelo assunto do ciclo, usando a mesma ponte do resto do app.
  const visibleTopics = assunto && topics ? matchTopicDecks(assunto, topics) : (topics ?? []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Flashcards</h1>
      </header>

      <FlashcardsNav />

      {!selectedName && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((s) => (
            <Link
              key={s.name}
              href={`/subjects?name=${encodeURIComponent(s.name)}`}
              className="p-5 bg-surface rounded-xl border border-line hover:bg-line/40 transition-colors"
            >
              <p className="text-lg font-semibold">{s.name}</p>
              <p className="text-sm text-ink-soft mt-2">{s.cardCount} cards</p>
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
              className="px-4 py-2 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg transition-colors text-sm"
            >
              Revisar disciplina
            </Link>
            <Link
              href="/subjects"
              className="px-4 py-2 bg-line/60 hover:bg-line/60 rounded-lg transition-colors text-sm"
            >
              Voltar
            </Link>
          </div>

          {assunto && (
            <p className="text-sm text-ink-soft mb-4">
              Mostrando os baralhos de <strong className="text-ink">{assunto}</strong>.{" "}
              <Link href={`/subjects?name=${encodeURIComponent(selectedName)}`} className="text-accent hover:underline">
                ver todos da disciplina
              </Link>
            </p>
          )}
          {topics === null && <p className="text-ink-soft">Carregando baralhos…</p>}
          {topics?.length === 0 && (
            <p className="text-ink-soft">Esta disciplina ainda não tem baralho de flashcards.</p>
          )}
          {topics !== null && topics.length > 0 && visibleTopics.length === 0 && (
            <p className="text-ink-soft">Nenhum baralho cobre este assunto.</p>
          )}

          <div className="space-y-2">
            {visibleTopics.map((t) => {
              const memoriaPct =
                t.cardCount > 0
                  ? Math.round((t.maduros / t.cardCount) * 100)
                  : 0;
              return (
                <div
                  key={t.id}
                  className="p-4 bg-surface rounded-lg border border-line"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm">
                        <span
                          className="inline-flex items-center gap-1 font-semibold text-accent"
                          title="Quantas vezes você girou este baralho inteiro"
                        >
                          🔁 {t.voltas} {t.voltas === 1 ? "volta" : "voltas"}
                        </span>
                        <span className="text-ink-soft">·</span>
                        <span className="text-ink-soft">{t.cardCount} cards</span>
                        {t.dueNow > 0 && (
                          <>
                            <span className="text-ink-soft">·</span>
                            <span className="text-grade-hard">
                              {t.dueNow} para reativar
                            </span>
                          </>
                        )}
                        {t.novos > 0 && (
                          <>
                            <span className="text-ink-soft">·</span>
                            <span className="text-ink-soft">{t.novos} novos</span>
                          </>
                        )}
                        <span className="text-ink-soft">·</span>
                        <span className="text-grade-easy">
                          {memoriaPct}% na memória
                        </span>
                      </div>
                      {/* Barra de memória do baralho */}
                      <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-line/60 overflow-hidden">
                        <div
                          className="h-full bg-grade-easy"
                          style={{ width: `${memoriaPct}%` }}
                        />
                      </div>
                    </div>
                    <Link
                      href={`/study?topicId=${t.id}`}
                      className="shrink-0 px-3 py-1.5 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg text-sm transition-colors"
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
    <Suspense fallback={<div className="p-6 text-ink-soft">Carregando...</div>}>
      <SubjectsContent />
    </Suspense>
  );
}
