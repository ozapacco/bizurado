import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Tema "caderno de aprovado" (DESIGN.md) — light-first, tingido do
      // azul-petróleo da marca. As telas migram superfície a superfície.
      colors: {
        paper: "oklch(0.985 0.004 210 / <alpha-value>)",
        surface: "oklch(0.962 0.006 210 / <alpha-value>)",
        ink: {
          DEFAULT: "oklch(0.24 0.03 220 / <alpha-value>)",
          soft: "oklch(0.42 0.025 220 / <alpha-value>)",
        },
        line: "oklch(0.88 0.008 210 / <alpha-value>)",
        accent: {
          DEFAULT: "oklch(0.48 0.09 215 / <alpha-value>)",
          deep: "oklch(0.40 0.09 215 / <alpha-value>)",
        },
        grade: {
          again: "oklch(0.50 0.16 25 / <alpha-value>)",
          hard: "oklch(0.50 0.11 70 / <alpha-value>)",
          good: "oklch(0.48 0.09 215 / <alpha-value>)",
          easy: "oklch(0.48 0.11 150 / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-ui)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
