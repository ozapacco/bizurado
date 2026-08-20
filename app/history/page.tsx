"use client";

import { useEffect, useState } from "react";
import FlashcardsNav from "@/components/FlashcardsNav";
import Link from "next/link";

import { getHistoryData, type HistoryResponse } from "@/lib/client/engine";

const WINDOWS = [7, 30, 90];

function formatDay(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  const d = new Date(date);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  }
  return date;
}

export default function HistoryPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    getHistoryData(days)
      .then((d: HistoryResponse) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Histórico</h1>
        </div>
        <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                days === w
                  ? "bg-accent text-paper font-semibold"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {w} dias
            </button>
          ))}
        </div>
      </header>

      <FlashcardsNav />

      {error && (
        <div className="text-center py-20 text-grade-again">
          <p className="text-lg">Erro ao carregar o histórico.</p>
        </div>
      )}

      {!error && loading && (
        <div className="text-center py-20 text-ink-soft">
          <p className="text-xl">Carregando...</p>
        </div>
      )}

      {!error && !loading && data && data.history.length === 0 && (
        <div className="text-center py-20 text-ink-soft">
          <p className="text-xl">Nenhuma revisão nesse período.</p>
        </div>
      )}

      {!error && !loading && data && data.history.length > 0 && (
        <div className="space-y-5">
          {data.history.map((day) => (
            <div key={day.date}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold text-accent">
                  {formatDay(day.date)}
                </span>
                <div className="flex-1 h-px bg-line/60" />
                <span className="text-xs text-ink-soft">
                  {day.topics.length}{" "}
                  {day.topics.length === 1 ? "tópico" : "tópicos"}
                </span>
              </div>
              <div className="space-y-2">
                {day.topics.map((t) => (
                  <div
                    key={`${day.date}-${t.topicId}`}
                    className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">
                        <span className="text-ink-soft">{t.subjectName}</span>{" "}
                        · {t.topicName}
                      </p>
                    </div>
                    <div className="flex gap-4 text-xs text-ink-soft shrink-0">
                      <span>
                        <span className="text-ink font-medium">
                          {t.cardsEstudados}
                        </span>{" "}
                        cards
                      </span>
                      <span>
                        <span className="text-ink font-medium">
                          {t.revisoes}
                        </span>{" "}
                        revisões
                      </span>
                      <span>
                        Acerto:{" "}
                        <span className="text-ink font-medium">
                          {t.acertoPct == null ? "—" : `${t.acertoPct}%`}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
