/**
 * lib/mpc/plan.ts — Plano diário via Motor de Progressão Cognitiva.
 *
 * Modo lado a lado (Shadow-friendly): NÃO grava em daily_plan/daily_budget.
 * Retorna o mesmo formato do /api/plan clássico + explicações por item e
 * metadados do motor (fase, dívida, invariantes) para comparação.
 */

import { generateSession } from "@mpc/engine";
import { ActionType } from "@mpc/domain";
import type { EngineOutput } from "@mpc/domain";
import { todayStr } from "@/lib/day";
import { assembleEngineInput, topicIdFrom, ASSEMBLER_VERSION } from "./assemble";

const KIND_BY_ACTION: Partial<Record<ActionType, "novo" | "revisao">> = {
  [ActionType.ADVANCE_NODE]: "novo",
  [ActionType.RETAIN_NODE]: "revisao",
  [ActionType.VALIDATE_NODE]: "revisao",
};

export interface EnginePlanItem {
  position: number;
  topicId: number;
  subjectName: string;
  topicName: string;
  kind: "novo" | "revisao";
  estMinutes: number;
  priority: number;
  studyCount: number;
  done: boolean;
  /** Extras do motor (ausentes no plano clássico) */
  action: string;
  score: number;
  reason: string;
  reasonCodes: string[];
}

export interface EnginePlanResponse {
  day: string;
  budgetMinutes: number;
  totalEstMinutes: number;
  disciplinas: number;
  items: EnginePlanItem[];
  engine: {
    version: string;
    assembler: string;
    phase: string;
    inputHash: string;
    candidateTopics: number;
    debt: { ratio: number; zone: string; maintenanceMinutes: number; capacityMinutes: number };
    invariants: { name: string; passed: boolean; message: string | null }[];
    persisted: false;
  };
}

export async function buildEnginePlan(
  budgetMinutes: number,
  now: Date = new Date()
): Promise<EnginePlanResponse> {
  const { input, topicMeta } = await assembleEngineInput(budgetMinutes, now);
  const output: EngineOutput = generateSession(input);

  const items: EnginePlanItem[] = [];
  for (const action of output.sessionPlan.actions) {
    const kind = KIND_BY_ACTION[action.actionType];
    if (!kind) continue; // CLOSE_SESSION etc. não viram item de plano

    const topicId = topicIdFrom(action.nodeId);
    const meta = topicMeta.get(topicId);
    if (!meta) continue;

    items.push({
      position: items.length + 1,
      topicId,
      subjectName: meta.subjectName,
      topicName: meta.topicName,
      kind,
      estMinutes: action.plannedMinutes,
      priority: meta.priority,
      studyCount: meta.studyCount,
      done: false,
      action: action.actionType,
      score: Math.round(action.finalScore * 1000) / 1000,
      reason: action.explanation.human,
      reasonCodes: action.reasonCodes,
    });
  }

  const totalEstMinutes =
    Math.round(items.reduce((s, i) => s + i.estMinutes, 0) * 10) / 10;
  const disciplinas = new Set(items.map((i) => i.subjectName)).size;

  return {
    day: todayStr(now),
    budgetMinutes,
    totalEstMinutes,
    disciplinas,
    items,
    engine: {
      version: output.engineVersion,
      assembler: ASSEMBLER_VERSION,
      phase: output.phase,
      inputHash: output.inputHash,
      candidateTopics: input.nodes.length,
      debt: {
        ratio: input.reviewDebt.debtRatio,
        zone: input.reviewDebt.zone,
        maintenanceMinutes: input.reviewDebt.projectedMaintenanceMinutes,
        capacityMinutes: input.reviewDebt.projectedCapacityMinutes,
      },
      invariants: output.invariantChecks.map((c) => ({
        name: c.name,
        passed: c.passed,
        message: c.message,
      })),
      persisted: false,
    },
  };
}
