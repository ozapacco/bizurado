import { DatabaseState, Subject } from './types';
import { buildConsolidatedPlan, ConsolidatedDiscipline } from './consolidatedPlanEngine';
import { saveDb } from './db';

export interface CycleSuggestion {
  subject_id: string;
  canonical_discipline_id: string;
  name: string;
  recommended_block_minutes: number;
  current_block_minutes: number;
  emphasis_label: 'MUITO ALTA' | 'ALTA' | 'MÉDIA' | 'BAIXA';
  reason: string;
  user_override: boolean;
}

const HUMAN_INCREMENTS = [30, 40, 45, 50, 60, 75, 90, 120];

export function snapToHumanMinutes(rawMinutes: number): number {
  const minCapped = Math.max(30, Math.min(120, rawMinutes));
  let closest = HUMAN_INCREMENTS[0];
  let minDiff = Math.abs(minCapped - closest);

  for (let i = 1; i < HUMAN_INCREMENTS.length; i++) {
    const diff = Math.abs(minCapped - HUMAN_INCREMENTS[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = HUMAN_INCREMENTS[i];
    }
  }

  return closest;
}

export function generateCycleSuggestions(db: DatabaseState, weeklyHours: number = 20): CycleSuggestion[] {
  const plan = buildConsolidatedPlan(db);
  const totalWeightSum = plan.disciplines.reduce((acc, d) => acc + d.combined_weight, 0);

  if (totalWeightSum === 0 || plan.disciplines.length === 0) return [];

  // Total target cycle minutes ~ weeklyHours * 60 / 2 (assuming 2 rounds per week)
  const targetCycleMinutes = Math.max(300, (weeklyHours * 60) / 2);

  return plan.disciplines.map(disc => {
    const weightFraction = disc.combined_weight / totalWeightSum;
    const rawMinutes = targetCycleMinutes * weightFraction;
    const recommended = snapToHumanMinutes(rawMinutes);

    // Find existing subject in DB matching discipline name
    const existingSub = db.subjects.find(s => 
      s.name.toLowerCase() === disc.name.toLowerCase() || 
      s.name.toLowerCase().includes(disc.name.toLowerCase()) ||
      disc.name.toLowerCase().includes(s.name.toLowerCase())
    );

    const currentBlock = existingSub ? existingSub.block_minutes : recommended;
    const isOverride = existingSub ? (existingSub as any).user_override === true : false;

    let reason = `Peso de prova (${Math.round(disc.combined_weight * 100)}%)`;
    if (disc.coverage_count > 1) {
      reason += ` · Presente em ${disc.coverage_count} objetivos (${disc.exam_names.join(', ')})`;
    } else if (disc.exam_names.length > 0) {
      reason += ` · Exclusivo de ${disc.exam_names[0]}`;
    }

    return {
      subject_id: existingSub ? existingSub.id : `sub_can_${disc.canonical_discipline_id}`,
      canonical_discipline_id: disc.canonical_discipline_id,
      name: disc.name,
      recommended_block_minutes: recommended,
      current_block_minutes: currentBlock,
      emphasis_label: disc.emphasis_label,
      reason,
      user_override: isOverride,
    };
  });
}

export function syncConsolidatedCycleToDb(db: DatabaseState, suggestions: CycleSuggestion[]) {
  const planId = db.studyPlans[0]?.id || 'plan_1';

  suggestions.forEach((sug, idx) => {
    let sub = db.subjects.find(s => s.id === sug.subject_id);

    if (!sub) {
      // Create new subject
      sub = {
        id: sug.subject_id,
        study_plan_id: planId,
        name: sug.name,
        active: true,
        cycle_order: idx + 1,
        block_minutes: sug.user_override ? sug.current_block_minutes : sug.recommended_block_minutes,
        emphasis: sug.recommended_block_minutes / 60,
      };
      db.subjects.push(sub);

      // Create round state
      db.subjectRoundStates.push({
        subject_id: sub.id,
        planned_minutes: sub.block_minutes,
        consumed_minutes: 0,
        remaining_minutes: sub.block_minutes,
      });

      // Create layer state
      db.subjectLayerStates.push({
        subject_id: sub.id,
        layer: db.studyPlans[0]?.current_layer || 1,
        completed_in_layer: false,
        material_progress: 0,
      });
    } else {
      const activeSub = sub as Subject;
      activeSub.cycle_order = idx + 1;
      if (!sug.user_override) {
        activeSub.block_minutes = sug.recommended_block_minutes;
        const rs = db.subjectRoundStates.find(r => r.subject_id === activeSub.id);
        if (rs) {
          rs.planned_minutes = sug.recommended_block_minutes;
          rs.remaining_minutes = Math.max(0, rs.planned_minutes - rs.consumed_minutes);
        }
      }
    }
  });

  saveDb({ ...db });
}
