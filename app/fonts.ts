import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

// UI: navegação, botões, labels, formulários.
export const fontUI = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});

// Conteúdo dos cards e títulos — a serifa carrega o "caderno".
export const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
});

// Dados: contadores, "volta N", datas, atalhos.
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});
