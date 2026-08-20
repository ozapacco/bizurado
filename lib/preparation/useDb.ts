import { useSyncExternalStore } from 'react';
import { getDb, getSeedDb } from './db';
import { DatabaseState } from './types';

// O servidor só conhece o seed de fábrica; o navegador conhece o estado real do
// localStorage. Ler o localStorage direto no primeiro render fazia o HTML do
// cliente divergir do servidor — o React descartava a árvore hidratada inteira
// e reclamava em toda tela. `useSyncExternalStore` existe exatamente para isso:
// hidrata com o snapshot do servidor e troca para o do cliente logo em seguida.

let snapshot: DatabaseState | null = null;

const listeners = new Set<() => void>();

function handleUpdate() {
  snapshot = null; // invalida: o próximo getSnapshot relê o localStorage
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('db-updated', handleUpdate);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('db-updated', handleUpdate);
    }
  };
}

// Precisa devolver a MESMA referência entre renders, ou o React entra em loop.
function getSnapshot(): DatabaseState {
  if (!snapshot) snapshot = getDb();
  return snapshot;
}

export function useDb(): DatabaseState {
  return useSyncExternalStore(subscribe, getSnapshot, getSeedDb);
}
