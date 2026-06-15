"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  totalCards: number;
  reviewedToday: number;
  streak: number;
  accuracy: number;
  dueToday: number;
  subjects: { id: number; name: string; cardCount: number }[];
};

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-cyan-400">Bizurado</h1>
          <p className="text-slate-400 mt-1">Sistema inteligente de revisão</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/plan"
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors"
          >
            Plano de hoje
          </Link>
          <Link
            href="/review"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Revisar agora
          </Link>
          <Link
            href="/progress"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Progresso
          </Link>
          <Link
            href="/subjects"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Disciplinas
          </Link>
          <Link
            href="/stats"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Estatísticas
          </Link>
        </div>
      </header>

      {!stats && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-xl">Carregando...</p>
        </div>
      )}

      {stats && stats.totalCards === 0 && (
        <div className="text-center py-20">
          <p className="text-6xl mb-4">📚</p>
          <h2 className="text-2xl font-semibold mb-2">Nenhum flashcard encontrado</h2>
          <p className="text-slate-400 mb-6">
            Seus arquivos .txt ainda não foram importados.
          </p>
          <button
            onClick={async () => {
              const res = await fetch("/api/parse", { method: "POST" });
              if (res.ok) window.location.reload();
            }}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg transition-colors"
          >
            Importar flashcards dos .txt
          </button>
        </div>
      )}

      {stats && stats.totalCards > 0 && (
        <Link
          href="/plan"
          className="block mb-6 p-6 rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 to-slate-800 hover:from-cyan-500/25 transition-colors"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-cyan-400 font-semibold">
                Plano de estudos
              </p>
              <p className="text-2xl font-bold mt-1">Ver plano de hoje</p>
              {stats.dueToday > 0 && (
                <p className="text-slate-300 mt-1">
                  {stats.dueToday} cards pendentes
                </p>
              )}
            </div>
            <span className="text-cyan-400 text-3xl shrink-0">→</span>
          </div>
        </Link>
      )}

      {stats && stats.totalCards > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total de cards" value={stats.totalCards} />
          <StatCard label="Revisões hoje" value={stats.reviewedToday} highlight />
          <StatCard label="Pendentes hoje" value={stats.dueToday} />
          <StatCard label="Sequência (dias)" value={stats.streak} suffix="dias" />
        </div>
      )}

      {stats && stats.totalCards > 0 && (
        <>
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-slate-200">Disciplinas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.subjects.map((s) => (
                <Link
                  key={s.name}
                  href={`/subjects?name=${encodeURIComponent(s.name)}`}
                  className="p-4 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700"
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-slate-400">{s.cardCount} cards</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="text-center text-slate-500 text-sm space-x-4">
            <Link href="/review" className="text-cyan-400 hover:underline">
              Iniciar revisão
            </Link>
            <span>·</span>
            <Link href="/stats" className="text-cyan-400 hover:underline">
              Ver estatísticas
            </Link>
            <span>·</span>
            <button
              onClick={async () => {
                const btn = document.activeElement as HTMLButtonElement;
                btn.disabled = true;
                btn.textContent = "Importando...";
                try {
                  await fetch("/api/parse", { method: "POST" });
                  window.location.reload();
                } catch {
                  btn.disabled = false;
                  btn.textContent = "Reimportar";
                }
              }}
              className="text-cyan-400 hover:underline bg-transparent cursor-pointer"
            >
              Reimportar arquivos
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  suffix,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  suffix?: string;
}) {
  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
      <p className="text-sm text-slate-400">{label}</p>
      <p
        className={`text-3xl font-bold mt-1 ${highlight ? "text-cyan-400" : "text-white"}`}
      >
        {value}
        {suffix && <span className="text-lg text-slate-400 ml-1">{suffix}</span>}
      </p>
    </div>
  );
}
