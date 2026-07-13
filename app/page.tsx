"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getStatsData, restoreFromNeon } from "@/lib/client/engine";

type Stats = {
  totalCards: number;
  reviewedToday: number;
  streak: number;
  accuracy: number;
  dueToday: number;
  subjects: { name: string; cardCount: number }[];
};

const nf = new Intl.NumberFormat("pt-BR");

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  // Mesma fonte de verdade das outras telas: o engine local (IndexedDB +
  // JSONs estáticos) — o /api/stats lia o Neon e contradizia a trilha.
  useEffect(() => {
    getStatsData().then(setStats);
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {!stats && (
        <div aria-busy="true" aria-label="Carregando seu estudo" className="py-10 space-y-6">
          <div className="h-10 w-3/4 rounded bg-line/60 motion-safe:animate-pulse" />
          <div className="h-12 w-56 rounded-lg bg-line/60 motion-safe:animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-line/60 motion-safe:animate-pulse" />
          <div className="space-y-2 pt-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-line/60 motion-safe:animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {stats && stats.totalCards === 0 && (
        <div className="text-center py-20">
          <h2 className="font-serif text-2xl font-semibold mb-2">
            Nenhum flashcard encontrado
          </h2>
          <p className="text-ink-soft mb-6">
            Seus arquivos .txt ainda não foram importados.
          </p>
          <button
            onClick={async () => {
              const res = await fetch("/api/parse", { method: "POST" });
              if (res.ok) window.location.reload();
            }}
            className="px-6 py-3 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Importar flashcards dos .txt
          </button>
        </div>
      )}

      {stats && stats.totalCards > 0 && (
        <>
          {/* O dia de hoje — a única decisão desta tela é "continuar" */}
          <section className="py-10 border-b border-line">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight max-w-[24ch]">
              {stats.dueToday > 0 ? (
                <>
                  {nf.format(stats.dueToday)} cards esperando revisão hoje.
                </>
              ) : (
                <>Nada vencido. Hora de avançar na trilha.</>
              )}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link
                href="/cycle"
                className="px-6 py-3 bg-accent hover:bg-accent-deep text-paper font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Continuar a trilha →
              </Link>
              <Link href="/plan" className="text-accent hover:text-accent-deep text-sm font-medium transition-colors">
                Ver o plano de hoje
              </Link>
            </div>
            <p className="font-mono text-xs text-ink-soft mt-6">
              {nf.format(stats.totalCards)} cards · {nf.format(stats.reviewedToday)}{" "}
              revisados hoje · {stats.streak}{" "}
              {stats.streak === 1 ? "dia seguido" : "dias seguidos"}
            </p>
          </section>

          {/* Disciplinas — lista de caderno, não grid de cards */}
          <section className="py-8">
            <h2 className="font-serif text-lg font-semibold mb-3">Disciplinas</h2>
            <ul className="divide-y divide-line border-y border-line">
              {stats.subjects.map((s) => (
                <li key={s.name}>
                  <Link
                    href={`/subjects?name=${encodeURIComponent(s.name)}`}
                    className="flex items-baseline justify-between gap-4 py-3 px-2 -mx-2 hover:bg-surface transition-colors"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="font-mono text-xs text-ink-soft shrink-0">
                      {nf.format(s.cardCount)} cards
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="text-center text-sm pb-10 space-x-6">
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
                  btn.textContent = "Reimportar arquivos";
                }
              }}
              className="text-ink-soft hover:text-accent underline underline-offset-4 bg-transparent cursor-pointer transition-colors"
            >
              Reimportar arquivos
            </button>
            <button
              onClick={async () => {
                if (
                  !window.confirm(
                    "Substituir o progresso deste navegador pelo backup da nuvem (Neon)? O que estiver pendente de sync é enviado antes."
                  )
                )
                  return;
                const btn = document.activeElement as HTMLButtonElement;
                btn.disabled = true;
                btn.textContent = "Restaurando...";
                const ok = await restoreFromNeon();
                if (ok) {
                  window.location.reload();
                } else {
                  btn.disabled = false;
                  btn.textContent = "Restaurar progresso da nuvem";
                  window.alert("Não foi possível restaurar. Tente de novo.");
                }
              }}
              className="text-ink-soft hover:text-accent underline underline-offset-4 bg-transparent cursor-pointer transition-colors"
            >
              Restaurar progresso da nuvem
            </button>
          </section>
        </>
      )}
    </div>
  );
}
