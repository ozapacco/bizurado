"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
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

  const overlayRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  // Live snapshot read by the (bind-once) keyboard handler — no stale closure.
  const kbdStateRef = useRef({ flipped, loading, done });
  kbdStateRef.current = { flipped, loading, done };

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

  // Step back one card to review it again (no rating is undone).
  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
    setFlipped(false);
  }, []);

  const handleRating = useCallback(
    async (rating: number) => {
      if (!current || busyRef.current) return; // guard double-fire (keys/clicks)
      busyRef.current = true;
      try {
        await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: current.id, rating }),
        });
        setStats((s) => ({ ...s, reviewed: s.reviewed + 1 }));
        await advance();
      } finally {
        busyRef.current = false;
      }
    },
    [current, advance]
  );

  const handleMarkMastered = useCallback(async () => {
    if (!current || busyRef.current) return;
    busyRef.current = true;
    try {
      await fetch("/api/cards/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.id }),
      });
      await advance();
    } finally {
      busyRef.current = false;
    }
  }, [current, advance]);

  const handleRatingRef = useRef(handleRating);
  handleRatingRef.current = handleRating;

  // Keyboard navigation. Bound ONCE (deps are stable) and read through refs, so
  // there is no stale-closure window. Layout:
  //   Espaço / Enter / ↑ / ↓ ...... vira a carta
  //   → (direita) ................... revela; se já virada, Good + avança
  //   ← (esquerda) ................. volta para a carta anterior
  //   1 / 2 / 3 / 4 ................ Again / Hard / Good / Easy (revela se preciso)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const { flipped: isFlipped, loading: isLoading, done: isDone } =
        kbdStateRef.current;
      if (isLoading || isDone) return;
      if (e.repeat) return;

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          if (isFlipped) void handleRatingRef.current(3);
          else setFlipped(true);
          break;
        case "ArrowUp":
        case "ArrowDown":
          e.preventDefault();
          setFlipped((f) => !f);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (isFlipped) void handleRatingRef.current(3);
          else setFlipped(true);
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          e.preventDefault();
          if (isFlipped) void handleRatingRef.current(Number(e.key));
          else setFlipped(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev]);

  // Foco no overlay ao entrar/trocar de card — tira o foco da busca global para
  // os atalhos de teclado responderem na hora.
  useEffect(() => {
    if (!loading && !done && current) overlayRef.current?.focus();
  }, [loading, done, current]);

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
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100 outline-none"
    >
      {/* Barra superior enxuta — o card domina a tela */}
      <header
        className="shrink-0 px-3 pt-3 pb-2 border-b border-slate-800/60"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="text-sm px-2.5 py-1.5 rounded text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
            >
              ← Sair
            </Link>
            <span
              title="Modo REVISÃO — limpar os cards vencidos do dia"
              className="text-[0.65rem] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0"
            >
              🔁 Revisão
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkMastered}
              title="Suspende o card (dominado) e avança"
              className="text-xs px-2.5 py-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
            >
              ✓ Dominado
            </button>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-800 text-xs px-2 py-1.5 rounded border border-slate-600"
            >
              <option value="due">Vencidos</option>
              <option value="all">Todos</option>
              <option value="new">Novos</option>
            </select>
            <span className="text-xs text-slate-400 shrink-0">
              {index + 1} / {cards.length}
            </span>
          </div>
        </div>
        <div className="mt-1.5 text-[0.7rem] text-slate-400 truncate">
          {current.subjectName} &middot; {current.topicName}
        </div>
      </header>

      {/* O card ocupa toda a área livre; toque/clique vira */}
      <div
        onClick={() => setFlipped((f) => !f)}
        className="flex-1 min-h-0 overflow-y-auto cursor-pointer px-4 py-4 flex flex-col"
      >
        <div className="text-xs text-slate-500 mb-2 space-x-2 shrink-0">
          <span className={difficultyColor}>
            D: {current.difficulty.toFixed(1)}
          </span>
          {current.reps === 0 && (
            <>
              <span>·</span>
              <span className="text-cyan-400">Novo</span>
            </>
          )}
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

        <div className="flex-1 flex flex-col items-center justify-center text-center p-2 md:p-6">
          {!flipped ? (
            <>
              <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider">
                Pergunta
              </p>
              <div
                className="text-xl md:text-3xl leading-relaxed max-w-2xl"
                dangerouslySetInnerHTML={{ __html: current.question }}
              />
              <p className="text-sm text-slate-500 mt-8 animate-pulse">
                Toque para ver a resposta
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider">
                Resposta
              </p>
              <div
                className="text-lg md:text-2xl leading-relaxed max-w-2xl"
                dangerouslySetInnerHTML={{ __html: current.answer }}
              />
              {current.bizu && (
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg max-w-2xl">
                  <p className="text-xs text-yellow-400 font-semibold mb-1">
                    BIZU
                  </p>
                  <p className="text-yellow-200 text-sm" dangerouslySetInnerHTML={{ __html: current.bizu }} />
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

      {/* Rodapé fixo — dificuldades ao virar, senão "Mostrar resposta" */}
      <footer
        className="shrink-0 px-3 pt-3 border-t border-slate-800/60"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {flipped ? (
          <>
            <div className="flex gap-2 md:gap-3 justify-center max-w-3xl mx-auto">
              <RatingButton label="Again" desc="Não lembrei" hotkey="1" color="red" onClick={() => handleRating(1)} />
              <RatingButton label="Hard" desc="Difícil" hotkey="2" color="yellow" onClick={() => handleRating(2)} />
              <RatingButton label="Good" desc="Lembrei" hotkey="3" color="green" onClick={() => handleRating(3)} />
              <RatingButton label="Easy" desc="Fácil" hotkey="4" color="cyan" onClick={() => handleRating(4)} />
            </div>
            <p className="hidden md:block text-center text-xs text-slate-500 mt-2">
              <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd> avaliam ·{" "}
              <Kbd>Enter</Kbd>/<Kbd>→</Kbd> = Good · <Kbd>←</Kbd> volta
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-3 justify-center max-w-3xl mx-auto">
              <button
                onClick={() => setFlipped(true)}
                className="flex-1 max-w-md px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors"
              >
                Mostrar resposta
              </button>
              <button
                onClick={() => handleRating(1)}
                title="Não lembrei — avança (Again)"
                className="px-4 py-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm shrink-0"
              >
                Pular
              </button>
            </div>
            <p className="text-center text-xs text-slate-500 mt-2">
              <span className="hidden md:inline">
                <Kbd>Espaço</Kbd> / <Kbd>Enter</Kbd> / <Kbd>↑</Kbd> viram ·{" "}
                <Kbd>←</Kbd> <Kbd>→</Kbd> navegam
              </span>
              <span className="md:hidden">Toque na carta para virar</span>
            </p>
          </>
        )}
      </footer>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-300 text-[0.7rem] font-mono leading-none">
      {children}
    </kbd>
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
  hotkey,
  onClick,
}: {
  label: string;
  desc: string;
  color: string;
  hotkey: string;
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
      className={`flex-1 p-3 md:p-4 rounded-xl border ${colors[color]} transition-colors text-center`}
    >
      <span className="hidden md:inline-block float-left text-[0.7rem] text-slate-500 font-mono border border-slate-600 rounded px-1 leading-tight">
        {hotkey}
      </span>
      <p className="text-base md:text-lg font-bold">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
    </button>
  );
}
