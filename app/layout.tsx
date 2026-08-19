import type { Metadata } from "next";
import "./globals.css";
import { fontMono, fontSerif, fontUI } from "./fonts";
import Layout from "@/components/Layout";

export const metadata: Metadata = {
  title: "Ciclo de Estudos",
  description: "Sistema inteligente de preparação e flashcards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${fontUI.variable} ${fontSerif.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen font-sans bg-white text-slate-900 antialiased">
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
