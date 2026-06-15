"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

type SubjectProgress = {
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
  topics: TopicProgress[];
};

type ProgressResponse = {
  subjects: SubjectProgress[];
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    // fallback: YYYY-MM-DD
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}`;
    return "—";
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const safe = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="w-full bg-slate-700 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all`}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function Metrics({
  m,
}: {
  m: {
    coberturaPct: number;
    dominioPct: number;
    acertoPct: number | null;
    vistos: number;
    maduros: number;
    total: number;
    dueNow: number;
  };
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">
            Cobertura{" "}
            <span className="text-slate-500">
              ({m.vistos}/{m.total})
            </span>
          </span>
          <span className="text-cyan-400 font-medium">{m.coberturaPct}%</span>
        </div>
        <ProgressBar pct={m.coberturaPct} color="bg-cyan-500" />
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">
            Domínio{" "}
            <span className="text-slate-500">
              ({m.maduros}/{m.total})
            </span>
          </span>
          <span className="text-emerald-400 font-medium">{m.dominioPct}%</span>
        </div>
        <ProgressBar pct={m.dominioPct} color="bg-emerald-500" />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          Acerto:{" "}
          <span className="text-slate-200">
            {m.acertoPct == null ? "—" : `${m.acertoPct}%`}
          </span>
        </span>
        <span>
          Pendentes: <span className="text-slate-200">{m.dueNow}</span>
        </span>
      </div>
    </div>
  );
}

function SubjectCard({ s }: { s: SubjectProgress }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-slate-100">{s.name}</h2>
          {s.jaEstudouTudo && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Tudo estudado
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 shrink-0">
          Último: {formatDate(s.ultimoEstudo)}
        </span>
      </div>

      <Metrics m={s} />

      <div className="grid grid-cols-5 gap-2 mt-4 text-center">
        <Count label="Total" value={s.total} />
        <Count label="Novos" value={s.novos} />
        <Count label="Jovens" value={s.jovens} />
        <Count label="Maduros" value={s.maduros} />
        <Count label="Vencidos" value={s.dueNow} />
      </div>

      {s.topics.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-sm text-cyan-400 hover:underline"
          >
            {open ? "▼" : "▶"} {s.topics.length} tópicos
          </button>

          {open && (
            <div className="mt-3 space-y-3">
              {s.topics.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-900/50 border border-slate-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-slate-200">
                        {t.name}
                      </h3>
                      {t.jaEstudouTudo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          completo
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {formatDate(t.ultimoEstudo)}
                    </span>
                  </div>
                  <Metrics m={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-base font-bold text-slate-100">{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.json();
      })
      .then((d: ProgressResponse) => setData(d))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-cyan-400 hover:underline text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Progresso / Domínio</h1>
        <p className="text-sm text-slate-400 mt-2">
          <span className="text-cyan-400">Cobertura</span> = % do conteúdo já
          estudado. <span className="text-emerald-400">Domínio</span> = % de
          cards maduros (intervalo ≥ 21 dias).
        </p>
      </header>

      {error && (
        <div className="text-center py-20 text-red-400">
          <p className="text-lg">Erro ao carregar o progresso.</p>
        </div>
      )}

      {!error && !data && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-xl">Carregando...</p>
        </div>
      )}

      {!error && data && data.subjects.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-xl">Nenhuma disciplina encontrada.</p>
        </div>
      )}

      {!error && data && data.subjects.length > 0 && (
        <div className="space-y-4">
          {data.subjects.map((s) => (
            <SubjectCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
