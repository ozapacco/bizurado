"use client";

// Operações do usuário sobre os assuntos do ciclo.
//
// Regra que governa tudo aqui: os assuntos são DERIVADOS dos baralhos, então
// toda decisão do usuário precisa ficar registrada em algum lugar que o
// alinhamento consulte. Senão a derivação desfaz a escolha no próximo boot.

import { getDb, saveDb } from "./db";
import { normalize } from "@/lib/subjectMatch";
import type { DatabaseState, Topic, TopicProgress } from "./types";

function agora(): string {
  return new Date().toISOString();
}

function slug(value: string): string {
  return normalize(value).replace(/\s+/g, "_").slice(0, 40);
}

/** Quanto estudo já foi registrado neste assunto. */
export function topicProgressSummary(db: DatabaseState, topicId: string) {
  const p = db.topicProgresses.find((x) => x.topic_id === topicId);
  const camadas = p
    ? [p.layer_1_completed, p.layer_2_completed, p.layer_3_completed, p.layer_4_completed].filter(
        Boolean
      ).length
    : 0;
  const questoes = p?.question_count ?? 0;
  const contatos = p?.contact_count ?? 0;
  return { camadas, questoes, contatos, temProgresso: camadas > 0 || questoes > 0 || contatos > 0 };
}

/** Cria um assunto à mão. Nasce ativo e sem baralho — é o caso do "Crase". */
export function addTopic(subjectId: string, name: string, parentId?: string): Topic {
  const limpo = name.trim();
  if (!limpo) throw new Error("O assunto precisa de um nome.");

  const db = getDb();
  const disciplina = db.subjects.find((s) => s.id === subjectId);
  if (!disciplina) throw new Error("Disciplina não encontrada.");

  // Irmãos = mesmo pai. Nomes iguais em ramos diferentes são permitidos
  // ("Questões" pode existir sob Crase e sob Sintaxe).
  const irmaos = db.topics.filter(
    (t) => t.subject_id === subjectId && (t.parent_id ?? undefined) === parentId
  );
  if (irmaos.some((t) => normalize(t.name) === normalize(limpo))) {
    throw new Error(`"${limpo}" já existe aqui.`);
  }

  let id = `topic_user_${slug(disciplina.name)}_${slug(limpo)}`;
  let sufixo = 2;
  while (db.topics.some((t) => t.id === id)) {
    id = `topic_user_${slug(disciplina.name)}_${slug(limpo)}_${sufixo++}`;
  }

  const topic: Topic = {
    id,
    subject_id: subjectId,
    name: limpo,
    order: irmaos.reduce((max, t) => Math.max(max, t.order), 0) + 1,
    importance_tier: "CORE",
    status: "active",
    origin: "user",
    parent_id: parentId,
  };

  const progresso: TopicProgress = {
    user_id: db.studyPlans[0]?.user_id ?? "user_1",
    topic_id: id,
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

  // Criar um assunto com o nome de algo que já foi excluído desfaz a lápide:
  // a intenção mais recente vence.
  const chave = normalize(limpo);
  saveDb({
    ...db,
    topics: [...db.topics, topic],
    topicProgresses: [...db.topicProgresses, progresso],
    topicTombstones: db.topicTombstones.filter(
      (l) => !(l.subject_name === disciplina.name && l.deck_unit_key === chave)
    ),
  });

  return topic;
}

/** Renomeia sem quebrar o vínculo com os baralhos (`deck_unit_key` fica). */
export function renameTopic(topicId: string, name: string): void {
  const limpo = name.trim();
  if (!limpo) throw new Error("O assunto precisa de um nome.");

  const db = getDb();
  saveDb({
    ...db,
    topics: db.topics.map((t) => (t.id === topicId ? { ...t, name: limpo } : t)),
  });
}

export function setTopicStatus(
  topicId: string,
  status: "active" | "suspended",
  reason?: string
): void {
  const db = getDb();
  saveDb({
    ...db,
    topics: db.topics.map((t) =>
      t.id === topicId
        ? {
            ...t,
            status,
            status_reason: status === "suspended" ? reason?.trim() || undefined : undefined,
            status_changed_at: agora(),
          }
        : t
    ),
  });
}

/**
 * Apaga o assunto de verdade e deixa a lápide.
 *
 * A lápide só existe para assunto derivado de baralho — é o que impede o
 * alinhamento de recriá-lo. Assunto criado à mão não precisa: o alinhamento
 * nunca inventa um.
 */
export function deleteTopic(topicId: string): void {
  const db = getDb();
  const topic = db.topics.find((t) => t.id === topicId);
  if (!topic) return;

  // Excluir um pai leva o galho inteiro. Deixar filho órfão apontando para um
  // pai inexistente sumiria da árvore sem sumir dos dados.
  const galho = subtreeOf(db, topicId);
  const ids = new Set(galho.map((t) => t.id));
  const disciplina = db.subjects.find((s) => s.id === topic.subject_id);

  const lapides = [...db.topicTombstones];
  if (disciplina) {
    for (const t of galho) {
      if (t.origin !== "deck") continue;
      const chave = t.deck_unit_key ?? normalize(t.name);
      const jaTem = lapides.some(
        (l) => l.subject_name === disciplina.name && l.deck_unit_key === chave
      );
      if (!jaTem) {
        lapides.push({
          subject_name: disciplina.name,
          deck_unit_key: chave,
          last_name: t.name,
          at: agora(),
        });
      }
    }
  }

  saveDb({
    ...db,
    topics: db.topics.filter((t) => !ids.has(t.id)),
    topicProgresses: db.topicProgresses.filter((p) => !ids.has(p.topic_id)),
    topicTombstones: lapides,
  });
}

/** Traz de volta algo excluído: apaga a lápide e recria no próximo alinhamento. */
export function restoreTombstone(subjectName: string, deckUnitKey: string): void {
  const db = getDb();
  saveDb({
    ...db,
    topicTombstones: db.topicTombstones.filter(
      (l) => !(l.subject_name === subjectName && l.deck_unit_key === deckUnitKey)
    ),
  });
}

// ---------------------------------------------------------------------------
// Árvore de assuntos
// ---------------------------------------------------------------------------

/** Filhos diretos, na ordem. */
export function childrenOf(db: DatabaseState, topicId: string): Topic[] {
  return db.topics
    .filter((t) => t.parent_id === topicId)
    .sort((a, b) => a.order - b.order);
}

/** Folha = assunto sem filhos. É quem entra na rotação e no progresso. */
export function isLeaf(db: DatabaseState, topicId: string): boolean {
  return !db.topics.some((t) => t.parent_id === topicId);
}

/** Da raiz até o assunto, inclusive. Usado para rótulo e para herdar baralho. */
export function pathOf(db: DatabaseState, topicId: string): Topic[] {
  const caminho: Topic[] = [];
  const vistos = new Set<string>();
  let atual = db.topics.find((t) => t.id === topicId);
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    caminho.unshift(atual);
    atual = atual.parent_id ? db.topics.find((t) => t.id === atual!.parent_id) : undefined;
  }
  return caminho;
}

