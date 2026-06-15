"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type ReviewCard = {
  id: number;
  question: string;
  answer: string;
  bizu: string;
  source: string;
  tags: string;
  cardType: string;
  subjectName: string;
  topicName: string;
  stability: number;
  difficulty: number;
  reps: number;
};

function ReviewContent() {
  const params = useSearchParams();
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [filterSubject, setFilterSubject] = useState(params.get("subjectId") || "");
  const [filterTopic, setFilterTopic] = useState(params.get("topicId") || "");
  const [filterType, setFilterType] = useState(params.get("mode") || "due");
  const [stats, setStats] = useState({ total: 0, reviewed: 0 });
  const cardIdParam = params.get("cardId");

  const current = cards[index];

  const loadCards = useCallback(async () => {
    setLoading(true);

    const p = new URLSearchParams();
    if (cardIdParam) p.set("cardId", cardIdParam);
    if (filterSubject) p.set("subjectId", filterSubject);
    if (filterTopic) p.set("topicId", filterTopic);
    if (filterType) p.set("mode", filterType);
    p.set("limit", "30");

    const res = await fetch(`/api/review?${p}`);
    const data = await res.json();
    setCards(data.cards);
    setIndex(0);
    setFlipped(false);
    setDone(data.cards.length === 0);
    setLoading(false);
    setStats((s) => ({ ...s, total: data.cards.length }));
  }, [cardIdParam, filterSubject, filterTopic, filterType]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const advance = useCallback(async () => {
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      setFlipped(false);
    } else {
      await loadCards();
    }
  }, [index, cards.length, loadCards]);

  const handleRating = async (rating: number) => {
    if (!current) return;

    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: current.id, rating }),
    });

    setStats((s) => ({ ...s, reviewed: s.reviewed + 1 }));

    await advance();
  };

  const handleMarkMastered = async () => {
    if (!current) return;

    await fetch("/api/cards/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: current.id }),
    });

    await advance();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-xl">Carregando cards...</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-2xl font-semibold mb-2">Revisão concluída!</h2>
        <p className="text-slate-400 mb-6">
          {stats.reviewed > 0
            ? `${stats.reviewed} cards revisados nessa sessão.`
            : "Nenhum card pendente no momento."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={loadCards}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors"
          >
            Recarregar
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const difficultyColor =
    current.difficulty >= 7
      ? "text-red-400"
      : current.difficulty >= 4
        ? "text-yellow-400"
        : "text-green-400";

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-cyan-400 hover:underline text-sm">
            ← Dashboard
          </Link>
          {current && (
            <span className="text-xs text-slate-500 ml-2">
              {current.subjectName} &middot; {current.topicName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleMarkMastered}
            title="Suspende o card e avança"
            className="text-sm px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
          >
            ✓ Marcar dominado
          </button>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-700 text-sm px-3 py-1.5 rounded border border-slate-600"
          >
            <option value="due">Vencidos</option>
            <option value="all">Todos</option>
            <option value="new">Novos</option>
          </select>
          <span className="text-sm text-slate-400">
            {index + 1} / {cards.length}
          </span>
        </div>
      </header>

      <div
        onClick={() => setFlipped(!flipped)}
        className="cursor-pointer min-h-[60vh] flex flex-col"
      >
        <div className="text-xs text-slate-500 mb-2 space-x-2">
          <span>{current.subjectName}</span>
          <span>·</span>
          <span>{current.topicName}</span>
          <span>·</span>
          <span className={difficultyColor}>
            D: {current.difficulty.toFixed(1)}
          </span>
          {current.cardType === "questao" && (
            <>
              <span>·</span>
              <span className="text-purple-400">Questão</span>
            </>
          )}
          {current.bizu && (
            <>
              <span>·</span>
              <span className="text-yellow-400">Bizu</span>
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-800 rounded-xl border border-slate-700">
          {!flipped ? (
            <>
              <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider">
                Pergunta
              </p>
              <div
                className="text-xl md:text-2xl leading-relaxed"
                dangerouslySetInnerHTML={{ __html: current.question }}
              />
              <p className="text-sm text-slate-500 mt-8 animate-pulse">
                Clique para ver a resposta
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider">
                Resposta
              </p>
              <div
                className="text-lg md:text-xl leading-relaxed"
                dangerouslySetInnerHTML={{ __html: current.answer }}
              />
              {current.bizu && (
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-xs text-yellow-400 font-semibold mb-1">
                    BIZU
                  </p>
                  <p className="text-yellow-200 text-sm">{current.bizu}</p>
                </div>
              )}
              {current.source && (
                <p className="text-xs text-slate-500 mt-4 italic">
                  Fonte: {current.source}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {flipped && (
        <div className="flex gap-3 justify-center mt-6">
          <RatingButton
            label="Again"
            desc="Não lembrei"
            color="red"
            onClick={() => handleRating(1)}
          />
          <RatingButton
            label="Hard"
            desc="Difícil"
            color="yellow"
            onClick={() => handleRating(2)}
          />
          <RatingButton
            label="Good"
            desc="Lembrei"
            color="green"
            onClick={() => handleRating(3)}
          />
          <RatingButton
            label="Easy"
            desc="Fácil"
            color="cyan"
            onClick={() => handleRating(4)}
          />
        </div>
      )}

      {!flipped && (
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={() => setFlipped(true)}
            className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors"
          >
            Mostrar resposta
          </button>
          <button
            onClick={() => handleRating(1)}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
          >
            Pular
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-slate-400 text-xl">Carregando...</p></div>}>
      <ReviewContent />
    </Suspense>
  );
}

function RatingButton({
  label,
  desc,
  color,
  onClick,
}: {
  label: string;
  desc: string;
  color: string;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    red: "bg-red-500/20 hover:bg-red-500/40 border-red-500/50",
    yellow: "bg-yellow-500/20 hover:bg-yellow-500/40 border-yellow-500/50",
    green: "bg-green-500/20 hover:bg-green-500/40 border-green-500/50",
    cyan: "bg-cyan-500/20 hover:bg-cyan-500/40 border-cyan-500/50",
  };

  return (
    <button
      onClick={onClick}
      className={`flex-1 p-4 rounded-xl border ${colors[color]} transition-colors text-center`}
    >
      <p className="text-lg font-bold">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
    </button>
  );
}
