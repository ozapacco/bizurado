// Alinha o Ciclo de Estudos ao que existe de flashcard.
//
// Duas coisas ficam iguais depois de rodar isto:
//  1. o nome das disciplinas do ciclo passa a ser o nome canônico do baralho
//     ("Processo Penal" -> "Direito Processual Penal");
//  2. cada unidade de estudo dos baralhos vira um assunto do ciclo.
//
// A função é ADITIVA por princípio: nada que já existe é removido ou
// sobrescrito. Assuntos antigos mantêm o progresso (camadas, questões,
// acertos), e disciplinas do edital que ainda não têm baralho continuam no
// ciclo — não ter card não é motivo para parar de estudar a matéria.

import { matchTopicDecks, moduleOf, normalize, resolveSubjectName } from "@/lib/subjectMatch";
import type { DatabaseState, Subject, Topic, TopicProgress } from "./types";

/** Formato mínimo do índice de conteúdo (public/data/index.json). */
export type DeckIndex = {
  subjects: { id: number; name: string; topics: { id: number; name: string }[] }[];
};

export type AlignReport = {
  renamedSubjects: { from: string; to: string }[];
  addedSubjects: string[];
  addedTopics: { subject: string; topic: string }[];
  /** Disciplinas do ciclo que seguem sem baralho — estudo só por material. */
  subjectsWithoutDecks: string[];
  changed: boolean;
};

/**
 * Uma unidade está coberta quando algum assunto do ciclo REALMENTE devolve os
 * baralhos dela — a mesma regra que a interface usa para entregar os cards.
 *
 * Antes isto era um teste de similaridade próprio, mais permissivo que o do
 * consumidor: uma unidade era pulada como "já coberta" por um assunto que
 * depois não a entregava, e os baralhos dela ficavam órfãos. Foi assim que
 * "Crimes contra a pessoa" sequestrou quatro módulos inteiros de Direito Penal
 * (2.183 cards) sem entregar nenhum deles. Usando a regra do consumidor, órfão
 * deixa de ser possível por construção.
 */
function unitIsCovered(
  unit: string,
  existing: { name: string }[],
  deckTopics: { id: number; name: string }[]
): boolean {
  const chave = normalize(unit);
  const daUnidade = deckTopics
    .filter((d) => normalize(moduleOf(d.name)) === chave)
    .map((d) => d.id);
  if (daUnidade.length === 0) return true;

  return existing.some((t) => {
    const entregues = new Set(matchTopicDecks(t.name, deckTopics).map((d) => d.id));
    return daUnidade.every((id) => entregues.has(id));
  });
}

/**
 * A unidade de estudo de um baralho: o módulo (o que vem antes de ">") quando
 * há um, senão o próprio nome da aula. É o nível em que o edital é escrito.
 */
function unitOf(deckTopicName: string): string {
  const head = deckTopicName.includes(">")
    ? deckTopicName.split(">")[0]
    : deckTopicName;
  return head.trim();
}

/** Remove a numeração de aula do rótulo — o ciclo mostra o assunto, não o índice. */
function label(unit: string): string {
  const clean = unit.replace(/^\s*\d+(\s*[.\-]\s*\d+)*\s*[.)\-—–]?\s*/, "").trim();
  return clean.length > 2 ? clean : unit.trim();
}

function slug(value: string): string {
  return normalize(value).replace(/\s+/g, "_").slice(0, 40);
}

/** Unidades de um baralho, na ordem em que aparecem, sem repetição. */
function unitsOf(deckTopics: { name: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of deckTopics) {
    const unit = unitOf(t.name);
    const key = normalize(unit);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(unit);
  }
  return out;
}

/**
 * Calcula o estado alinhado sem tocar em nada — função pura, para poder ser
 * conferida antes de aplicar.
 */
