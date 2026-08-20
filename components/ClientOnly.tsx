"use client";

import { useEffect, useState } from "react";

/**
 * Segura o conteúdo até o navegador assumir.
 *
 * Todo o estado do ciclo mora no `localStorage`, e vários helpers do plano
 * (`getCurrentSubject`, `getPlanId`, `getCurrentLayer`) leem de lá direto no
 * render, por fora da store do `useDb`. O servidor só conhece o seed de fábrica,
 * então o HTML servido divergia do que o cliente montava — o React descartava a
 * árvore hidratada inteira e reclamava em todas as telas.
 *
 * Renderizar no servidor não traz nada aqui: é um app de um usuário só, atrás de
 * senha, sem indexação. Melhor assumir isso do que remendar tela por tela.
 */
export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  if (!montado) {
    return (
      <div className="animate-pulse space-y-4 motion-reduce:animate-none" aria-hidden="true">
        <div className="h-8 w-48 rounded bg-slate-100" />
        <div className="h-32 rounded-xl bg-slate-100" />
        <div className="h-56 rounded-xl bg-slate-100" />
      </div>
    );
  }

  return <>{children}</>;
}
