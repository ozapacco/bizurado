import { DatabaseState, CanonicalDiscipline, CanonicalTopic, ImportanceTier } from './types';

export interface ConsolidatedDiscipline {
  canonical_discipline_id: string;
  name: string;
  category: string;
  combined_weight: number; // 0 to 1
  emphasis_label: 'MUITO ALTA' | 'ALTA' | 'MÉDIA' | 'BAIXA';
  coverage_count: number;
  total_active_goals: number;
  exam_names: string[];
}

export interface ConsolidatedTopic {
  canonical_topic_id: string;
  canonical_discipline_id: string;
  name: string;
  parent_topic_id: string | null;
  combined_value: number; // 0 to 1
  incidence_label: 'MUITO ALTA' | 'ALTA' | 'MÉDIA' | 'BAIXA';
  coverage_count: number;
  is_exclusive: boolean;
  importance_tier: ImportanceTier;
  exam_tiers: Record<string, ImportanceTier>; // exam_edition_id -> tier
  exam_incidences: Record<string, number>; // exam_edition_id -> incidence (0-100)
}

export interface ConsolidatedPlan {
  disciplines: ConsolidatedDiscipline[];
  topics: ConsolidatedTopic[];
  active_goals_count: number;
  goal_names: string[];
}

export function getIncidenceLabel(score: number): 'MUITO ALTA' | 'ALTA' | 'MÉDIA' | 'BAIXA' {
  if (score >= 75) return 'MUITO ALTA';
  if (score >= 50) return 'ALTA';
  if (score >= 25) return 'MÉDIA';
  return 'BAIXA';
}

export function getEmphasisLabel(weight: number): 'MUITO ALTA' | 'ALTA' | 'MÉDIA' | 'BAIXA' {
  if (weight >= 0.25) return 'MUITO ALTA';
  if (weight >= 0.15) return 'ALTA';
  if (weight >= 0.08) return 'MÉDIA';
  return 'BAIXA';
}

