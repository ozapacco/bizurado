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

type Stats = {
  totalCards: number;
  reviewedToday: number;
  dueToday: number;
  streak: number;
  accuracy: number;
  subjects: { name: string; cardCount: number }[];
};

type TopicProgress = {
  id: number;
  name: string;
  total: number;
  novos: number;
  vistos: number;
  jovens: number;
  maduros: number;
  dueNow: number;
  coberturaPct: number;
  dominioPct: number;
  acertoPct: number | null;
  ultimoEstudo: string | null;
  jaEstudouTudo: boolean;
};
type SubjectProgress = TopicProgress & { topics: TopicProgress[] };
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
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);

    fetch("/api/progress")
      .then((r) => r.json())
      .then((d: ProgressResponse) => setProgress(d))
      .catch(() => {});

    fetch("/api/stats/history")
      .then((r) => r.json())
      .then((data) => setReviewHistory(data.history || []));

    fetch("/api/stats/difficulty")
      .then((r) => r.json())
      .then((data) => setDifficultyDist(data.distribution || []));
  }, []);

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-xl">Carregando...</p>
      </div>
    );
  }

  const COLORS = ["#06b6d4", "#22c55e", "#eab308", "#ef4444", "#a855f7"];
  const macro = progress ? buildMacro(progress) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-cyan-400 hover:underline text-sm">
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
          <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
            Visão macro
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MacroBox
              label="Estudado"
              value={`${macro.coberturaPct}%`}
              sub={`${macro.vistos}/${macro.total} cards`}
              color="text-cyan-400"
            />
            <MacroBox
              label="Dominado"
              value={`${macro.dominioPct}%`}
              sub={`${macro.maduros}/${macro.total} maduros`}
              color="text-emerald-400"
            />
            <MacroBox
              label="Assuntos iniciados"
              value={`${macro.topicosIniciados}/${macro.topicos}`}
              sub="tópicos tocados"
              color="text-cyan-400"
            />
            <MacroBox
              label="Assuntos concluídos"
              value={`${macro.topicosConcluidos}/${macro.topicos}`}
              sub="100% vistos"
              color="text-emerald-400"
            />
          </div>

          {macro.disciplinas.length > 0 && (
            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">
                Progresso por disciplina
              </h3>
              <div className="space-y-4">
                {macro.disciplinas.map((d) => (
                  <div key={d.id}>
                    <div className="flex justify-between items-baseline gap-2 mb-1.5">
                      <Link
                        href={`/progress?subject=${encodeURIComponent(d.name)}`}
                        className="text-sm font-medium text-slate-100 hover:text-cyan-400"
                      >
                        {d.name}
                      </Link>
                      <span className="text-xs text-slate-500 shrink-0">
                        {d.topicosIniciados}/{d.topicosTotal} assuntos ·{" "}
                        {d.total} cards · acerto{" "}
                        {d.acertoPct == null ? "—" : `${d.acertoPct}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-slate-500 w-16 shrink-0">
                        Cobertura
                      </span>
                      <MacroBar pct={d.coberturaPct} color="bg-cyan-500" />
                      <span className="text-xs text-cyan-400 w-10 text-right shrink-0">
                        {d.coberturaPct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-16 shrink-0">
                        Domínio
                      </span>
                      <MacroBar pct={d.dominioPct} color="bg-emerald-500" />
                      <span className="text-xs text-emerald-400 w-10 text-right shrink-0">
                        {d.dominioPct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">
                <span className="text-cyan-400">Cobertura</span> = % já estudado ·{" "}
                <span className="text-emerald-400">Domínio</span> = % maduro (≥ 21
                dias). Clique numa disciplina para ver tópico a tópico.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">
            Revisões nos últimos 14 dias
          </h3>
          {reviewHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={reviewHistory}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                />
                <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-10">
              Nenhum dado ainda. Comece a revisar!
            </p>
          )}
        </div>

        <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">
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
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-10">
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
    <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 text-center">
      <p className="text-xs text-slate-400">{label}</p>
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
    <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  );
}

function MacroBar({ pct, color }: { pct: number; color: string }) {
  const safe = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="flex-1 bg-slate-700 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all`}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
