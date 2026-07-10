/**
 * lib/mpc/assemble.ts — Assembler: banco do Bizurado → EngineInput do MPC.
 *
 * Papel definido no PRD do Motor de Progressão Cognitiva (§50):
 *   Database → Assembler → EngineInput → Core Engine (puro) → EngineOutput
 *
 * Este módulo é a ÚNICA camada que conhece os dois mundos:
 *   - lê card_states (FSRS), review_log, topic_study, topic_sessions
 *   - produz um EngineInput determinístico para @mpc/engine
 *
 * Mapeamentos de evidência (dados reais > heurística):
 *   - retrievability FSRS média do tópico  → R e forgettingRisk
 *   - share de cards "again" (rating=1) 30d → recentErrorScore
 *   - minutos reais de topic_sessions 14d   → CapacityProfile
 *   - prioridade manual (1–5)               → objectiveWeight
 *
 * Teto honesto: sem questões no Bizurado não há evidência de APLICAÇÃO,
 * logo A=0 e estado máximo N3 (STATE-INV-002 do MPC).
 */

import {
  NodeState,
  NodeRisk,
  NodeType,
  CoverageStatus,
  DebtZone,
  ObjectiveType,
  DEFAULT_ENGINE_CONSTRAINTS,
} from "@mpc/domain";
import type {
  EngineInput,
  NodeDecisionState,
  ReviewDebtState,
  ActiveAcquisitionNode,
} from "@mpc/domain";
import { query } from "@/lib/db";
import { startOfNextDayISO } from "@/lib/day";
import { estimateFromNeed } from "@/lib/cycle";
import { DECAY, FACTOR } from "@/lib/fsrs";

export const ASSEMBLER_VERSION = "bizurado-assembler@0.1.0";

interface TopicAggRow {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  priority: number;
  studyCount: number;
  minPerCard: number | null;
  status: string;
  lastStudied: string | null;
  totalCards: number;
  seenCards: number;
  newCards: number;
  dueCards: number;
  avgStability: number | null;
  avgRetrievability: number | null;
  totalLapses: number;
}

interface ReviewAggRow {
  topicId: number;
  reviews30: number;
  againRate: number;
  lastReviewDate: string | null;
}

interface CapacityRow {
  day: string;
  minutes: number;
}

