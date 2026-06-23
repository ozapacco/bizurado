"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

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
  subjectName: string;
  voltas: number;
  total: number;
};

type NextDeck = {
  topicId: number;
  topicName: string;
  subjectName: string;
  priority: number;
  dueNow: number;
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
  const sessionIdRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Live snapshot read by the (bind-once) keyboard handler. Updated on every
  // render so the listener never sees a stale `flipped`/`loading`/`done`.
  const kbdStateRef = useRef({ flipped, loading, done });
  kbdStateRef.current = { flipped, loading, done };

  const current = cards[index];

  // Load the whole deck (single pass) and open a timed session.
  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/study/deck?topicId=${topicId}`);
      const data = await res.json();
      if (cancelled) return;
      setDeck(data.deck);
      setCards(data.cards ?? []);
      setIndex(0);
      setFlipped(false);
      setReviewed(0);
      setDone((data.cards ?? []).length === 0);
      setLoading(false);

      // Start the topic session (timer + rep). Fire-and-remember the id.
      fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: Number(topicId) }),
      })
        .then((r) => r.json())
        .then((s) => {
          if (!cancelled) sessionIdRef.current = s.sessionId ?? null;
        })
        .catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  // Close the volta: finish the session (graduates the cycle, +1 volta) and ask
  // the Trilha rotation for the next topic — fair round-robin across disciplines
  // (least-recently-studied first), excluding the one just finished.
  const finishVolta = useCallback(async () => {
    setDone(true);
    try {
      const body = sessionIdRef.current
        ? { sessionId: sessionIdRef.current }
        : { topicId: Number(topicId) };
      await fetch("/api/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // ignore — the pass still counts visually
    }
    try {
      const res = await fetch(`/api/cycle/next?excludeTopicId=${topicId}`);
      const data = await res.json();
      setNextDeck(data.next ?? null);
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

  // Rate a card (records the review + reschedules via FSRS), then advance.
  // Single pass: even "rapido" cards are rated, so a moment of doubt (Again/
  // Hard) instantly demotes a mature card back into the common flow.
  const handleRating = useCallback(
    (rating: number) => {
      if (!current) return;
      fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.id, rating }),
      }).catch(() => {});
      setReviewed((n) => n + 1);
      advance();
    },
    [current, advance]
  );

  const handleRatingRef = useRef(handleRating);
  handleRatingRef.current = handleRating;

  const handleMarkMastered = useCallback(() => {
    if (!current) return;
    fetch("/api/cards/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: current.id }),
    }).catch(() => {});
    advance();
  }, [current, advance]);

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
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <p className="text-slate-400 mb-4">Nenhum baralho selecionado.</p>
        <Link href="/subjects" className="text-cyan-400 hover:underline">
          Escolher um baralho
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-xl">Abrindo o baralho...</p>
      </div>
    );
  }

  if (done) {
    const newVoltas = (deck?.voltas ?? 0) + (reviewed > 0 ? 1 : 0);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-6xl mb-4">🔁</p>
        <h2 className="text-2xl font-semibold mb-1">
          {reviewed > 0 ? "Volta concluída!" : "Nada para girar agora"}
        </h2>
        {deck && reviewed > 0 && (
          <p className="text-slate-300 mb-1">
            {deck.subjectName} · {deck.topicName}
          </p>
        )}
        {reviewed > 0 && (
          <p className="text-cyan-300 font-semibold mb-6">
            🔁 {newVoltas}ª volta · {reviewed} cards girados
          </p>
        )}

        {nextDeck ? (
          <>
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">
              Gira para · {nextDeck.subjectName}
            </p>
            <button
              onClick={() => {
                router.push(`/study?topicId=${nextDeck.topicId}`);
              }}
              className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors"
            >
              {nextDeck.topicName} →
            </button>
            <p className="text-xs text-slate-500 mt-2">
              <Kbd>Enter</Kbd> para emendar
            </p>
          </>
        ) : (
          <p className="text-slate-400 mb-6">
            🏁 Você varreu tudo que tinha de novo. Hora de revisar e deixar
            amadurecer.
          </p>
        )}

        <div className="flex gap-3 mt-4">
          <Link
            href="/cycle"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            🗺️ Mapa
          </Link>
          <Link
            href="/subjects"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Baralhos
          </Link>
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

  if (!current) return null;

  const isFast = current.mode === "rapido";
  const difficultyColor =
    current.difficulty >= 7
      ? "text-red-400"
      : current.difficulty >= 4
        ? "text-yellow-400"
        : "text-green-400";
  const progressPct = deck ? Math.round(((index + 1) / deck.total) * 100) : 0;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100 outline-none"
    >
      {/* Barra superior enxuta — só o essencial, para o card dominar a tela */}
      <header
        className="shrink-0 px-3 pt-3 pb-2 border-b border-slate-800/60"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push("/subjects")}
              title="Sair do estudo"
              className="text-sm px-2.5 py-1.5 rounded text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
            >
              ← Sair
            </button>
            <span
              title="Modo ESTUDO — avançar pela matéria, baralho inteiro"
              className="text-[0.65rem] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0"
            >
              📚 Estudo
            </span>
          </div>
          <div className="flex items-center gap-2">
            {deck && (
              <span className="text-sm text-cyan-300 font-semibold" title={`${deck.voltas} voltas`}>
                🔁 {deck.voltas}
              </span>
            )}
            <button
              onClick={handleMarkMastered}
              title="Tira o card do baralho (dominado) e avança"
              className="text-xs px-2.5 py-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
            >
              ✓ Dominado
            </button>
            <button
              onClick={() => void finishVolta()}
              className="text-xs px-2.5 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Encerrar
            </button>
          </div>
        </div>

        {/* Progresso nesta volta */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-[0.7rem] text-slate-400 mb-1">
            <span className="truncate pr-2">
              {deck?.subjectName} · {deck?.topicName}
            </span>
            <span className="shrink-0">
              {index + 1} / {deck?.total}
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-cyan-400/80 transition-all"
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
        <div className="text-xs text-slate-500 mb-2 space-x-2 shrink-0">
          <span className={difficultyColor}>D: {current.difficulty.toFixed(1)}</span>
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
          {isFast && (
            <>
              <span>·</span>
              <span className="text-emerald-300">⚡ Rápido</span>
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
                  <p className="text-xs text-yellow-400 font-semibold mb-1">BIZU</p>
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
              {isFast && (
                <button
                  onClick={() => handleRating(3)}
                  title="Confirma que ainda sabe e avança"
                  className="px-6 py-4 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/50 rounded-lg transition-colors text-sm font-semibold shrink-0"
                >
                  ⚡ Sei
                </button>
              )}
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

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-slate-400 text-xl">Carregando...</p>
        </div>
      }
    >
      <StudyContent />
    </Suspense>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-300 text-[0.7rem] font-mono leading-none">
      {children}
    </kbd>
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
