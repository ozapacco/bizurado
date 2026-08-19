import { DatabaseState, Topic, TopicProgress, LayerState } from './types';

export function getOrCreateTopicProgress(db: DatabaseState, topicId: string): TopicProgress {
  const plan = db.studyPlans[0];
  let tp = db.topicProgresses.find(p => p.topic_id === topicId);
  if (!tp) {
    tp = {
      user_id: plan.user_id,
      topic_id: topicId,
      contact_count: 0,
      first_seen_at: null,
      last_seen_at: null,
      layer_1_completed: false,
      layer_2_completed: false,
      layer_3_completed: false,
      layer_4_completed: false,
      question_count: 0,
      correct_count: 0,
      difficulty_flag: 'NONE'
    };
    db.topicProgresses.push(tp);
  }
  return tp;
}

export function evaluateLayer(db: DatabaseState): LayerState & {
  study_protocol: string;
  missing_requirements: string[];
  explanation: string;
} {
  const plan = db.studyPlans[0];
  const activeSubjects = db.subjects.filter(s => s.active && s.study_plan_id === plan.id);
  const activeSubjectIds = activeSubjects.map(s => s.id);
  const topics = db.topics.filter(t => activeSubjectIds.includes(t.subject_id) && t.active);
  const coreTopics = topics.filter(t => t.importance_tier === 'CORE');

  const getProgress = (t: Topic) => getOrCreateTopicProgress(db, t.id);

  let status: 'IN_PROGRESS' | 'READY_TO_TRANSITION' | 'SUSTAINING' = 'IN_PROGRESS';
  let progress = 0;
  let missing_requirements: string[] = [];
  let explanation = '';
  let study_protocol = '';

  if (plan.current_layer === 1) {
    const completedLayer1 = topics.filter(t => getProgress(t).layer_1_completed);
    progress = topics.length === 0 ? 0 : Math.round((completedLayer1.length / topics.length) * 100);
    
    if (completedLayer1.length === topics.length && coreTopics.length > 0) {
      status = 'READY_TO_TRANSITION';
    } else {
      missing_requirements.push(`${topics.length - completedLayer1.length} assuntos ainda precisam ser vistos na primeira passagem.`);
    }

    explanation = `Você está aqui porque ainda existem ${topics.length - completedLayer1.length} assuntos que você nunca estudou.`;
    study_protocol = 'Primeiro contato. Avance no conteúdo. Não persiga aprofundamento excessivo. Aprox. 1 assunto/h.';
  
  } else if (plan.current_layer === 2) {
    const completedLayer2 = coreTopics.filter(t => getProgress(t).layer_2_completed);
    progress = coreTopics.length === 0 ? 0 : Math.round((completedLayer2.length / coreTopics.length) * 100);
    
    if (completedLayer2.length === coreTopics.length) {
      status = 'READY_TO_TRANSITION';
    } else {
      missing_requirements.push(`${coreTopics.length - completedLayer2.length} assuntos do Núcleo ainda precisam da segunda passagem.`);
    }

    explanation = `Você já viu todo o edital. Agora estamos fazendo a segunda passagem pelos ${coreTopics.length} assuntos que formam seu Núcleo.`;
    study_protocol = 'Segunda passagem do Núcleo. Foco em questões + correção + consulta. Aprox. 1 assunto/h.';
  
  } else if (plan.current_layer === 3) {
    const completedLayer3 = coreTopics.filter(t => getProgress(t).layer_3_completed);
    progress = coreTopics.length === 0 ? 0 : Math.round((completedLayer3.length / coreTopics.length) * 100);
    
    // Check pace - for simplicity we mock pace or calculate from sessions if they exist
    const averagePace = 1.0; // Mock: we didn't implement full session history in DB yet
    
    if (completedLayer3.length === coreTopics.length) { // omitting strict pace check for MVP since we don't have session history data
      status = 'READY_TO_TRANSITION';
    } else {
      missing_requirements.push(`${coreTopics.length - completedLayer3.length} assuntos do Núcleo ainda precisam da terceira passagem.`);
    }

    explanation = `Seu Núcleo já recebeu duas passagens. Agora estamos aumentando sua velocidade de recuperação.`;
    study_protocol = 'Aceleração. Questões ganham protagonismo. Objetivo: 2 pontos de contato por hora.';
  
  } else if (plan.current_layer === 4) {
    const completedLayer4 = coreTopics.filter(t => getProgress(t).layer_4_completed);
    
    // We only care about materials for CORE topics
    const materials = coreTopics.filter(t => {
       const mat = db.reviewMaterials.find(m => m.topic_id === t.id);
       return mat && mat.status !== 'NONE';
    });

    // Weighted progress
    const passProgress = coreTopics.length === 0 ? 0 : (completedLayer4.length / coreTopics.length);
    const matProgress = coreTopics.length === 0 ? 0 : (materials.length / coreTopics.length);
    progress = Math.round(((passProgress + matProgress) / 2) * 100);

    if (completedLayer4.length === coreTopics.length && materials.length === coreTopics.length) {
      status = 'READY_TO_TRANSITION';
    } else {
      if (completedLayer4.length < coreTopics.length) {
         missing_requirements.push(`${coreTopics.length - completedLayer4.length} assuntos do Núcleo precisam da quarta passagem.`);
      }
      if (materials.length < coreTopics.length) {
         missing_requirements.push(`${coreTopics.length - materials.length} materiais de revisão do Núcleo ainda precisam ser criados.`);
      }
    }

    explanation = `Você já possui repertório suficiente. Agora seus erros começam a virar material de revisão.`;
    study_protocol = 'Construção. Crie o esqueleto do material de revisão do Núcleo. Questões nesta sessão: 0.';

  } else {
    // Camada 5
    status = 'SUSTAINING';
    progress = 100;
    explanation = `Sua base está construída. Agora o sistema alterna volume e correção de lacunas até a prova.`;
    study_protocol = 'Sustentação. PICO: Volume e velocidade. VALE: Consulta teórica e lacunas.';
  }

  return {
    user_id: plan.user_id,
    study_plan_id: plan.id,
    current_layer: plan.current_layer,
    status,
    progress,
    started_at: plan.created_at,
    transition_ready_at: null,
    missing_requirements,
    study_protocol,
    explanation
  };
}

