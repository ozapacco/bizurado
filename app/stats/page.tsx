"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getProgressData, getStatsData, getStatsDifficulty, getStatsHistory, type SubjectProgress } from "@/lib/client/engine";

type Stats = {
  totalCards: number;
  reviewedToday: number;
  dueToday: number;
  streak: number;
  accuracy: number;
  subjects: { name: string; cardCount: number }[];
};

type ProgressResponse = { subjects: SubjectProgress[] };

type DisciplineMacro = {
  id: number;
  name: string;
  total: number;
  coberturaPct: number;
  dominioPct: number;
  acertoPct: number | null;
  topicosTotal: number;
  topicosIniciados: number;
  topicosConcluidos: number;
};
type Macro = {
  coberturaPct: number;
  dominioPct: number;
  total: number;
  vistos: number;
  maduros: number;
  topicos: number;
  topicosIniciados: number;
  topicosConcluidos: number;
  disciplinas: DisciplineMacro[];
};

// Macro rollup from /api/progress: global study coverage & mastery, plus how
// many topics ("assuntos") have been started/completed, per discipline.
function buildMacro(p: ProgressResponse): Macro {
  let total = 0;
  let vistos = 0;
  let maduros = 0;
  let topicos = 0;
  let iniciados = 0;
  let concluidos = 0;

  const disciplinas: DisciplineMacro[] = p.subjects.map((s) => {
    total += s.total;
    vistos += s.vistos;
    maduros += s.maduros;
    const ti = s.topics.length;
    const tIni = s.topics.filter((t) => t.vistos > 0).length;
    const tCon = s.topics.filter((t) => t.jaEstudouTudo).length;
    topicos += ti;
    iniciados += tIni;
    concluidos += tCon;
    return {
      id: s.id,
      name: s.name,
      total: s.total,
      coberturaPct: s.coberturaPct,
      dominioPct: s.dominioPct,
      acertoPct: s.acertoPct,
      topicosTotal: ti,
      topicosIniciados: tIni,
      topicosConcluidos: tCon,
    };
  });

  disciplinas.sort(
    (a, b) => b.coberturaPct - a.coberturaPct || b.dominioPct - a.dominioPct
  );

  return {
    coberturaPct: total > 0 ? Math.round((vistos / total) * 100) : 0,
    dominioPct: total > 0 ? Math.round((maduros / total) * 100) : 0,
    total,
    vistos,
    maduros,
    topicos,
    topicosIniciados: iniciados,
    topicosConcluidos: concluidos,
    disciplinas,
  };
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [reviewHistory, setReviewHistory] = useState<
    { date: string; count: number }[]
  >([]);
  const [difficultyDist, setDifficultyDist] = useState<
    { name: string; value: number }[]
  >([]);

  useEffect(() => {
    getStatsData().then(setStats);
    getProgressData().then((d: ProgressResponse) => setProgress(d)).catch(() => {});
    getStatsHistory().then((data) => setReviewHistory(data.history || []));
    getStatsDifficulty().then((data) => setDifficultyDist(data.distribution || []));
  }, []);

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ink-soft text-xl">Carregando...</p>
      </div>
    );
  }

  const COLORS = ["#1b6e85", "#2e7d4f", "#a06b10", "#b03a2e", "#5b4a86"];
  const macro = progress ? buildMacro(progress) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-accent hover:underline text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Estatísticas</h1>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <StatBox label="Total" value={stats.totalCards} />
        <StatBox label="Revisões hoje" value={stats.reviewedToday} />
        <StatBox label="Pendentes" value={stats.dueToday} />
        <StatBox label="Sequência" value={`${stats.streak}d`} />
        <StatBox label="Acerto" value={`${stats.accuracy}%`} />
      </div>

      {macro && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-ink-soft mb-3 uppercase tracking-wider">
            Visão macro
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MacroBox
              label="Estudado"
              value={`${macro.coberturaPct}%`}
              sub={`${macro.vistos}/${macro.total} cards`}
              color="text-accent"
            />
            <MacroBox
              label="Dominado"
              value={`${macro.dominioPct}%`}
              sub={`${macro.maduros}/${macro.total} maduros`}
              color="text-grade-easy"
            />
            <MacroBox
              label="Assuntos iniciados"
              value={`${macro.topicosIniciados}/${macro.topicos}`}
              sub="tópicos tocados"
              color="text-accent"
            />
            <MacroBox
              label="Assuntos concluídos"
              value={`${macro.topicosConcluidos}/${macro.topicos}`}
              sub="100% vistos"
              color="text-grade-easy"
            />
          </div>

          {macro.disciplinas.length > 0 && (
            <div className="p-4 bg-surface rounded-xl border border-line">
              <h3 className="text-sm font-semibold text-ink-soft mb-4 uppercase tracking-wider">
                Progresso por disciplina
              </h3>
              <div className="space-y-4">
                {macro.disciplinas.map((d) => (
                  <div key={d.id}>
                    <div className="flex justify-between items-baseline gap-2 mb-1.5">
                      <Link
                        href={`/progress?subject=${encodeURIComponent(d.name)}`}
                        className="text-sm font-medium text-ink hover:text-accent"
                      >
                        {d.name}
                      </Link>
                      <span className="text-xs text-ink-soft shrink-0">
                        {d.topicosIniciados}/{d.topicosTotal} assuntos ·{" "}
                        {d.total} cards · acerto{" "}
                        {d.acertoPct == null ? "—" : `${d.acertoPct}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-ink-soft w-16 shrink-0">
                        Cobertura
                      </span>
                      <MacroBar pct={d.coberturaPct} color="bg-accent" />
                      <span className="text-xs text-accent w-10 text-right shrink-0">
                        {d.coberturaPct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-soft w-16 shrink-0">
                        Domínio
                      </span>
                      <MacroBar pct={d.dominioPct} color="bg-grade-easy" />
                      <span className="text-xs text-grade-easy w-10 text-right shrink-0">
                        {d.dominioPct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-soft mt-4">
                <span className="text-accent">Cobertura</span> = % já estudado ·{" "}
                <span className="text-grade-easy">Domínio</span> = % maduro (≥ 21
                dias). Clique numa disciplina para ver tópico a tópico.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="p-4 bg-surface rounded-xl border border-line">
          <h3 className="text-sm font-semibold text-ink-soft mb-4 uppercase tracking-wider">
            Revisões nos últimos 14 dias
          </h3>
          {reviewHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={reviewHistory}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#5a6b74", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#5a6b74", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#f7fafb",
                    border: "1px solid #d7dee1",
                    borderRadius: 8,
                    color: "#16262e",
                  }}
                />
                <Bar dataKey="count" fill="#1b6e85" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-ink-soft text-center py-10">
              Nenhum dado ainda. Comece a revisar!
            </p>
          )}
        </div>

        <div className="p-4 bg-surface rounded-xl border border-line">
          <h3 className="text-sm font-semibold text-ink-soft mb-4 uppercase tracking-wider">
            Distribuição por dificuldade
          </h3>
          {difficultyDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={difficultyDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {difficultyDist.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#f7fafb",
                    border: "1px solid #d7dee1",
                    borderRadius: 8,
                    color: "#16262e",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-ink-soft text-center py-10">
              Revise alguns cards primeiro.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 bg-surface rounded-lg border border-line text-center">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

function MacroBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="p-4 bg-surface rounded-xl border border-line">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[11px] text-ink-soft mt-0.5">{sub}</p>
    </div>
  );
}

function MacroBar({ pct, color }: { pct: number; color: string }) {
  const safe = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="flex-1 bg-line/60 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all`}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
