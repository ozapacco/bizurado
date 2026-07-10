"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { getCycleData, setSubjectPriorityLocal, setTopicPriorityLocal, type CycleData, type Pointer, type SubjectOut as Subject, type TopicOut as Topic } from "@/lib/client/engine";

const CAMADAS: Record<number, { nome: string; cls: string }> = {
  1: { nome: "Varredura", cls: "bg-accent/5 text-accent border-accent/40" },
  2: { nome: "Consolidação", cls: "bg-grade-hard/5 text-grade-hard border-grade-hard/40" },
  3: { nome: "Compilados", cls: "bg-ink/5 text-ink border-ink/30" },
};

function ago(iso: string | null): string {
  if (!iso) return "nunca estudada";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days}d`;
  return `há ${Math.floor(days / 30)}m`;
}

export default function CyclePage() {
  const [data, setData] = useState<CycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCycleData();
    setData(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Define a prioridade de TODA a disciplina (bulk). Otimista.
  const setSubjectPriority = async (subjectId: number, priority: number) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            subjects: prev.subjects.map((s) =>
              s.id === subjectId
                ? {
                    ...s,
                    prioridadeMedia: priority,
                    topics: s.topics.map((t) => ({ ...t, priority })),
                  }
                : s
            ),
          }
        : prev
    );
    await setSubjectPriorityLocal(subjectId, priority).catch(() => {});
  };

  // Prioridade de UM tópico. Otimista.
  const setTopicPriority = async (
    subjectId: number,
    topicId: number,
    priority: number
  ) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            subjects: prev.subjects.map((s) =>
              s.id === subjectId
                ? {
                    ...s,
                    topics: s.topics.map((t) =>
                      t.id === topicId ? { ...t, priority } : t
                    ),
                  }
                : s
            ),
          }
        : prev
    );
    await setTopicPriorityLocal(topicId, priority).catch(() => {});
  };

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="Montando a trilha"
        className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4"
      >
        <div className="h-8 w-64 rounded bg-line/60 motion-safe:animate-pulse mt-2" />
        <div className="h-28 rounded-xl bg-line/60 motion-safe:animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-line/60 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const { dueTotal, agora, depois, subjects } = data;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="font-serif text-2xl font-semibold mb-1">Trilha do Aprovado</h1>
      <p className="text-sm text-ink-soft mb-5">
        Revise o vencido, avance pela disciplina menos vista, gire. Suba as camadas.
      </p>

      {/* HOJE — os dois fluxos */}
      <section className="rounded-xl border border-line bg-surface p-4 mb-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm">
              {dueTotal > 0 ? (
                <>
                  <b className="font-mono text-grade-hard">{dueTotal}</b> vencidas hoje
                </>
              ) : (
                <span className="text-ink-soft">Nenhuma revisão vencida</span>
              )}
            </span>
          </div>
          {dueTotal > 0 && (
            <Link
              href="/review?mode=due"
              className="shrink-0 text-sm px-4 py-2 rounded-lg border border-grade-hard/50 text-grade-hard hover:bg-grade-hard/5 font-semibold transition-colors"
            >
              Revisar →
            </Link>
          )}
        </div>

        <div className="h-px bg-line" />

        {agora ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">
                    Avançar
                  </span>
                  <CamadaBadge camada={agora.camada} />
                </div>
                <p className="mt-1 font-semibold truncate">
                  {agora.subjectName} · {agora.topicName}
                </p>
                <p className="text-xs text-ink-soft">{agora.novos} cards novos</p>
              </div>
              <Link
                href={`/study?topicId=${agora.topicId}`}
                className="shrink-0 text-sm px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-deep text-paper font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Estudar →
              </Link>
            </div>
            {depois && (
              <p className="text-xs text-ink-soft">
                depois: {depois.subjectName} · {depois.topicName}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            Você já viu todos os tópicos pelo menos uma vez. Agora é manter a
            memória com as revisões e deixar as camadas amadurecerem.
          </p>
        )}
      </section>

      {/* DISCIPLINAS — a árvore */}
      <h2 className="font-serif text-lg font-semibold mb-3">
        Disciplinas
      </h2>
      <div className="space-y-3">
        {subjects.map((s) => {
          const isOpen = expanded.has(s.id);
          return (
            <div
              key={s.id}
              className="rounded-xl border border-line bg-paper overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{s.name}</span>
                    <CamadaBadge camada={s.camada} />
                  </div>
                  <Stars
                    value={Math.round(s.prioridadeMedia)}
                    onChange={(p) => setSubjectPriority(s.id, p)}
                    title="Prioridade da disciplina inteira (banca)"
                  />
                </div>

                {/* Barra de progresso */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[0.7rem] text-ink-soft mb-1">
                    <span>
                      {s.camada === 1
                        ? `${s.coberturaPct}% visto`
                        : `${s.dominioPct}% dominado`}
                    </span>
                    <span className="font-mono">
                      {s.total} cards · {s.dueNow} vencidas · {ago(s.lastStudied)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        s.camada === 1 ? "bg-accent" : "bg-grade-hard"
                      }`}
                      style={{ width: `${s.progressPct}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => toggle(s.id)}
                  className="mt-3 text-xs text-accent hover:underline"
                >
                  {isOpen ? "▾ ocultar tópicos" : `▸ ${s.topics.length} tópicos`}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-line divide-y divide-line">
                  {s.topics.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{t.name}</p>
                        <p className="text-[0.7rem] text-ink-soft">
                          <EstadoChip estado={t.estado} /> · {t.total} cards
                          {t.dueNow > 0 && ` · ${t.dueNow} venc.`}
                        </p>
                      </div>
                      <Stars
                        value={t.priority}
                        onChange={(p) => setTopicPriority(s.id, t.id, p)}
                        title="Prioridade deste tópico"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CamadaBadge({ camada }: { camada: number }) {
  const c = CAMADAS[camada] ?? CAMADAS[1];
  return (
    <span
      className={`shrink-0 text-[0.6rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${c.cls}`}
      title={`Camada ${camada} — ${c.nome}`}
    >
      C{camada} · {c.nome}
    </span>
  );
}

function EstadoChip({ estado }: { estado: Topic["estado"] }) {
  const map = {
    novo: { txt: "novo", cls: "text-accent" },
    andamento: { txt: "em andamento", cls: "text-grade-hard" },
    dominado: { txt: "✓ dominado", cls: "text-grade-easy" },
  } as const;
  const e = map[estado];
  return <span className={e.cls}>{e.txt}</span>;
}

function Stars({
  value,
  onChange,
  title,
}: {
  value: number;
  onChange: (priority: number) => void;
  title?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" title={title}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Prioridade ${n}`}
          className={`text-sm leading-none transition-colors ${
            n <= value
              ? "text-grade-hard hover:text-grade-hard/70"
              : "text-line hover:text-ink-soft"
          }`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
