"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Topic = {
  id: number;
  name: string;
  priority: number;
  total: number;
  novos: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  estado: "novo" | "andamento" | "dominado";
};

type Subject = {
  id: number;
  name: string;
  camada: 1 | 2 | 3;
  total: number;
  novos: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  progressPct: number;
  prioridadeMedia: number;
  lastStudied: string | null;
  topics: Topic[];
};

type Pointer = {
  subjectId: number;
  subjectName: string;
  topicId: number;
  topicName: string;
  camada: number;
  priority: number;
  novos: number;
} | null;

type CycleData = {
  dueTotal: number;
  agora: Pointer;
  depois: Pointer;
  subjects: Subject[];
};

const CAMADAS: Record<number, { nome: string; cls: string }> = {
  1: { nome: "Varredura", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40" },
  2: { nome: "Consolidação", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  3: { nome: "Compilados", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40" },
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
    const res = await fetch("/api/cycle");
    const json = (await res.json()) as CycleData;
    setData(json);
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
    await fetch("/api/topics/priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, priority }),
    }).catch(() => {});
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
    await fetch("/api/topics/priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, priority }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-xl">Montando a trilha...</p>
      </div>
    );
  }
  if (!data) return null;

  const { dueTotal, agora, depois, subjects } = data;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🗺️ Trilha do Aprovado</h1>
      <p className="text-sm text-slate-400 mb-5">
        Revise o vencido, avance pela disciplina menos vista, gire. Suba as camadas.
      </p>

      {/* HOJE — os dois fluxos */}
      <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 mb-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🔁</span>
            <span className="text-sm">
              {dueTotal > 0 ? (
                <>
                  <b className="text-amber-300">{dueTotal}</b> vencidas hoje
                </>
              ) : (
                <span className="text-slate-400">Nenhuma revisão vencida 🎉</span>
              )}
            </span>
          </div>
          {dueTotal > 0 && (
            <Link
              href="/review?mode=due"
              className="shrink-0 text-sm px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 font-semibold transition-colors"
            >
              Revisar →
            </Link>
          )}
        </div>

        <div className="h-px bg-slate-700/70" />

        {agora ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <span className="text-xs uppercase tracking-wider text-slate-500">
                    Avançar
                  </span>
                  <CamadaBadge camada={agora.camada} />
                </div>
                <p className="mt-1 font-semibold truncate">
                  {agora.subjectName} · {agora.topicName}
                </p>
                <p className="text-xs text-slate-500">{agora.novos} cards novos</p>
              </div>
              <Link
                href={`/study?topicId=${agora.topicId}`}
                className="shrink-0 text-sm px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold transition-colors"
              >
                Estudar →
              </Link>
            </div>
            {depois && (
              <p className="text-xs text-slate-500">
                ⤷ depois: {depois.subjectName} · {depois.topicName}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            🏁 Você já viu todos os tópicos pelo menos uma vez. Agora é manter a
            memória com as revisões e deixar as camadas amadurecerem.
          </p>
        )}
      </section>

      {/* DISCIPLINAS — a árvore */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Disciplinas
      </h2>
      <div className="space-y-3">
        {subjects.map((s) => {
          const isOpen = expanded.has(s.id);
          return (
            <div
              key={s.id}
              className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden"
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
                  <div className="flex items-center justify-between text-[0.7rem] text-slate-400 mb-1">
                    <span>
                      {s.camada === 1
                        ? `${s.coberturaPct}% visto`
                        : `${s.dominioPct}% dominado`}
                    </span>
                    <span>
                      {s.total} cards · {s.dueNow} vencidas · {ago(s.lastStudied)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        s.camada === 1 ? "bg-cyan-400/80" : "bg-amber-400/80"
                      }`}
                      style={{ width: `${s.progressPct}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => toggle(s.id)}
                  className="mt-3 text-xs text-cyan-400 hover:underline"
                >
                  {isOpen ? "▾ ocultar tópicos" : `▸ ${s.topics.length} tópicos`}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-slate-700/70 divide-y divide-slate-800">
                  {s.topics.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{t.name}</p>
                        <p className="text-[0.7rem] text-slate-500">
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
    novo: { txt: "novo", cls: "text-cyan-400" },
    andamento: { txt: "em andamento", cls: "text-amber-400" },
    dominado: { txt: "✓ dominado", cls: "text-emerald-400" },
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
              ? "text-amber-400 hover:text-amber-300"
              : "text-slate-600 hover:text-slate-400"
          }`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