export function planAlignment(
  db: DatabaseState,
  index: DeckIndex
): { next: DatabaseState; report: AlignReport } {
  const report: AlignReport = {
    renamedSubjects: [],
    addedSubjects: [],
    addedTopics: [],
    subjectsWithoutDecks: [],
    changed: false,
  };

  const plan = db.studyPlans[0];
  if (!plan) return { next: db, report };

  const next: DatabaseState = {
    ...db,
    // Cópia por valor: o rename abaixo alterava o objeto do chamador, então um
    // ensaio a seco já deixava o estado renomeado mesmo sem aplicar nada.
    subjects: db.subjects.map((s) => ({ ...s })),
    topics: db.topics.map((t) => ({ ...t })),
    topicProgresses: [...db.topicProgresses],
    materials: [...db.materials],
    subjectLayerStates: [...db.subjectLayerStates],
    subjectRoundStates: [...db.subjectRoundStates],
    topicTombstones: [...(db.topicTombstones ?? [])],
  };

  const deckNames = index.subjects.map((s) => s.name);
  const deckByName = new Map(index.subjects.map((s) => [s.name, s]));

  // 1. Casar cada disciplina do ciclo com a do baralho e canonizar o nome.
  const claimed = new Map<string, Subject>();
  for (const subject of next.subjects) {
    if (subject.study_plan_id !== plan.id) continue;
    const deckName = resolveSubjectName(subject.name, deckNames);
    if (!deckName || claimed.has(deckName)) {
      if (!deckName) report.subjectsWithoutDecks.push(subject.name);
      continue;
    }
    claimed.set(deckName, subject);
    if (subject.name !== deckName) {
      report.renamedSubjects.push({ from: subject.name, to: deckName });
      subject.name = deckName;
      report.changed = true;
    }
  }

  // 2. Criar as disciplinas que têm baralho e não estavam no ciclo.
  let nextOrder =
    next.subjects.reduce((max, s) => Math.max(max, s.cycle_order), 0) + 1;

  for (const deck of index.subjects) {
    if (claimed.has(deck.name)) continue;

    const subject: Subject = {
      id: `sub_${slug(deck.name)}`,
      study_plan_id: plan.id,
      name: deck.name,
      active: true,
      cycle_order: nextOrder++,
      block_minutes: 60,
      emphasis: 1.0,
    };
    next.subjects.push(subject);
    claimed.set(deck.name, subject);
    report.addedSubjects.push(deck.name);
    report.changed = true;

    next.subjectLayerStates.push({
      subject_id: subject.id,
      layer: plan.current_layer ?? 1,
      completed_in_layer: false,
      material_progress: 0,
    });
    next.subjectRoundStates.push({
      subject_id: subject.id,
      planned_minutes: subject.block_minutes,
      consumed_minutes: 0,
      remaining_minutes: subject.block_minutes,
    });
    next.materials.push({
      subject_id: subject.id,
      name: "Baralho de flashcards",
      type: "outro",
      total_units: unitsOf(deck.topics).length,
      current_unit: "01",
      current_page: "",
      checkpoint_note: "",
    });
  }

  // 3. Trazer as unidades dos baralhos que ainda não existem como assunto.
  for (const [deckName, subject] of claimed) {
    const deck = deckByName.get(deckName);
    if (!deck) continue;

    const existing = next.topics.filter((t) => t.subject_id === subject.id);
    let order = existing.reduce((max, t) => Math.max(max, t.order), 0) + 1;

    const lapides = new Set(
      next.topicTombstones
        .filter((l) => l.subject_name === subject.name)
        .map((l) => l.deck_unit_key)
    );

    for (const unit of unitsOf(deck.topics)) {
      const name = label(unit);
      const chave = normalize(unit);

      // O usuário já disse que não quer esta unidade. A decisão dele vence a
      // derivação — é a razão de a lápide existir.
      if (lapides.has(chave)) continue;

      if (unitIsCovered(unit, existing, deck.topics)) {
        // Aproveita a passagem para carimbar a procedência nos assuntos que
        // nasceram antes de o campo existir: sem isso, excluí-los não deixaria
        // lápide e eles voltariam.
        for (const t of existing) {
          if (!t.deck_unit_key && normalize(t.name) === chave) {
            t.deck_unit_key = chave;
            report.changed = true;
          }
        }
        continue;
      }

      const topic: Topic = {
        id: `topic_${slug(subject.name)}_${slug(name)}`,
        subject_id: subject.id,
        name,
        order: order++,
        // Não inventamos peso de edital: o que veio do baralho entra como
        // secundário até o usuário dizer o contrário.
        importance_tier: "SECONDARY",
        status: "active",
        origin: "deck",
        deck_unit_key: normalize(unit),
      };
      // Colisão de slug (truncado em 40 chars) descartava o assunto em silêncio,
      // levando os cards dele junto. Melhor sufixar do que sumir.
      let sufixo = 2;
      while (next.topics.some((t) => t.id === topic.id)) {
        topic.id = `topic_${slug(subject.name)}_${slug(name)}_${sufixo++}`;
      }

      next.topics.push(topic);
      existing.push(topic);

      const progress: TopicProgress = {
        user_id: plan.user_id,
        topic_id: topic.id,
        contact_count: 0,
        first_seen_at: null,
        last_seen_at: null,
        layer_1_completed: false,
        layer_2_completed: false,
        layer_3_completed: false,
        layer_4_completed: false,
        question_count: 0,
        correct_count: 0,
        difficulty_flag: "NONE",
      };
      next.topicProgresses.push(progress);
      report.addedTopics.push({ subject: subject.name, topic: name });
      report.changed = true;
    }
  }

  return { next, report };
}

/**
 * Aplica o alinhamento no estado local e devolve o relatório. Salvar dispara o
 * backup normal, então a versão anterior fica no histórico da nuvem — dá para
 * voltar atrás em um clique se o resultado não agradar.
 */
export async function applyDeckAlignment(): Promise<AlignReport> {
  const { getIndex } = await import("@/lib/client/engine");
  const { getDb, saveDb, setMeta } = await import("./db");

  const index = (await getIndex()) as unknown as DeckIndex;
  const { next, report } = planAlignment(getDb(), index);

  if (report.changed) saveDb(next);
  setMeta({ alignedAt: new Date().toISOString() });
  return report;
}