/** Nome completo: "Crase · Casos especiais". */
export function fullName(db: DatabaseState, topicId: string): string {
  return pathOf(db, topicId)
    .map((t) => t.name)
    .join(" · ");
}

/** O assunto e toda a descendência dele. */
export function subtreeOf(db: DatabaseState, topicId: string): Topic[] {
  const out: Topic[] = [];
  const fila = [topicId];
  const vistos = new Set<string>();
  while (fila.length > 0) {
    const id = fila.shift()!;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const t = db.topics.find((x) => x.id === id);
    if (t) out.push(t);
    for (const f of db.topics.filter((x) => x.parent_id === id)) fila.push(f.id);
  }
  return out;
}

/**
 * Assuntos que efetivamente contam numa disciplina: folhas ativas.
 *
 * Um ancestral pausado tira o galho inteiro de escopo — pausar "Crase" precisa
 * pausar os subassuntos dela também, senão a pausa não significa nada.
 */
export function scopedLeaves(db: DatabaseState, subjectId?: string): Topic[] {
  const emEscopo = (t: Topic): boolean =>
    pathOf(db, t.id).every((a) => a.status === "active");

  return db.topics.filter(
    (t) =>
      (subjectId === undefined || t.subject_id === subjectId) &&
      isLeaf(db, t.id) &&
      emEscopo(t)
  );
}

/** Assuntos ordenados em árvore, com a profundidade de cada um. */
export function treeOf(db: DatabaseState, subjectId: string): { topic: Topic; depth: number }[] {
  const out: { topic: Topic; depth: number }[] = [];
  const visitar = (pai: string | undefined, depth: number) => {
    const filhos = db.topics
      .filter((t) => t.subject_id === subjectId && (t.parent_id ?? undefined) === pai)
      .sort((a, b) => a.order - b.order);
    for (const f of filhos) {
      out.push({ topic: f, depth });
      visitar(f.id, depth + 1);
    }
  };
  visitar(undefined, 0);
  return out;
}
