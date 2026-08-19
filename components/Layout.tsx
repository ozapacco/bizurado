"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, RefreshCw, BookOpen, ListChecks, TrendingUp, Settings } from "lucide-react";
import SyncManager from "./SyncManager";

type LayoutProps = {
  children: React.ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const pathname = usePathname();

  const navItems = [
    { name: "Hoje", path: "/", icon: Home },
    { name: "Ciclo", path: "/ciclo", icon: RefreshCw },
    { name: "Disciplinas", path: "/disciplinas", icon: BookOpen },
    { name: "Questões", path: "/questoes", icon: ListChecks },
    { name: "Progresso", path: "/progresso", icon: TrendingUp },
    { name: "Configurações", path: "/configuracoes", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col md:flex-row">
      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around p-2 z-50">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex flex-col items-center p-2 rounded-lg text-xs font-medium ${
              pathname === item.path ? "text-teal-700 font-bold" : "text-slate-500"
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
              className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.path
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
        {children}
      </main>
    </div>
  );
}
