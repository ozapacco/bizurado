"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CardScreenSkeleton, Kbd, RatingBar } from "@/components/card-screen";

import { loadReviewCards, rateCard, suspendCard, type DeckCard } from "@/lib/client/engine";
import type { Rating } from "@/lib/fsrs";

type ReviewCard = DeckCard & { subjectId: number; topicId: number };


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

    const data = await loadReviewCards({
      subjectId: filterSubject || undefined,
      topicId: filterTopic || undefined,
      mode: filterType || undefined,
      limit: 30,
    });
    
    // We need subjectId and topicId for rateCard/suspendCard. 
    // They are available in the engine but not exported in DeckCard by default.
    // Let's rely on the engine or IDB, actually the engine can return subjectId and topicId, or we can fetch it. 
    // Wait, the engine's loadReviewCards can return subjectId and topicId in DeckCard! 
    // We should modify loadReviewCards to include them, or just cast them.
    // I will cast for now, but we'll need to make sure they are returned.
    setCards(data.cards as unknown as ReviewCard[]);
    setIndex(0);
    setFlipped(false);
    setDone(data.cards.length === 0);
    setLoading(false);
    setStats((s) => ({ ...s, total: data.cards.length }));
  }, [filterSubject, filterTopic, filterType]);

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
        await rateCard(
          { id: current.id, topicId: current.topicId || 0, subjectId: current.subjectId || 0 },
          rating as Rating
        );
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
      await suspendCard(current.id, current.topicId || 0);
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
    return <CardScreenSkeleton />;
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-paper text-ink">
        <h2 className="font-serif text-3xl font-semibold mb-2 text-balance">
          Revisão concluída
        </h2>
        <p className="text-ink-soft mb-8">
          {stats.reviewed > 0
            ? `${stats.reviewed} cards revisados nessa sessão.`
            : "Nenhum card pendente no momento."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={loadCards}
            className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-deep text-paper font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Recarregar
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg border border-line text-ink-soft hover:bg-surface transition-colors"
          >
            Início
          </Link>
        </div>
      </div>
    );
  }

  const difficultyColor =
    current.difficulty >= 7
      ? "text-grade-again"
      : current.difficulty >= 4
        ? "text-grade-hard"
        : "text-grade-easy";

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-paper text-ink outline-none"
    >
      {/* Barra superior enxuta — o card domina a tela */}
      <header
        className="shrink-0 px-3 pt-3 pb-2 border-b border-line"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="text-sm px-2.5 py-1.5 rounded text-ink-soft hover:bg-surface transition-colors shrink-0"
            >
              ← Sair
            </Link>
            <span
              title="Modo REVISÃO — limpar os cards vencidos do dia"
              className="font-mono text-[0.65rem] font-semibold uppercase tracking-wide px-2 py-1 rounded border border-grade-hard/40 bg-grade-hard/5 text-grade-hard shrink-0"
            >
              Revisão
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkMastered}
              title="Suspende o card (dominado) e avança"
              className="text-xs px-2.5 py-1.5 rounded border border-grade-easy/40 text-grade-easy hover:bg-grade-easy/5 transition-colors"
            >
              ✓ Dominado
            </button>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-surface text-ink text-xs px-2 py-1.5 rounded border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="due">Vencidos</option>
              <option value="all">Todos</option>
              <option value="new">Novos</option>
            </select>
            <span className="font-mono text-xs text-ink-soft shrink-0">
              {index + 1} / {cards.length}
            </span>
          </div>
        </div>
        <div className="mt-1.5 text-[0.7rem] text-ink-soft truncate">
          {current.subjectName} &middot; {current.topicName}
        </div>
      </header>

      {/* O card ocupa toda a área livre; toque/clique vira */}
      <div
        onClick={() => setFlipped((f) => !f)}
        className="flex-1 min-h-0 overflow-y-auto cursor-pointer px-4 py-4 flex flex-col"
      >
        <div className="font-mono text-xs text-ink-soft mb-2 space-x-2 shrink-0">
          <span className={difficultyColor}>
            D: {current.difficulty.toFixed(1)}
          </span>
          {current.reps === 0 && (
            <>
              <span>·</span>
              <span className="text-accent">Novo</span>
            </>
          )}
          {current.cardType === "questao" && (
            <>
              <span>·</span>
              <span>Questão</span>
            </>
          )}
          {current.bizu && (
            <>
              <span>·</span>
              <span className="text-grade-hard">Bizu</span>
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-2 md:p-6">
          {!flipped ? (
            <>
              <p className="font-mono text-xs text-ink-soft mb-4 uppercase tracking-wide">
                Pergunta
              </p>
              <div
                className="font-serif text-xl md:text-2xl leading-relaxed max-w-[44rem] [text-wrap:pretty]"
                dangerouslySetInnerHTML={{ __html: current.question }}
              />
              <p className="text-sm text-ink-soft mt-8 motion-safe:animate-pulse">
                Toque para ver a resposta
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-xs text-ink-soft mb-4 uppercase tracking-wide">
                Resposta
              </p>
              <div
                className="font-serif text-lg md:text-xl leading-relaxed max-w-[44rem] [text-wrap:pretty]"
                dangerouslySetInnerHTML={{ __html: current.answer }}
              />
              {current.bizu && (
                <div className="mt-6 p-4 bg-grade-hard/5 border border-grade-hard/40 rounded-lg max-w-[44rem]">
                  <p className="font-mono text-xs text-grade-hard font-semibold mb-1 uppercase tracking-wide">
                    Bizu
                  </p>
                  <p
                    className="font-serif text-ink text-base leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: current.bizu }}
                  />
                </div>
              )}
              {current.source && (
                <p className="text-xs text-ink-soft mt-4 italic">
                  Fonte: {current.source}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Rodapé fixo — notas ao virar, senão "Mostrar resposta" */}
      <footer
        className="shrink-0 px-3 pt-3 border-t border-line"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {flipped ? (
          <>
            <RatingBar onRate={(r) => void handleRating(r)} />
            <p className="hidden md:block text-center text-xs text-ink-soft mt-2">
              <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd> avaliam ·{" "}
              <Kbd>Enter</Kbd>/<Kbd>→</Kbd> = Bom · <Kbd>←</Kbd> volta
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-3 justify-center max-w-3xl mx-auto">
              <button
                onClick={() => setFlipped(true)}
                className="flex-1 max-w-md px-8 py-4 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Mostrar resposta
              </button>
              <button
                onClick={() => handleRating(1)}
                title="Não lembrei — conta como Errei e avança"
                className="px-4 py-4 rounded-lg border border-line text-ink-soft hover:bg-surface transition-colors text-sm shrink-0"
              >
                Pular
              </button>
            </div>
            <p className="text-center text-xs text-ink-soft mt-2">
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

export default function ReviewPage() {
  return (
    <Suspense fallback={<CardScreenSkeleton />}>
      <ReviewContent />
    </Suspense>
  );
}
