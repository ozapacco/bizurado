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
  "nos", "nas", "para", "por", "com", "sem", "ao", "aos",
  "noções", "nocoes", "introducao", "introdução", "geral", "gerais", "parte",
  // "direito"/"direitos" NÃO entram aqui: em Direito Constitucional eles são o
  // termo discriminante. Com eles na lista, "Direitos Políticos" virava o token
  // único [politic] e reivindicava "Organização Político-administrativa" —
  // 339 cards do assunto errado. Medido: tirá-los zera as 8 ambiguidades.
  // "contra" também não entra: medido, adicioná-lo faz "Crimes contra a pessoa"
  // empatar com "Concurso de pessoas e concurso de crimes".
]);

function tokens(value: string): string[] {
  // Sem piso de tamanho. O antigo `length > 2` era assimétrico e caro: descartava
  // "I" e "II" mas mantinha "III", então "Classes de palavras I" reivindicava os
  // três módulos (1.934 cards). Mesma coisa com "1º" e "2º" grau, que eram
  // literalmente indistinguíveis. Os monossílabos inúteis já saem pelo STOP.
  return normalize(value)
    .split(" ")
    .filter((t) => t.length > 0 && !STOP.has(t));
}

/**
 * Radical curto para casar singular/plural e variações de sufixo
 * ("administrativo"/"administracao", "licitacao"/"licitacoes").
 */
function stem(token: string): string {
  const podado = token
    .replace(/(coes|cao|çoes|mentos|mento|ivos|ivas|ivo|iva|ais|eis|ores|ora|or|es|s)$/, "")
    .replace(/e$/, "");
  // Piso: sem ele "ação" virava "a" e "mais" virava "m", radicais que colidem
  // com qualquer coisa. Abaixo de 4 caracteres o token vale mais inteiro.
  return (podado.length >= 4 ? podado : token).slice(0, 7);
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

// Medido: entre 0,55 e 1,00 o resultado é IDÊNTICO — o corpus não tem nada
// entre 0,68 e 1,00, então este número não é a alavanca que parece ser. Em 0,50
// ele abre 87 pares de lixo de uma vez. Fica em 0,6 e não é aqui que se mexe.
const MIN_SCORE = 0.6;

// Margem abaixo do melhor módulo que ainda conta como o mesmo assunto. Existe
// porque Matemática tem dois blocos paralelos de estatística (05.xx e 07.xx)
// cobrindo o mesmo conteúdo, e o ciclo tem um assunto só para cada par.
// NÃO passar de 0,30: medido, em 0,35 voltam 11 pares de falso positivo e
// 12.039 cards de conteúdo errado.
const BAND = 0.25;

/**
 * Sinônimos no nível do assunto, para os casos em que os dois vocabulários
 * simplesmente usam palavras diferentes para a mesma coisa. Quatro entradas
 * resolvem tudo que sobrou e é resolúvel — é honestamente melhor que qualquer
 * ajuste de algoritmo, porque não é padrão, é vocabulário.
 */
const TOPIC_SYNONYMS: { topic: string; matches: string[] }[] = [
  { topic: "compreensao de textos", matches: ["interpretacao"] },
  { topic: "direitos politicos", matches: ["direitos politicos", "partidos politicos"] },
  { topic: "direitos fundamentais", matches: ["direitos e deveres individuais e coletivos"] },
  { topic: "teoria do crime", matches: ["conceito de crime"] },
];

function synonymsFor(cycleTopic: string): string[] | null {
  const alvo = normalize(cycleTopic);
  return TOPIC_SYNONYMS.find((e) => e.topic === alvo)?.matches ?? null;
}

/** O nome da aula: só o trecho depois do último ">". */
function lessonOf(topicName: string): string {
  const partes = topicName.split(">");
  return partes[partes.length - 1].trim();
}

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
  // 1. Sinônimo explícito vence tudo: é conhecimento que o algoritmo não tem.
  const sinonimos = synonymsFor(cycleTopic);
  if (sinonimos) {
    const porSinonimo = decks.filter((deck) => {
      const modulo = normalize(moduleOf(deck.name));
      return sinonimos.some((alvo) => modulo.includes(alvo) || alvo.includes(modulo));
    });
    if (porSinonimo.length > 0) return porSinonimo;
  }

  // 2. Casamento no nível do MÓDULO — a granularidade em que o edital é escrito.
  const porModulo = decks
    .map((deck) => ({ deck, score: similarity(cycleTopic, moduleOf(deck.name)) }))
    .filter((entry) => entry.score >= MIN_SCORE);

  if (porModulo.length > 0) {
    const best = Math.max(...porModulo.map((s) => s.score));
    return porModulo.filter((s) => s.score >= best - BAND).map((s) => s.deck);
  }

  // 3. Nenhum módulo serve: tentar a AULA isolada. Compara só o texto depois do
  // último ">" — usar o nome completo arrastaria o prefixo do módulo e produziria
  // o falso positivo clássico ("Atos Administrativos" casando com uma aula de TCU
  // que cita "sustação de atos"). Exige 2 termos, para um assunto de uma palavra
  // não varrer o baralho inteiro.
  if (tokens(cycleTopic).length < 2) return [];

  const porAula = decks
    .map((deck) => ({ deck, score: similarity(cycleTopic, lessonOf(deck.name)) }))
    .filter((entry) => entry.score >= MIN_SCORE);

  if (porAula.length === 0) return [];

  const best = Math.max(...porAula.map((s) => s.score));
  return porAula.filter((s) => s.score >= best - BAND).map((s) => s.deck);
}
