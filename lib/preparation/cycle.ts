import { getDb, saveDb } from './db';

// Gets the plan id for this user (simplification for local single user)
export function getPlanId() {
  return getDb().studyPlans[0].id;
}

export function getCurrentLayer() {
  return getDb().studyPlans[0].current_layer;
}

export function getActiveCycleSubjects() {
  const db = getDb();
  const planId = getPlanId();
  const plan = db.studyPlans.find((p) => p.id === planId);
  const layer = plan ? plan.current_layer : 1;
  
  // A subject is in the active cycle if it is active AND hasn't been completed in the current layer
  return db.subjects
    .filter((s) => s.study_plan_id === planId && s.active)
    .filter((s) => {
      const topics = db.topics.filter(t => t.subject_id === s.id && t.active);
      if (topics.length === 0) return true; // Keep subjects without topics to not break them
      
      const isCompleted = topics.every(t => {
        const prog = db.topicProgresses.find(p => p.topic_id === t.id);
        if (!prog) return false;
        
        if (layer === 1) return prog.layer_1_completed;
        if (layer === 2) return t.importance_tier !== 'CORE' || prog.layer_2_completed;
        if (layer === 3) return t.importance_tier !== 'CORE' || prog.layer_3_completed;
        if (layer === 4) return t.importance_tier !== 'CORE' || prog.layer_4_completed;
        return false;
      });

      return !isCompleted;
    })
    .sort((a, b) => a.cycle_order - b.cycle_order);
}

export function getCurrentSubject() {
  const db = getDb();
  const planId = getPlanId();
  const cycleState = db.cycleStates.find((cs) => cs.study_plan_id === planId);
  if (!cycleState) return null;

  return db.subjects.find((s) => s.id === cycleState.current_subject_id) || null;
}

export function getNextSubjects(count: number = 3) {
  const active = getActiveCycleSubjects();
  if (active.length <= 1) return [];

  const current = getCurrentSubject();
  const currentIndex = current ? active.findIndex((s) => s.id === current.id) : -1;
  
  if (currentIndex === -1) return active.slice(0, count);

  const next = [];
  for (let i = 1; i <= count; i++) {
    const idx = (currentIndex + i) % active.length;
    next.push(active[idx]);
  }
  return next;
}

export function advanceCycle() {
  const db = getDb();
  const planId = getPlanId();
  const cycleState = db.cycleStates.find((cs) => cs.study_plan_id === planId);
  const active = getActiveCycleSubjects();

  if (!cycleState || active.length === 0) return;

  const currentIndex = active.findIndex((s) => s.id === cycleState.current_subject_id);
  
  let nextIndex = 0;
  if (currentIndex !== -1) {
    nextIndex = (currentIndex + 1) % active.length;
  }

  cycleState.current_subject_id = active[nextIndex].id;
  saveDb(db);
}

export function updateSubjectTime(subjectId: string, minutes: number) {
  const db = getDb();
  const roundState = db.subjectRoundStates.find((rs) => rs.subject_id === subjectId);
  if (!roundState) return false;

  roundState.consumed_minutes += minutes;
  roundState.remaining_minutes = Math.max(0, roundState.planned_minutes - roundState.consumed_minutes);

  saveDb(db);
  return roundState;
}

export function finishRound(subjectId: string) {
  const db = getDb();
  const roundState = db.subjectRoundStates.find((rs) => rs.subject_id === subjectId);
  if (roundState) {
    roundState.consumed_minutes = 0;
    roundState.remaining_minutes = roundState.planned_minutes;
    saveDb(db);
  }
  advanceCycle();
}

export function completeLayerForSubject(subjectId: string) {
  // Now derived dynamically via getActiveCycleSubjects.
  // We still advance cycle if this subject is no longer active.
  const active = getActiveCycleSubjects();
  const isActive = active.find(s => s.id === subjectId);

  if (!isActive) {
     const current = getCurrentSubject();
     if (current && current.id === subjectId) {
        advanceCycle();
     }
  }
}

export function checkLayerCompletion() {
  // Handled by LayerEngine
}

export function advanceToNextLayer() {
  const db = getDb();
  const plan = db.studyPlans[0];
  if (plan) {
    plan.current_layer += 1;
    saveDb(db);
  }
}
