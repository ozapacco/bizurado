// Ponte entre o vocabulário do Ciclo de Estudos e o dos baralhos.
//
// O ciclo fala em temas largos ("Controle Administrativo"); os baralhos são
// aulas numeradas dentro de módulos ("6. Controle da Administração Pública >
// 1.1 controle interno, externo e popular"). Comparar os dois por igualdade de
// string acerta praticamente nada — daí este módulo.

/** Minúsculas, sem acento, sem numeração de aula, sem pontuação sobrando. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+(\s*\.\s*\d+)*\s*[.)-]?\s*/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** O nome do módulo é o que vem antes de ">"; sem ">", o próprio nome. */
export function moduleOf(topicName: string): string {
  const [head] = topicName.split(">");
  return head.trim();
}

// Palavras que não distinguem nada em edital de concurso.
const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "em", "no", "na",
  "nos", "nas", "para", "por", "com", "sem", "ao", "aos", "direito", "direitos",
  "noções", "nocoes", "introducao", "introdução", "geral", "gerais", "parte",
]);

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Radical curto para casar singular/plural e variações de sufixo
 * ("administrativo"/"administracao", "licitacao"/"licitacoes").
 */
function stem(token: string): string {
  return token
    .replace(/(coes|cao|çoes|mentos|mento|ivos|ivas|ivo|iva|ais|eis|ores|ora|or|es|s)$/, "")
    .slice(0, 7);
}

/**
 * 0 a 1: quanto do tema do ciclo aparece no nome do baralho. Exige cobertura
 * dos termos do ciclo — é melhor não oferecer baralho do que mandar o usuário
 * para o assunto errado no meio da revisão.
 */
export function similarity(cycleName: string, deckName: string): number {
  const a = tokens(cycleName).map(stem);
  const b = new Set(tokens(deckName).map(stem));
  if (a.length === 0 || b.size === 0) return 0;
  const hits = a.filter((t) => b.has(t)).length;
  return hits / a.length;
}

const MIN_SCORE = 0.6;

/** Apelidos entre o nome da disciplina no ciclo e o nome no índice de cards. */
const SUBJECT_ALIASES: Record<string, string[]> = {
  "direito processual penal": ["processo penal", "processual penal", "dpp"],
  "legislacao penal especial": ["leis penais especiais", "legislacao especial"],
  "direito penal": ["penal"],
  "direito constitucional": ["constitucional"],
  "direito administrativo": ["administrativo"],
  matematica: ["raciocinio logico", "matematica e raciocinio logico"],
  portugues: ["lingua portuguesa"],
};

/**
 * Resolve o nome da disciplina do ciclo para o nome equivalente no índice de
 * baralhos. Devolve null quando não existe baralho — a interface deve dizer
 * isso, não esconder.
 */
export function resolveSubjectName(
  cycleSubject: string,
  availableSubjects: string[]
): string | null {
  const target = normalize(cycleSubject);

  const exact = availableSubjects.find((s) => normalize(s) === target);
  if (exact) return exact;

  const byAlias = availableSubjects.find((s) => {
    const aliases = SUBJECT_ALIASES[normalize(s)];
    return aliases?.some((a) => normalize(a) === target);
  });
  if (byAlias) return byAlias;

  const contained = availableSubjects.find((s) => {
    const n = normalize(s);
    return n.includes(target) || target.includes(n);
  });
  return contained ?? null;
}

export type DeckLike = { id: number; name: string };

/**
 * Baralhos que cobrem um tema do ciclo.
 *
 * O casamento é feito no nível do MÓDULO ("6. Controle da Administração
 * Pública"), não da aula. Comparar com o nome da aula gera falso positivo fácil
 * — "Atos Administrativos" bateria numa aula de TCU que cita "sustação de atos"
 * — e mandar o usuário para o baralho errado no meio da revisão custa mais caro
 * que não oferecer baralho nenhum. Sem módulo à altura, devolve vazio, e a
 * interface diz isso em vez de esconder.
 */
export function matchTopicDecks<T extends DeckLike>(cycleTopic: string, decks: T[]): T[] {
  const scored = decks
    .map((deck) => ({ deck, score: similarity(cycleTopic, moduleOf(deck.name)) }))
    .filter((entry) => entry.score >= MIN_SCORE);

  if (scored.length === 0) return [];

  // Só o módulo mais aderente — nunca uma mistura de módulos diferentes.
  const best = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score >= best - 0.01).map((s) => s.deck);
}
