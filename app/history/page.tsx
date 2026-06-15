"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HistoryTopic = {
  subjectName: string;
  topicName: string;
  topicId: number;
  cardsEstudados: number;
  revisoes: number;
  acertoPct: number | null;
};

type HistoryDay = {
  date: string; // YYYY-MM-DD
  topics: HistoryTopic[];
};

type HistoryResponse = {
  days: number;
  history: HistoryDay[];
};

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
    fetch(`/api/history/by-topic?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.json();
      })
      .then((d: HistoryResponse) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          <Link href="/" className="text-cyan-400 hover:underline text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold mt-2">Histórico</h1>
        </div>
        <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                days === w
                  ? "bg-cyan-500 text-slate-900 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {w} dias
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="text-center py-20 text-red-400">
          <p className="text-lg">Erro ao carregar o histórico.</p>
        </div>
      )}

      {!error && loading && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-xl">Carregando...</p>
        </div>
      )}

      {!error && !loading && data && data.history.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-xl">Nenhuma revisão nesse período.</p>
        </div>
      )}

      {!error && !loading && data && data.history.length > 0 && (
        <div className="space-y-5">
          {data.history.map((day) => (
            <div key={day.date}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold text-cyan-400">
                  {formatDay(day.date)}
                </span>
                <div className="flex-1 h-px bg-slate-700" />
                <span className="text-xs text-slate-500">
                  {day.topics.length}{" "}
                  {day.topics.length === 1 ? "tópico" : "tópicos"}
                </span>
              </div>
              <div className="space-y-2">
                {day.topics.map((t) => (
                  <div
                    key={`${day.date}-${t.topicId}`}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">
                        <span className="text-slate-400">{t.subjectName}</span>{" "}
                        · {t.topicName}
                      </p>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400 shrink-0">
                      <span>
                        <span className="text-slate-200 font-medium">
                          {t.cardsEstudados}
                        </span>{" "}
                        cards
                      </span>
                      <span>
                        <span className="text-slate-200 font-medium">
                          {t.revisoes}
                        </span>{" "}
                        revisões
                      </span>
                      <span>
                        Acerto:{" "}
                        <span className="text-slate-200 font-medium">
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
