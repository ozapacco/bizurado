"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, RefreshCw, BookOpen, ListChecks, TrendingUp, Settings, Layers } from "lucide-react";
import SyncManager, { SyncBanner } from "./SyncManager";
import ClientOnly from "./ClientOnly";

type LayoutProps = {
  children: React.ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const pathname = usePathname();

  // `mobile: false` some da barra inferior (espaço curto) mas continua na
  // sidebar. Configurações também é alcançável pela engrenagem da home.
  const navItems = [
    { name: "Hoje", path: "/", icon: Home, mobile: true },
    { name: "Ciclo", path: "/ciclo", icon: RefreshCw, mobile: true },
    { name: "Disciplinas", path: "/disciplinas", icon: BookOpen, mobile: true },
    { name: "Flashcards", path: "/subjects", icon: Layers, mobile: true },
    { name: "Questões", path: "/questoes", icon: ListChecks, mobile: true },
    { name: "Progresso", path: "/progresso", icon: TrendingUp, mobile: true },
    { name: "Configurações", path: "/configuracoes", icon: Settings, mobile: false },
  ];

  // Rotas de flashcards mantêm o item "Flashcards" aceso.
  const isActive = (path: string) => {
    if (path === "/subjects") {
      return ["/subjects", "/cycle", "/study", "/review", "/stats", "/history", "/progress"].some(
        (p) => pathname === p || pathname.startsWith(`${p}/`)
      );
    }
    return pathname === path;
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col md:flex-row">
      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around p-2 z-50">
        {navItems
          .filter((item) => item.mobile)
          .map((item) => (
            <Link
              key={item.path}
              href={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              className={`flex flex-col items-center px-1 py-2 rounded-lg text-[10px] font-medium ${
                isActive(item.path) ? "text-teal-700 font-bold" : "text-slate-500"
              }`}
            >
              <item.icon className="w-5 h-5 mb-1" />
              {item.name}
            </Link>
          ))}
      </nav>

      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-slate-50 min-h-screen p-6 shrink-0 font-sans">
        <div className="mb-8 font-bold text-lg text-slate-800 tracking-tight flex items-center justify-between">
          <span>CICLO DE ESTUDOS</span>
        </div>
        <div className="flex flex-col space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? "bg-teal-50 text-teal-800 font-bold"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          ))}
        </div>
        
        {/* Sync Indicator */}
        <div className="mt-auto pt-4 border-t border-slate-200">
          <SyncManager />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 p-4 md:p-10 max-w-5xl mx-auto w-full">
        <div className="md:hidden">
          <SyncBanner />
        </div>
        <ClientOnly>{children}</ClientOnly>
      </main>
    </div>
  );
}