export function getTopicsForSubjectInLayer(db: DatabaseState, subjectId: string, layer: number): Topic[] {
  const topics = db.topics.filter(t => t.subject_id === subjectId && t.active);
  // Sort by IMPORTANCE (CORE > SECONDARY > TERTIARY) then ORDER
  topics.sort((a, b) => {
    const tierMap = { 'CORE': 1, 'SECONDARY': 2, 'TERTIARY': 3 };
    if (tierMap[a.importance_tier] !== tierMap[b.importance_tier]) {
      return tierMap[a.importance_tier] - tierMap[b.importance_tier];
    }
    return a.order - b.order;
  });

  const getProgress = (t: Topic) => getOrCreateTopicProgress(db, t.id);

  if (layer === 1) {
    // Next unseen topic
    const unseen = topics.find(t => !getProgress(t).layer_1_completed);
    return unseen ? [unseen] : [];
  } else if (layer === 2) {
    // Next CORE topic unseen in layer 2
    const unseenCore = topics.find(t => t.importance_tier === 'CORE' && !getProgress(t).layer_2_completed);
    return unseenCore ? [unseenCore] : [];
  } else if (layer === 3) {
    // Up to 2 CORE topics for acceleration
    const unseenCore = topics.filter(t => t.importance_tier === 'CORE' && !getProgress(t).layer_3_completed);
    return unseenCore.slice(0, 2);
  } else if (layer === 4) {
    // Next CORE topic missing material or 4th pass
    const nextCore = topics.find(t => {
      if (t.importance_tier !== 'CORE') return false;
      const prog = getProgress(t);
      const mat = db.reviewMaterials.find(m => m.topic_id === t.id);
      return !prog.layer_4_completed || (!mat || mat.status === 'NONE');
    });
    if (nextCore) return [nextCore];
    // If core is done, pick secondary
    const nextSec = topics.find(t => t.importance_tier === 'SECONDARY' && !getProgress(t).layer_4_completed);
    return nextSec ? [nextSec] : [];
  } else {
    // Layer 5: Pick based on weak performance (Vale) or randomly (Pico)
    // Simplified for MVP
    return topics.length > 0 ? [topics[0]] : [];
  }
}
