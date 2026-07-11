"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type SearchResult = {
  id: number;
  topicId: number;
  question: string;
  answer: string;
  bizu: string;
  subjectName: string;
  topicName: string;
  cardType: string;
};

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearch(value: string) {
    setQuery(value);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(value)}&limit=15`);
      const data = await res.json();
      setResults(data.cards || []);
      setOpen(true);
    }, 300);
  }

  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, "").substring(0, 120);
  }

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Buscar nos flashcards..."
        className="w-full px-4 py-2 bg-surface border border-line rounded-lg text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:border-accent focus-visible:ring-1 focus-visible:ring-accent"
      />

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-paper border border-line rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          {results.map((card) => (
            <Link
              key={card.id}
              href={`/review?cardId=${card.id}&topicId=${card.topicId}`}
              onClick={() => setOpen(false)}
              className="block p-3 border-b border-line last:border-0 hover:bg-surface transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink line-clamp-2">
                    {stripHtml(card.question)}
                  </p>
                  <p className="text-xs text-ink-soft mt-1">
                    {card.subjectName} &middot; {card.topicName}
                    {card.cardType === "questao" && (
                      <span className="font-mono ml-1">Questão</span>
                    )}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-paper border border-line rounded-lg p-4 text-center text-sm text-ink-soft">
          Nenhum resultado para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
