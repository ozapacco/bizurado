"use client";

import { useEffect } from "react";
import { syncWithNeon } from "@/lib/client/engine";

export default function SyncManager() {
  useEffect(() => {
    let syncing = false;

    const doSync = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await syncWithNeon();
      } catch {
        // ignora falhas de rede silenciosamente
      } finally {
        syncing = false;
      }
    };

    // Sincroniza a cada 1 minuto (se a fila estiver vazia, a função retorna rápido)
    const interval = setInterval(doSync, 60000);

    // Sincroniza quando a aba volta a ficar visível
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        doSync();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Sincroniza na montagem inicial
    doSync();

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