/** Identificador de nó estável e legível: TOPIC.<id>. */
export function nodeIdFor(topicId: number): string {
  return `TOPIC.${topicId}`;
}
export function topicIdFrom(nodeId: string): number {
  return Number(nodeId.replace(/^TOPIC\./, ""));
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Deriva o estado N0–N3 do tópico a partir da evidência FSRS.
 * Escada deterministica e conservadora (EVIDENCE-BEFORE-BELIEF):
 *   - nenhum card visto           → N0
 *   - visto mas < 30% graduado    → N1 (exposto)
 *   - graduado mas R fraca        → N2 (compreendido, recuperação incerta)
 *   - R média ≥ 0.65 e ≥ 50% visto → N3 (recuperável) — TETO sem questões
 */
function deriveState(row: TopicAggRow): { state: NodeState; C: number; R: number } {
  const seenShare = row.totalCards > 0 ? row.seenCards / row.totalCards : 0;
  const R = clamp(row.avgRetrievability ?? 0, 0, 1);
  const C = clamp(seenShare, 0, 1);

  if (row.seenCards === 0) return { state: NodeState.N0_NOT_SEEN, C: 0, R: 0 };
  if (seenShare < 0.3) return { state: NodeState.N1_EXPOSED, C, R };
  if (R < 0.65 || seenShare < 0.5) return { state: NodeState.N2_UNDERSTOOD, C, R };
  return { state: NodeState.N3_RETRIEVABLE, C, R };
}

function deriveRisk(state: NodeState, forgettingRisk: number, dueShare: number): NodeRisk {
  if (state === NodeState.N0_NOT_SEEN) return NodeRisk.UNKNOWN;
  if (forgettingRisk >= 0.6 || dueShare >= 0.5) return NodeRisk.HIGH;
  if (forgettingRisk >= 0.35 || dueShare >= 0.25) return NodeRisk.MODERATE;
  return NodeRisk.LOW;
}

const COVERAGE_BY_STATE: Partial<Record<NodeState, CoverageStatus>> = {
  [NodeState.N0_NOT_SEEN]: CoverageStatus.NOT_COVERED,
  [NodeState.N1_EXPOSED]: CoverageStatus.EXPOSED,
  [NodeState.N2_UNDERSTOOD]: CoverageStatus.ACQUIRED,
  [NodeState.N3_RETRIEVABLE]: CoverageStatus.ACQUIRED,
};

export interface AssembledContext {
  input: EngineInput;
  /** topicId → metadados para montar a resposta da rota */
  topicMeta: Map<number, { topicName: string; subjectName: string; priority: number; studyCount: number }>;
}

export async function assembleEngineInput(
  budgetMinutes: number,
  now: Date = new Date()
): Promise<AssembledContext> {
  const boundary = startOfNextDayISO(now);
  const nowIso = now.toISOString();
  const cutoff30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const cutoff14 = new Date(now.getTime() - 14 * 86400000).toISOString();

  // ── 1. Agregado por tópico: contagens + FSRS ─────────────────────────────
  // retrievability = (1 + FACTOR * t/S)^DECAY, t = dias desde last_review.
  const topicRows = (await query(
    `SELECT
       ts.topic_id                     AS "topicId",
       t.name                          AS "topicName",
       t.subject_id                    AS "subjectId",
       s.name                          AS "subjectName",
       ts.priority                     AS "priority",
       ts.study_count                  AS "studyCount",
       ts.min_per_card                 AS "minPerCard",
       ts.status                       AS "status",
       ts.last_studied                 AS "lastStudied",
       COUNT(c.id)::int                AS "totalCards",
       SUM(CASE WHEN COALESCE(cs.suspended,0)=0 AND COALESCE(cs.reps,0) > 0 THEN 1 ELSE 0 END)::int AS "seenCards",
       SUM(CASE WHEN COALESCE(cs.suspended,0)=0 AND COALESCE(cs.reps,0) = 0 THEN 1 ELSE 0 END)::int AS "newCards",
       SUM(CASE WHEN COALESCE(cs.suspended,0)=0 AND COALESCE(cs.reps,0) > 0 AND cs.due < $1 THEN 1 ELSE 0 END)::int AS "dueCards",
       AVG(CASE WHEN COALESCE(cs.suspended,0)=0 AND COALESCE(cs.reps,0) > 0 THEN cs.stability END) AS "avgStability",
       AVG(CASE WHEN COALESCE(cs.suspended,0)=0 AND COALESCE(cs.reps,0) > 0 AND cs.last_review IS NOT NULL AND cs.stability > 0
                THEN power(
                       1 + ($2::double precision) *
                           (GREATEST(0, EXTRACT(EPOCH FROM ($3::timestamptz - cs.last_review::timestamptz)) / 86400.0)
                            / GREATEST(cs.stability, 0.1)),
                       $4::double precision)
           END)                        AS "avgRetrievability",
       COALESCE(SUM(cs.lapses), 0)::int AS "totalLapses"
     FROM topic_study ts
     JOIN topics t   ON t.id = ts.topic_id
     JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN cards c        ON c.topic_id = t.id
     LEFT JOIN card_states cs ON cs.card_id = c.id
     GROUP BY ts.topic_id, t.name, t.subject_id, s.name, ts.priority,
              ts.study_count, ts.min_per_card, ts.status, ts.last_studied`,
    [boundary, FACTOR, nowIso, DECAY]
  )) as unknown as TopicAggRow[];

  // ── 2. Evidência recente (review_log 30 dias) ────────────────────────────
  const reviewRows = (await query(
    `SELECT c.topic_id AS "topicId",
            COUNT(*)::int AS "reviews30",
            AVG(CASE WHEN rl.rating = 1 THEN 1.0 ELSE 0.0 END) AS "againRate",
            MAX(rl.review_date) AS "lastReviewDate"
     FROM review_log rl
     JOIN cards c ON c.id = rl.card_id
     WHERE rl.review_date >= $1
     GROUP BY c.topic_id`,
    [cutoff30]
  )) as unknown as ReviewAggRow[];
  const reviewByTopic = new Map(reviewRows.map((r) => [r.topicId, r]));

  // ── 3. Capacidade real (topic_sessions 14 dias) — INV-005 ────────────────
  const capacityRows = (await query(
    `SELECT day, SUM(minutes)::double precision AS minutes
     FROM topic_sessions
     WHERE finished_at IS NOT NULL AND finished_at >= $1
     GROUP BY day ORDER BY day`,
    [cutoff14]
  )) as unknown as CapacityRow[];

  const activeDays = capacityRows.length;
  const totalMinutes14 = capacityRows.reduce((s, r) => s + (r.minutes || 0), 0);
  // média sobre 14 dias corridos (dias zero contam — capacidade real, não aspiracional)
  const expectedDailyMinutes = activeDays > 0 ? Math.round(totalMinutes14 / 14) : budgetMinutes;

  const lastSession = (await query(
    `SELECT MAX(finished_at) AS last FROM topic_sessions WHERE finished_at IS NOT NULL`
  )) as unknown as { last: string | null }[];
  const lastSessionAt = lastSession[0]?.last ?? null;
  const daysSinceLastSession = lastSessionAt
    ? Math.floor((now.getTime() - new Date(lastSessionAt).getTime()) / 86400000)
    : null;

  // ── 4. Montar NodeDecisionState por tópico ───────────────────────────────
  const topicMeta = new Map<number, { topicName: string; subjectName: string; priority: number; studyCount: number }>();
  const nodes: NodeDecisionState[] = [];
  let totalDueMinutes = 0;

  for (const row of topicRows) {
    if (row.totalCards === 0) continue; // GATE-G-002: sem ativos, não é candidato

    topicMeta.set(row.topicId, {
      topicName: row.topicName,
      subjectName: row.subjectName,
      priority: row.priority,
      studyCount: row.studyCount,
    });

    const rev = reviewByTopic.get(row.topicId);
    const { state, C, R } = deriveState(row);
    const dueShare = row.seenCards > 0 ? row.dueCards / row.seenCards : 0;
    const forgettingRisk = round3(clamp(0.7 * (1 - R) + 0.3 * dueShare, 0, 1));
    const recentErrorScore = round3(clamp((rev?.againRate ?? 0) * 1.2, 0, 1));
    const stabilityScore = round3(clamp((row.avgStability ?? 0) / 60, 0, 1)); // ~60d estável = 1.0

    const daysSinceRetrieval = rev?.lastReviewDate
      ? Math.floor((now.getTime() - new Date(rev.lastReviewDate).getTime()) / 86400000)
      : null;
    const daysSinceExposure = row.lastStudied
      ? Math.floor((now.getTime() - new Date(row.lastStudied).getTime()) / 86400000)
      : daysSinceRetrieval;

    const retainMinutes = estimateFromNeed(row.dueCards, row.minPerCard);
    totalDueMinutes += retainMinutes;

    // Chunks executáveis por sessão (ENG-INV-008): reter até 15 min,
    // avançar em blocos de até 20 cards novos.
    const advanceChunk = estimateFromNeed(Math.min(row.newCards, 20), row.minPerCard);
    const evidenceConfidence = clamp((rev?.reviews30 ?? 0) / 40, 0.1, 0.9);

    nodes.push({
      nodeId: nodeIdFor(row.topicId),
      nodeType: NodeType.TOPIC,
      state,
      risk: deriveRisk(state, forgettingRisk, dueShare),
      stateConfidence: round3(evidenceConfidence),
      C: round3(C),
      R: round3(R),
      A: 0, // sem questões, sem evidência de aplicação (STATE-INV-002)
      S: stabilityScore,
      CConfidence: round3(evidenceConfidence),
      RConfidence: round3(evidenceConfidence),
      AConfidence: 0,
      SConfidence: round3(evidenceConfidence * 0.8),
      objectiveWeight: round3(row.priority / 5),
      incidenceScore: null,
      coverageStatus: COVERAGE_BY_STATE[state] ?? CoverageStatus.ACQUIRED,
      prerequisiteStatus: { hardMet: true, softScore: 1, blockedBy: [] }, // Bizurado ainda não tem grafo
      continuityScore: round3(
        daysSinceExposure === null ? 0 : clamp(1 - daysSinceExposure / 3, 0, 1) // bônus 72h
      ),
      forgettingRisk,
      masteryUncertainty: round3(clamp(1 - evidenceConfidence, 0.1, 1)),
      // Neutro (0.5): o Bizurado ainda não tem grafo de confusão entre tópicos,
      // e a policy de avanço usa este campo como prerequisite centrality — 0
      // zeraria 20% do score de avanço de forma sistemática.
      confusabilityScore: 0.5,
      recentErrorScore,
      highConfidenceErrorScore: 0, // rating FSRS não distingue confiança declarada
      daysSinceExposure,
      daysSinceRetrieval,
      daysSinceValidation: null,
      estimatedAdvanceMinutes: clamp(Math.round(advanceChunk), 5, 25),
      estimatedRetainMinutes: clamp(Math.round(retainMinutes), 3, 15),
      estimatedValidateMinutes: 10,
      availableAssets: {
        hasFlashcards: row.totalCards > 0,
        hasQuestions: false,
        hasDocuments: false,
        flashcardCount: row.totalCards,
        questionCount: 0,
        classARatio: 0.5, // sem classificação A/B/C ainda — neutro
        estimatedRetainSeconds: Math.round(row.dueCards * (row.minPerCard ?? 0.25) * 60),
      },
      evidenceCoverage: {
        hasExposure: row.seenCards > 0,
        hasComprehension: C >= 0.5,
        hasRetrieval: (rev?.reviews30 ?? 0) > 0,
        hasApplication: false,
        distributedDays: Math.min(row.studyCount, 10),
        spanDays: daysSinceExposure ?? 0,
      },
      activeAcquisition: false, // preenchido abaixo para os 3 mais recentes
    });
  }

  // ── 5. WIP: os 3 tópicos 'learning' estudados mais recentemente ──────────
  const learning = topicRows
    .filter((r) => r.status === "learning" && r.lastStudied)
    .sort((a, b) => (b.lastStudied! < a.lastStudied! ? -1 : 1))
    .slice(0, 3);
  const learningIds = new Set(learning.map((r) => nodeIdFor(r.topicId)));
  for (const n of nodes) {
    if (learningIds.has(n.nodeId)) n.activeAcquisition = true;
  }
  const activeAcquisitionNodes: ActiveAcquisitionNode[] = learning.map((r) => ({
    nodeId: nodeIdFor(r.topicId),
    startedAt: r.lastStudied!,
    estimatedTotalMinutes: Math.round(estimateFromNeed(r.totalCards, r.minPerCard)),
    elapsedMinutes: 0,
  }));

  // ── 6. Dívida de revisão (INV-010): manutenção devida vs capacidade ──────
  const debtRatio = expectedDailyMinutes > 0
    ? round3(totalDueMinutes / expectedDailyMinutes)
    : 1;
  const zone: DebtZone =
    debtRatio > 0.55 ? DebtZone.CRITICAL : debtRatio > 0.4 ? DebtZone.ALERT : DebtZone.NORMAL;

  const reviewDebt: ReviewDebtState = {
    debtRatio,
    zone,
    criticalMinutes: Math.round(totalDueMinutes * 0.3),
    strategicMinutes: Math.round(totalDueMinutes * 0.4),
    peripheralMinutes: Math.round(totalDueMinutes * 0.3),
    projectedCapacityMinutes: expectedDailyMinutes,
    projectedMaintenanceMinutes: Math.round(totalDueMinutes),
  };

  const input: EngineInput = {
    userId: "bizurado",
    objectiveId: "obj-bizurado",
    availableMinutes: budgetMinutes,
    now: nowIso,
    objective: {
      objectiveId: "obj-bizurado",
      objectiveType: ObjectiveType.CAREER_BASE,
      targetDate: null,
      examProximityDays: null,
    },
    nodes,
    capacityProfile: {
      userId: "bizurado",
      expectedDailyMinutes,
      expectedWeeklyMinutes: expectedDailyMinutes * 7,
      variance: 0,
      confidence: clamp(activeDays / 14, 0.2, 0.9),
      calculatedAt: nowIso,
      modelVersion: ASSEMBLER_VERSION,
    },
    reviewDebt,
    recentEvidence: [],
    activeAcquisitionNodes,
    sessionHistory: {
      lastSessionDate: lastSessionAt,
      recentCompletionRate: 0.8,
      daysSinceLastSession,
      recentOverrideRate: 0,
    },
    constraints: { ...DEFAULT_ENGINE_CONSTRAINTS },
    engineVersion: "0.1.0",
    policyVersion: "0.1.0",
  };

  return { input, topicMeta };
}
