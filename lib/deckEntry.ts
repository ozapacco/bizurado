// Por qual baralho começar, quando um assunto do ciclo cobre vários.
//
// Existia em dois lugares com regras diferentes: o engine desempatava por
// cards novos, a tela de disciplinas não — e como quase todos os 44.908 cards
// ainda são novos, `dueNow` é zero em todo lugar e a tela caía no primeiro do
// array em vez do baralho mais cheio. Uma regra só, num lugar só.

export type DeckLikeCounts = {
  id: number;
  dueNow: number;
  novos: number;
};

/**
 * O baralho de entrada: o com mais cards vencidos; sem nenhum vencido, o com
 * mais cards novos. Devolve null para lista vazia.
 */
export function pickEntryDeck<T extends DeckLikeCounts>(decks: T[]): T | null {
  if (decks.length === 0) return null;

  const porVencidos = [...decks].sort((a, b) => b.dueNow - a.dueNow);
  if ((porVencidos[0]?.dueNow ?? 0) > 0) return porVencidos[0];

  const porNovos = [...decks].sort((a, b) => b.novos - a.novos);
  return porNovos[0] ?? decks[0];
}