export function buildConsolidatedPlan(db: DatabaseState): ConsolidatedPlan {
  const activeUserGoals = db.userExamGoals.filter(g => g.active);
  const activeExamEditionIds = activeUserGoals.map(g => g.exam_edition_id);
  
  const activeEditions = db.examEditions.filter(e => activeExamEditionIds.includes(e.id));
  const goalNames = activeEditions.map(e => e.name);

  // 1. Gather all ExamDisciplines associated with active goals
  const activeExamDisciplines = db.examDisciplines.filter(ed => 
    activeExamEditionIds.includes(ed.exam_edition_id) && ed.active
  );

  // Group by CanonicalDiscipline
  const disciplineMap = new Map<string, {
    canonical: CanonicalDiscipline;
    weights: { weight: number; priorityMult: number; examName: string }[];
  }>();

  activeExamDisciplines.forEach(ed => {
    const canonical = db.canonicalDisciplines.find(cd => cd.id === ed.canonical_discipline_id);
    if (!canonical || !canonical.active) return;

    const userGoal = activeUserGoals.find(g => g.exam_edition_id === ed.exam_edition_id);
    const priorityMult = userGoal?.priority === 'PRIMARY' ? 1.0 : 0.70;
    const edition = activeEditions.find(e => e.id === ed.exam_edition_id);

    // Weight priority: manual_weight > official_weight > observed_weight > default 0.10
    const weightVal = ed.manual_weight ?? ed.official_weight ?? ed.observed_weight ?? 0.10;

    if (!disciplineMap.has(canonical.id)) {
      disciplineMap.set(canonical.id, { canonical, weights: [] });
    }
    disciplineMap.get(canonical.id)!.weights.push({
      weight: weightVal,
      priorityMult,
      examName: edition?.name || 'Edital'
    });
  });

  const consolidatedDisciplines: ConsolidatedDiscipline[] = [];

  disciplineMap.forEach(({ canonical, weights }) => {
    // Formula for combined weight: Max weight + 0.15 * sum of others
    const sorted = [...weights].sort((a, b) => (b.weight * b.priorityMult) - (a.weight * a.priorityMult));
    let combined = sorted[0].weight * sorted[0].priorityMult;
    for (let i = 1; i < sorted.length; i++) {
      combined += 0.15 * (sorted[i].weight * sorted[i].priorityMult);
    }
    combined = Math.min(1.0, combined);

    const examNames = Array.from(new Set(weights.map(w => w.examName)));

    consolidatedDisciplines.push({
      canonical_discipline_id: canonical.id,
      name: canonical.name,
      category: canonical.category,
      combined_weight: combined,
      emphasis_label: getEmphasisLabel(combined),
      coverage_count: weights.length,
      total_active_goals: activeUserGoals.length,
      exam_names: examNames,
    });
  });

  // Sort disciplines by combined weight descending
  consolidatedDisciplines.sort((a, b) => b.combined_weight - a.combined_weight);

  // 2. Gather all ExamTopics associated with active goals
  const activeExamTopics = db.examTopics.filter(et => 
    activeExamEditionIds.includes(et.exam_edition_id) && et.active
  );

  const topicMap = new Map<string, {
    canonical: CanonicalTopic;
    topicEntries: {
      examEditionId: string;
      importanceTier: ImportanceTier;
      incidence: number;
      priorityMult: number;
    }[];
  }>();

  activeExamTopics.forEach(et => {
    const canonical = db.canonicalTopics.find(ct => ct.id === et.canonical_topic_id);
    if (!canonical || !canonical.active) return;

    const userGoal = activeUserGoals.find(g => g.exam_edition_id === et.exam_edition_id);
    const priorityMult = userGoal?.priority === 'PRIMARY' ? 1.0 : 0.70;
    const incidenceVal = et.manual_incidence ?? et.historical_incidence ?? et.observed_incidence ?? 50;

    if (!topicMap.has(canonical.id)) {
      topicMap.set(canonical.id, { canonical, topicEntries: [] });
    }
    topicMap.get(canonical.id)!.topicEntries.push({
      examEditionId: et.exam_edition_id,
      importanceTier: et.importance_tier,
      incidence: incidenceVal,
      priorityMult,
    });
  });

  const consolidatedTopics: ConsolidatedTopic[] = [];

  topicMap.forEach(({ canonical, topicEntries }) => {
    // Topic value per exam = (tierWeight) * (incidence / 100) * priorityMult
    const tierWeightMap: Record<ImportanceTier, number> = { CORE: 1.0, SECONDARY: 0.6, TERTIARY: 0.3 };

    const topicValues = topicEntries.map(e => ({
      val: tierWeightMap[e.importanceTier] * (e.incidence / 100) * e.priorityMult,
      incidence: e.incidence,
      tier: e.importanceTier,
      examId: e.examEditionId
    })).sort((a, b) => b.val - a.val);

    let combinedVal = topicValues[0].val;
    for (let i = 1; i < topicValues.length; i++) {
      combinedVal += 0.15 * topicValues[i].val;
    }
    combinedVal = Math.min(1.0, combinedVal);

    // Dynamic importance tier for consolidated topic: CORE if any is CORE, else SECONDARY/TERTIARY
    const hasCore = topicEntries.some(e => e.importanceTier === 'CORE');
    const hasSec = topicEntries.some(e => e.importanceTier === 'SECONDARY');
    const aggregatedTier: ImportanceTier = hasCore ? 'CORE' : (hasSec ? 'SECONDARY' : 'TERTIARY');

    const examTiers: Record<string, ImportanceTier> = {};
    const examIncidences: Record<string, number> = {};

    topicEntries.forEach(e => {
      examTiers[e.examEditionId] = e.importanceTier;
      examIncidences[e.examEditionId] = e.incidence;
    });

    const averageIncidenceScore = Math.round(
      topicEntries.reduce((acc, e) => acc + e.incidence, 0) / topicEntries.length
    );

    consolidatedTopics.push({
      canonical_topic_id: canonical.id,
      canonical_discipline_id: canonical.canonical_discipline_id,
      name: canonical.name,
      parent_topic_id: canonical.parent_topic_id,
      combined_value: combinedVal,
      incidence_label: getIncidenceLabel(averageIncidenceScore),
      coverage_count: topicEntries.length,
      is_exclusive: topicEntries.length === 1 && activeUserGoals.length > 1,
      importance_tier: aggregatedTier,
      exam_tiers: examTiers,
      exam_incidences: examIncidences,
    });
  });

  consolidatedTopics.sort((a, b) => b.combined_value - a.combined_value);

  return {
    disciplines: consolidatedDisciplines,
    topics: consolidatedTopics,
    active_goals_count: activeUserGoals.length,
    goal_names: goalNames,
  };
}
