import type { Metadata } from "next";
import "./globals.css";
import SearchBar from "@/components/SearchBar";

export const metadata: Metadata = {
  title: "Bizurado",
  description: "Sistema inteligente de flashcards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur border-b border-slate-800">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-4">
            <a href="/" className="text-cyan-400 font-bold text-lg shrink-0">
              Bizurado
            </a>
            <div className="flex-1 flex justify-center">
              <SearchBar />
            </div>
            <div className="flex gap-3 text-sm shrink-0">
              <a href="/plan" className="text-slate-300 hover:text-white transition-colors">
                Plano
              </a>
              <a href="/review" className="text-slate-300 hover:text-white transition-colors">
                Revisar
              </a>
              <a href="/progress" className="text-slate-300 hover:text-white transition-colors">
                Progresso
              </a>
              <a href="/subjects" className="text-slate-300 hover:text-white transition-colors">
                Disciplinas
              </a>
              <a href="/history" className="text-slate-300 hover:text-white transition-colors">
                Histórico
              </a>
              <a href="/stats" className="text-slate-300 hover:text-white transition-colors">
                Stats
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
