"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Kind = "novo" | "revisao";

interface TopicStudy {
  study_count: number;
  interval_days: number;
  status: string;
  due: string | null;
  avg_minutes: number | null;
}

interface PlanItem {
  position: number;
  topicId: number;
  subjectName: string;
  topicName: string;
  kind: Kind;
  estMinutes: number;
  priority: number;
  studyCount: number;
  done: boolean;
}

interface PlanResponse {
  day: string;
  budgetMinutes: number;
  totalEstMinutes: number;
  disciplinas: number;
  items: PlanItem[];
}

// Local runtime state layered on top of each plan item.
interface ItemState {
  sessionId: number | null;
  startedAt: string | null; // ISO
  elapsed: number; // seconds, derived from startedAt while running
  finishing: boolean;
  measuredMinutes: number | null;
  nextStudy: TopicStudy | null;
  error: string | null;
}

function emptyItemState(): ItemState {
  return {
    sessionId: null,
    startedAt: null,
    elapsed: 0,
    finishing: false,
    measuredMinutes: null,
    nextStudy: null,
    error: null,
  };
}

// Format an ISO / YYYY-MM-DD string to DD/MM.
function formatDayMonth(value: string | null): string {
  if (!value) return "";
  const datePart = value.slice(0, 10); // YYYY-MM-DD
  const parts = datePart.split("-");
  if (parts.length !== 3) return value;
  const [, mm, dd] = parts;
  return `${dd}/${mm}`;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number>(90);
  const [generating, setGenerating] = useState(false);

  // Per-item runtime state keyed by topicId.
  const [itemStates, setItemStates] = useState<Record<number, ItemState>>({});

  // Tick to recompute elapsed times for any running timers.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function getItemState(topicId: number): ItemState {
    return itemStates[topicId] ?? emptyItemState();
  }

  function patchItemState(topicId: number, patch: Partial<ItemState>) {
    setItemStates((prev) => ({
      ...prev,
      [topicId]: { ...(prev[topicId] ?? emptyItemState()), ...patch },
    }));
  }

  // Single global interval: while any item has a running timer, recompute its elapsed.
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setItemStates((prev) => {
        let changed = false;
        const next: Record<number, ItemState> = { ...prev };
        for (const key of Object.keys(prev)) {
          const id = Number(key);
          const st = prev[id];
          if (st.startedAt && !st.measuredMinutes && !st.finishing) {
            const elapsed = Math.floor(
              (Date.now() - new Date(st.startedAt).getTime()) / 1000
            );
            if (elapsed !== st.elapsed) {
              next[id] = { ...st, elapsed };
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  async function loadInitial() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan");
      if (!res.ok) throw new Error(`Falha ao carregar plano (${res.status})`);
      const data: PlanResponse = await res.json();
      setPlan(data);
      if (data.budgetMinutes) setMinutes(data.budgetMinutes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o plano.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
  }, []);

  async function generatePlan(regenerate: boolean) {
    setGenerating(true);
    setError(null);
    try {
      const m = Number.isFinite(minutes) && minutes > 0 ? minutes : 90;
      const url = `/api/plan?minutes=${m}${regenerate ? "&regenerate=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Falha ao gerar plano (${res.status})`);
      const data: PlanResponse = await res.json();
      setPlan(data);
      // Clear any stale per-item runtime state on regenerate.
      setItemStates({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar o plano.");
    } finally {
      setGenerating(false);
    }
  }

  async function startSession(item: PlanItem) {
    patchItemState(item.topicId, { error: null });
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: item.topicId }),
      });
      if (!res.ok) throw new Error(`Falha ao iniciar (${res.status})`);
      const data: { sessionId: number; topicId: number; startedAt: string } =
        await res.json();
      const elapsed = Math.floor(
        (Date.now() - new Date(data.startedAt).getTime()) / 1000
      );
      patchItemState(item.topicId, {
        sessionId: data.sessionId,
        startedAt: data.startedAt,
        elapsed: elapsed >= 0 ? elapsed : 0,
        measuredMinutes: null,
        nextStudy: null,
      });
    } catch (e) {
      patchItemState(item.topicId, {
        error: e instanceof Error ? e.message : "Erro ao iniciar a sessão.",
      });
    }
  }

  function markItemDone(topicId: number) {
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.topicId === topicId ? { ...it, done: true } : it
            ),
          }
        : prev
    );
  }

  async function finishSession(item: PlanItem) {
    const st = getItemState(item.topicId);
    patchItemState(item.topicId, { finishing: true, error: null });
    try {
      const body = st.sessionId
        ? { sessionId: st.sessionId }
        : { topicId: item.topicId };
      const res = await fetch("/api/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Falha ao concluir (${res.status})`);
      const data: {
        topicId: number;
        minutes: number;
        topicStudy: TopicStudy;
      } = await res.json();
      patchItemState(item.topicId, {
        finishing: false,
        measuredMinutes: data.minutes,
        nextStudy: data.topicStudy,
        startedAt: null,
      });
      markItemDone(item.topicId);
    } catch (e) {
      patchItemState(item.topicId, {
        finishing: false,
        error: e instanceof Error ? e.message : "Erro ao concluir.",
      });
    }
  }

  async function completeWithoutTimer(item: PlanItem) {
    patchItemState(item.topicId, { finishing: true, error: null });
    try {
      const res = await fetch("/api/plan/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: item.topicId }),
      });
      if (!res.ok) throw new Error(`Falha ao concluir (${res.status})`);
      const data: { topicId: number; topicStudy: TopicStudy } =
        await res.json();
      patchItemState(item.topicId, {
        finishing: false,
        measuredMinutes: 0,
        nextStudy: data.topicStudy,
        startedAt: null,
      });
      markItemDone(item.topicId);
    } catch (e) {
      patchItemState(item.topicId, {
        finishing: false,
        error: e instanceof Error ? e.message : "Erro ao concluir.",
      });
    }
  }

  async function setPriority(item: PlanItem, priority: number) {
    // Optimistic local update.
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.topicId === item.topicId ? { ...it, priority } : it
            ),
          }
        : prev
    );
    try {
      const res = await fetch("/api/topics/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: item.topicId, priority }),
      });
      if (!res.ok) throw new Error("priority");
    } catch {
      patchItemState(item.topicId, {
        error: "Não foi possível salvar a prioridade.",
      });
    }
  }

  const hasPlan = !!plan && plan.items.length > 0;
  const completed = plan ? plan.items.filter((i) => i.done).length : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ink-soft text-xl">Carregando plano...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-accent hover:underline text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Plano de Hoje</h1>
        {hasPlan && plan && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-ink-soft">
            <span>{plan.day}</span>
            <span>·</span>
            <span>
              ≈{plan.totalEstMinutes}/{plan.budgetMinutes} min
            </span>
            <span>·</span>
            <span>
              {plan.disciplinas}{" "}
              {plan.disciplinas === 1 ? "disciplina" : "disciplinas"}
            </span>
            <span>·</span>
            <span className="text-ink-soft">
              {completed}/{plan.items.length} cumpridos
            </span>
          </div>
        )}
      </header>

      {/* Budget control */}
      <div className="bg-surface border border-line rounded-xl p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink-soft mb-1">
            Minutos disponíveis hoje
          </label>
          <input
            type="number"
            min={1}
            value={Number.isFinite(minutes) ? minutes : ""}
            onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
            className="w-28 bg-paper border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => generatePlan(hasPlan)}
          disabled={generating}
          className="px-5 py-2 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {generating
            ? "Gerando..."
            : hasPlan
              ? "Refazer plano"
              : "Gerar plano"}
        </button>
      </div>

      {error && (
        <div className="bg-grade-again/10 border border-grade-again/40 text-grade-again rounded-lg p-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Empty: no plan generated yet */}
      {!hasPlan && !error && (
        <div className="bg-surface border border-line rounded-xl p-10 text-center">
          <p className="text-5xl mb-4">🗓️</p>
          <h2 className="text-xl font-semibold mb-2">
            {plan && plan.items.length === 0
              ? "Nada para estudar hoje 🎉"
              : "Nenhum plano ainda"}
          </h2>
          <p className="text-ink-soft">
            {plan && plan.items.length === 0
              ? "Não há tópicos candidatos no momento."
              : "Informe quantos minutos você tem e gere o plano do dia."}
          </p>
        </div>
      )}

      {/* Plan items */}
      {hasPlan && plan && (
        <div className="space-y-3">
          {[...plan.items]
            .sort((a, b) => a.position - b.position)
            .map((item) => {
              const st = getItemState(item.topicId);
              const running = !!st.startedAt && !st.measuredMinutes;
              return (
                <div
                  key={item.topicId}
                  className={`bg-surface border border-line rounded-xl p-4 ${
                    item.done ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-ink-soft font-mono text-sm pt-0.5 w-6 shrink-0">
                      {item.done ? "✓" : item.position}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {item.subjectName} · {item.topicName}
                        </span>
                        <KindBadge kind={item.kind} />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-ink-soft">
                        <span>~{item.estMinutes} min</span>
                        <span>·</span>
                        <span>{item.studyCount}x estudado</span>
                        <span>·</span>
                        <PriorityStars
                          value={item.priority}
                          onChange={(p) => setPriority(item, p)}
                        />
                      </div>

                      {/* Timer / result */}
                      {running && (
                        <div className="mt-2 text-accent font-mono text-lg">
                          {formatClock(st.elapsed)}
                        </div>
                      )}
                      {st.measuredMinutes !== null && (
                        <div className="mt-2 text-sm text-grade-easy">
                          Concluído
                          {st.measuredMinutes > 0
                            ? ` em ${st.measuredMinutes} min`
                            : " (sem cronômetro)"}
                          {st.nextStudy && (
                            <span className="text-ink-soft">
                              {" · "}
                              {st.nextStudy.status}
                              {st.nextStudy.due
                                ? ` · próxima revisão em ${formatDayMonth(
                                    st.nextStudy.due
                                  )}`
                                : ""}
                            </span>
                          )}
                        </div>
                      )}
                      {st.error && (
                        <div className="mt-2 text-xs text-grade-again">
                          {st.error}
                        </div>
                      )}

                      {/* Actions */}
                      {!item.done && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {!running && (
                            <button
                              onClick={() => startSession(item)}
                              className="px-4 py-1.5 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg text-sm transition-colors"
                            >
                              Iniciar
                            </button>
                          )}
                          <Link
                            href={`/study?topicId=${item.topicId}`}
                            className="px-4 py-1.5 bg-line/60 hover:bg-line/60 rounded-lg text-sm transition-colors"
                          >
                            Estudar cards
                          </Link>
                          {running && (
                            <button
                              onClick={() => finishSession(item)}
                              disabled={st.finishing}
                              className="px-4 py-1.5 bg-grade-easy/10 hover:bg-grade-easy/10 border border-grade-easy/40 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              {st.finishing ? "Concluindo..." : "Concluir"}
                            </button>
                          )}
                          {!running && (
                            <button
                              onClick={() => completeWithoutTimer(item)}
                              disabled={st.finishing}
                              className="px-4 py-1.5 bg-line/60 hover:bg-line/60 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              {st.finishing
                                ? "Concluindo..."
                                : "Concluir sem cronômetro"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  if (kind === "novo") {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-accent border border-accent/40">
        novo
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-grade-hard/10 text-grade-hard border border-grade-hard/40">
      revisão
    </span>
  );
}

function PriorityStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (priority: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Prioridade ${n}`}
          className={`text-sm leading-none transition-colors ${
            n <= value
              ? "text-grade-hard hover:text-grade-hard"
              : "text-line hover:text-ink-soft"
          }`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
