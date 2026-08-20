"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegação da área de flashcards. Estas telas existiam mas ficaram sem
// entrada quando o Ciclo virou o produto principal — quem entrava numa delas
// caía num beco. Aqui elas voltam a ser um conjunto.
const items = [
  { name: "Baralhos", path: "/subjects" },
  { name: "Trilha", path: "/cycle" },
  { name: "Revisar hoje", path: "/review" },
  { name: "Estatísticas", path: "/stats" },
  { name: "Histórico", path: "/history" },
  { name: "Domínio", path: "/progress" },
];

export default function FlashcardsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Flashcards" className="mb-6 flex flex-wrap gap-1 border-b border-line pb-2">
      {items.map((item) => {
        const active = pathname === item.path;
        return (
          <Link
            key={item.path}
            href={item.path}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? "bg-accent text-paper" : "text-ink-soft hover:bg-surface hover:text-ink"
            }`}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
