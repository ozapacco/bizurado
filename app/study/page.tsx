"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CardScreenSkeleton, Kbd, RatingBar } from "@/components/card-screen";
import {
  finishVolta as engineFinishVolta,
  loadDeck,
  nextDeck as engineNextDeck,
  rateCard,
  suspendCard,
} from "@/lib/client/engine";
import type { Rating } from "@/lib/fsrs";

type StudyCard = {
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
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  mode: "rapido" | "normal";
};

type Deck = {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  voltas: number;
  total: number;
};

type NextDeck = {
  topicId: number;
  topicName: string;
  subjectName: string;
  priority: number;
  novos: number;
} | null;

function StudyContent() {
  const params = useSearchParams();
  const router = useRouter();
  const topicId = params.get("topicId");

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [nextDeck, setNextDeck] = useState<NextDeck>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Live snapshot read by the (bind-once) keyboard handler. Updated on every
  // render so the listener never sees a stale `flipped`/`loading`/`done`.
  const kbdStateRef = useRef({ flipped, loading, done });
  kbdStateRef.current = { flipped, loading, done };

  const current = cards[index];

  // Load the whole deck (single pass) from the local-first engine.
  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await loadDeck(Number(topicId));
        if (cancelled) return;
        setDeck(data.deck);
        setCards(data.cards as unknown as StudyCard[]);
        setIndex(0);
        setFlipped(false);
        setReviewed(0);
        setDone(data.cards.length === 0);
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  // Close the volta locally (graduates the cycle, +1 volta) and ask the Trilha
  // rotation for the next topic — fair round-robin across disciplines
  // (least-recently-studied first), excluding the one just finished.
  const finishVolta = useCallback(async () => {
    setDone(true);
    try {
      await engineFinishVolta(Number(topicId));
    } catch {
      // ignore — the pass still counts visually
    }
    try {
      const next = await engineNextDeck(Number(topicId));
      setNextDeck(next);
    } catch {
      setNextDeck(null);
    }
  }, [topicId]);

  const advance = useCallback(() => {
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      setFlipped(false);
    } else {
      void finishVolta();
    }
  }, [index, cards.length, finishVolta]);

  // Step back one card to review it again (no rating is undone). Stable so the
  // keyboard effect can bind once.
  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
    setFlipped(false);
  }, []);

  // Rate a card (records the review + reschedules via FSRS, tudo local), then
  // advance. Single pass: even "rapido" cards are rated, so a moment of doubt
  // (Again/Hard) instantly demotes a mature card back into the common flow.
  const handleRating = useCallback(
    (rating: number) => {
      if (!current || !deck) return;
      rateCard(
        { id: current.id, topicId: deck.topicId, subjectId: deck.subjectId },
        rating as Rating
      ).catch(() => {});
      setReviewed((n) => n + 1);
      advance();
    },
    [current, deck, advance]
  );

  const handleRatingRef = useRef(handleRating);
  handleRatingRef.current = handleRating;

  const handleMarkMastered = useCallback(() => {
    if (!current || !deck) return;
    suspendCard(current.id, deck.topicId).catch(() => {});
    advance();
  }, [current, deck, advance]);

  // Keyboard navigation. Bound ONCE (deps are all stable refs/callbacks) so the
  // listener is never torn down and re-added mid-session — every press is read
  // through refs, so there is no stale-closure window. Layout:
  //   Espaço / Enter / ↑ / ↓ ...... vira a carta (e ao virar, vira de volta)
  //   → (direita) ................... revela; se já virada, Good + avança
  //   ← (esquerda) ................. volta para a carta anterior
  //   1 / 2 / 3 / 4 ................ Again / Hard / Good / Easy (revela se preciso)
  // Toque na tela vira a carta no celular (onClick na carta).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // don't hijack shortcuts

      const { flipped: isFlipped, loading: isLoading, done: isDone } =
        kbdStateRef.current;
      if (isLoading || isDone) return;
      if (e.repeat) return;

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          if (isFlipped) handleRatingRef.current(3);
          else setFlipped(true);
          break;
        case "ArrowUp":
        case "ArrowDown":
          e.preventDefault();
          setFlipped((f) => !f);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (isFlipped) handleRatingRef.current(3);
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
          // Revela primeiro se ainda não virou — a próxima tecla avalia.
          if (isFlipped) handleRatingRef.current(Number(e.key));
          else setFlipped(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev]);

  // Ao entrar no card (ou trocar de card), joga o foco no overlay de estudo —
  // tira o foco da busca global do topo para os atalhos responderem na hora.
  useEffect(() => {
    if (!loading && !done && current) overlayRef.current?.focus();
  }, [loading, done, current]);

  // Na tela de conclusão, Enter/Espaço emenda direto no próximo tópico da
  // rotação — "avançar e avançar" sem tirar a mão do teclado.
  useEffect(() => {
    if (!done || !nextDeck) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        router.push(`/study?topicId=${nextDeck.topicId}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, nextDeck, router]);

  if (!topicId) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-paper text-ink">
        <p className="text-ink-soft mb-4">Nenhum baralho selecionado.</p>
        <Link
          href="/subjects"
          className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-deep text-paper font-semibold transition-colors"
        >
          Escolher um baralho
        </Link>
      </div>
    );
  }

  if (loading) {
    return <CardScreenSkeleton />;
  }

  if (done) {
    const newVoltas = (deck?.voltas ?? 0) + (reviewed > 0 ? 1 : 0);
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-paper text-ink">
        <h2 className="font-serif text-3xl font-semibold mb-2 text-balance">
          {reviewed > 0 ? "Volta concluída" : "Nada para girar agora"}
        </h2>
        {deck && reviewed > 0 && (
          <p className="text-ink-soft mb-1">
            {deck.subjectName} · {deck.topicName}
          </p>
        )}
        {reviewed > 0 && (
          <p className="font-mono text-accent font-semibold mb-8">
            {newVoltas}ª volta · {reviewed} cards girados
          </p>
        )}

        {nextDeck ? (
          <>
            <p className="font-mono text-xs text-ink-soft mb-2 uppercase tracking-wide">
              A seguir · {nextDeck.subjectName}
            </p>
            <button
              onClick={() => {
                router.push(`/study?topicId=${nextDeck.topicId}`);
              }}
              className="px-6 py-3 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {nextDeck.topicName} →
            </button>
            <p className="text-xs text-ink-soft mt-3">
              <Kbd>Enter</Kbd> para emendar
            </p>
          </>
        ) : (
          <p className="text-ink-soft mb-6 max-w-md">
            Você varreu tudo que tinha de novo. Hora de revisar e deixar
            amadurecer.
          </p>
        )}

        <div className="flex gap-3 mt-8">
          <Link
            href="/cycle"
            className="px-5 py-2.5 rounded-lg border border-line text-ink-soft hover:bg-surface transition-colors"
          >
            Trilha
          </Link>
          <Link
            href="/subjects"
            className="px-5 py-2.5 rounded-lg border border-line text-ink-soft hover:bg-surface transition-colors"
          >
            Baralhos
          </Link>
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

  if (!current) return null;

  const isFast = current.mode === "rapido";
  const difficultyColor =
    current.difficulty >= 7
      ? "text-grade-again"
      : current.difficulty >= 4
        ? "text-grade-hard"
        : "text-grade-easy";
  const progressPct = deck ? Math.round(((index + 1) / deck.total) * 100) : 0;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-paper text-ink outline-none"
    >
      {/* Barra superior enxuta — só o essencial, para o card dominar a tela */}
      <header
        className="shrink-0 px-3 pt-3 pb-2 border-b border-line"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push("/subjects")}
              title="Sair do estudo"
              className="text-sm px-2.5 py-1.5 rounded text-ink-soft hover:bg-surface transition-colors shrink-0"
            >
              ← Sair
            </button>
            <span
              title="Modo ESTUDO — avançar pela matéria, baralho inteiro"
              className="font-mono text-[0.65rem] font-semibold uppercase tracking-wide px-2 py-1 rounded border border-accent/30 bg-accent/5 text-accent shrink-0"
            >
              Estudo
            </span>
          </div>
          <div className="flex items-center gap-2">
            {deck && (
              <span
                className="font-mono text-sm text-accent font-semibold"
                title={`${deck.voltas} voltas neste baralho`}
              >
                Volta {deck.voltas}
              </span>
            )}
            <button
              onClick={handleMarkMastered}
              title="Tira o card do baralho (dominado) e avança"
              className="text-xs px-2.5 py-1.5 rounded border border-grade-easy/40 text-grade-easy hover:bg-grade-easy/5 transition-colors"
            >
              ✓ Dominado
            </button>
            <button
              onClick={() => void finishVolta()}
              className="text-xs px-2.5 py-1.5 rounded border border-line text-ink-soft hover:bg-surface transition-colors"
            >
              Encerrar
            </button>
          </div>
        </div>

        {/* Progresso nesta volta */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-[0.7rem] text-ink-soft mb-1">
            <span className="truncate pr-2">
              {deck?.subjectName} · {deck?.topicName}
            </span>
            <span className="shrink-0 font-mono">
              {index + 1} / {deck?.total}
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-line overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* O card ocupa toda a área livre; toque/clique vira */}
      <div
        onClick={() => setFlipped((f) => !f)}
        className="flex-1 min-h-0 overflow-y-auto cursor-pointer px-4 py-4 flex flex-col"
      >
        <div className="font-mono text-xs text-ink-soft mb-2 space-x-2 shrink-0">
          <span className={difficultyColor}>D: {current.difficulty.toFixed(1)}</span>
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
          {isFast && (
            <>
              <span>·</span>
              <span className="text-grade-easy">Rápido</span>
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
            <RatingBar onRate={handleRating} />
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
              {isFast && (
                <button
                  onClick={() => handleRating(3)}
                  title="Confirma que ainda sabe e avança"
                  className="px-6 py-4 rounded-lg border border-grade-easy/50 text-grade-easy hover:bg-grade-easy/5 transition-colors text-sm font-semibold shrink-0"
                >
                  Ainda sei
                </button>
              )}
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

export default function StudyPage() {
  return (
    <Suspense fallback={<CardScreenSkeleton />}>
      <StudyContent />
    </Suspense>
  );
}
