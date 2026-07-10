import type { Metadata } from "next";
import "./globals.css";
import SearchBar from "@/components/SearchBar";
import SyncManager from "@/components/SyncManager";
import { fontMono, fontSerif, fontUI } from "./fonts";

export const metadata: Metadata = {
  title: "Bizurado",
  description: "Sistema inteligente de flashcards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${fontUI.variable} ${fontSerif.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen font-sans">
        <nav className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-4">
            <a href="/" className="font-serif text-accent font-bold text-lg shrink-0">
              Bizurado
            </a>
            <div className="flex-1 flex justify-center">
              <SearchBar />
            </div>
            <div className="flex gap-3 text-sm shrink-0">
              <a href="/cycle" className="text-accent hover:text-accent-deep font-semibold transition-colors">
                Trilha
              </a>
              <a href="/plan" className="text-ink-soft hover:text-ink transition-colors">
                Plano
              </a>
              <a href="/review" className="text-ink-soft hover:text-ink transition-colors">
                Revisar
              </a>
              <a href="/progress" className="text-ink-soft hover:text-ink transition-colors">
                Progresso
              </a>
              <a href="/subjects" className="text-ink-soft hover:text-ink transition-colors">
                Disciplinas
              </a>
              <a href="/history" className="text-ink-soft hover:text-ink transition-colors">
                Histórico
              </a>
              <a href="/stats" className="text-ink-soft hover:text-ink transition-colors">
                Stats
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <SyncManager />
      </body>
    </html>
  );
}
