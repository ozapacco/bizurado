"use client";

// Peças compartilhadas das telas de carta (estudo e revisão), no tema
// "caderno de aprovado" (DESIGN.md): papel claro, tinta petróleo, cor
// semântica só no detalhe.

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-line bg-surface text-ink-soft text-[0.7rem] font-mono leading-none">
      {children}
    </kbd>
  );
}

export type Grade = "again" | "hard" | "good" | "easy";

const GRADES: {
  grade: Grade;
  rating: number;
  hotkey: string;
  label: string;
  desc: string;
  classes: string;
}[] = [
  {
    grade: "again",
    rating: 1,
    hotkey: "1",
    label: "Errei",
    desc: "Não lembrei",
    classes:
      "text-grade-again hover:border-grade-again/50 hover:bg-grade-again/5",
  },
  {
    grade: "hard",
    rating: 2,
    hotkey: "2",
    label: "Difícil",
    desc: "Lembrei com esforço",
    classes: "text-grade-hard hover:border-grade-hard/50 hover:bg-grade-hard/5",
  },
  {
    grade: "good",
    rating: 3,
    hotkey: "3",
    label: "Bom",
    desc: "Lembrei",
    classes: "text-grade-good hover:border-grade-good/50 hover:bg-grade-good/5",
  },
  {
    grade: "easy",
    rating: 4,
    hotkey: "4",
    label: "Fácil",
    desc: "Na ponta da língua",
    classes: "text-grade-easy hover:border-grade-easy/50 hover:bg-grade-easy/5",
  },
];

export function RatingBar({ onRate }: { onRate: (rating: number) => void }) {
  return (
    <div className="flex gap-2 md:gap-3 justify-center max-w-3xl mx-auto">
      {GRADES.map((g) => (
        <button
          key={g.grade}
          onClick={() => onRate(g.rating)}
          className={`flex-1 p-3 md:p-4 rounded-lg border border-line bg-surface text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${g.classes}`}
        >
          <span className="hidden md:inline-block float-left text-[0.7rem] text-ink-soft font-mono border border-line rounded px-1 leading-tight">
            {g.hotkey}
          </span>
          <p className="text-base md:text-lg font-semibold">{g.label}</p>
          <p className="text-xs text-ink-soft mt-0.5">{g.desc}</p>
        </button>
      ))}
    </div>
  );
}

// Skeleton da tela de carta: mesmas regiões (barra, carta, rodapé), sem texto
// solto. `motion-safe` respeita prefers-reduced-motion.
export function CardScreenSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Abrindo o baralho"
      className="fixed inset-0 z-50 flex flex-col bg-paper"
    >
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-line">
        <div className="flex items-center justify-between">
          <div className="h-7 w-24 rounded bg-line/60 motion-safe:animate-pulse" />
          <div className="h-7 w-40 rounded bg-line/60 motion-safe:animate-pulse" />
        </div>
        <div className="mt-3 h-1 w-full rounded-full bg-line/60" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <div className="h-4 w-16 rounded bg-line/60 motion-safe:animate-pulse" />
        <div className="h-6 w-full max-w-xl rounded bg-line/60 motion-safe:animate-pulse" />
        <div className="h-6 w-4/5 max-w-lg rounded bg-line/60 motion-safe:animate-pulse" />
        <div className="h-6 w-3/5 max-w-md rounded bg-line/60 motion-safe:animate-pulse" />
      </div>
      <div className="shrink-0 px-3 py-3 border-t border-line">
        <div className="h-14 max-w-md mx-auto rounded-lg bg-line/60 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
