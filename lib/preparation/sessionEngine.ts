import { DatabaseState, Topic, LayerState } from './types';
import { getOrCreateTopicProgress, getTopicsForSubjectInLayer } from './layerEngine';

export interface SessionProtocol {
  title: string;
  action_list: string[];
  objective: string;
  question_group: 'A' | 'B' | 'C' | 'D' | 'MISTO';
  question_reference: string;
  reason: string;
}

export function getSessionProtocol(db: DatabaseState, subjectId: string, layer: number): SessionProtocol {
  const topics = getTopicsForSubjectInLayer(db, subjectId, layer);
  
  if (topics.length === 0) {
    return {
      title: 'Concluído',
      action_list: ['Aguarde a próxima camada.'],
      objective: 'Você já cumpriu os requisitos desta matéria nesta camada.',
      question_group: 'A',
      question_reference: '',
      reason: 'Sem assuntos pendentes'
    };
  }

  const topic = topics[0];
  const prog = getOrCreateTopicProgress(db, topic.id);

  if (layer === 1) {
    return {
      title: 'Primeira passagem',
      action_list: [
        'Continue o material e avance no assunto.',
        'Busque compreensão geral, não persiga aprofundamento excessivo.',
        'Ao final, faça a bateria A (diagnóstica).'
      ],
      objective: 'Conhecer e avançar',
      question_group: 'A',
      question_reference: '5–10 questões/h',
      reason: 'Ainda falta a primeira passagem neste assunto.'
    };
  }
  
  if (layer === 2) {
    return {
      title: 'Segunda passagem',
      action_list: [
        'Tente lembrar do assunto sem consultar a teoria.',
        'Vá para as questões (bateria B).',
        'Analise os erros e consulte a teoria pontualmente.',
        'Siga em frente.'
      ],
      objective: 'Consolidar o Núcleo',
      question_group: 'B',
      question_reference: '25–30 questões/h',
      reason: 'Assunto do Núcleo pendente de segunda passagem.'
    };
  }

  if (layer === 3) {
    return {
      title: 'Aceleração',
      action_list: [
        'Vá direto para as questões (Grupo C).',
        'Errou? Faça consulta rápida e corrija.',
        'Passe rapidamente para o próximo assunto.',
        'Não retorne para leituras longas.'
      ],
      objective: 'Aumentar pontos de contato',
      question_group: 'C',
      question_reference: '25–30 questões/h',
      reason: 'O Núcleo já foi revisado. O foco agora é velocidade.'
    };
  }

  if (layer === 4) {
    if (topic.importance_tier === 'CORE') {
      const mat = db.reviewMaterials.find(m => m.topic_id === topic.id);
      if (!mat || mat.status === 'NONE') {
        return {
          title: 'Sessão de Construção',
          action_list: [
            'Revise seus erros recorrentes neste assunto.',
            'Crie o esqueleto do seu material de revisão (resumo, mapa, etc).',
            'Foque apenas em regras e confusões importantes.'
          ],
          objective: 'Criar material de revisão',
          question_group: 'D',
          question_reference: '0 questões nesta sessão',
          reason: 'Assunto de alta relevância (CORE) precisando de material próprio.'
        };
      }
    }
    
    return {
      title: 'Prática e Consulta',
      action_list: [
        'Faça questões.',
        'Consulte pontualmente suas anotações ou teoria.'
      ],
      objective: 'Manutenção',
      question_group: 'D',
      question_reference: '25–30 questões/h',
      reason: 'Assunto secundário ou material já criado.'
    };
  }

  // Layer 5
  const accuracy = prog.question_count > 0 ? (prog.correct_count / prog.question_count) : 1;
  const hasLowPerformance = prog.question_count >= 10 && accuracy < 0.6;
  const isWeak = prog.difficulty_flag === 'WEAK';
  
  if (topic.importance_tier === 'CORE' && (hasLowPerformance || isWeak)) {
    return {
      title: 'VALE',
      action_list: [
        'Vá para o seu material de revisão.',
        'Faça questões direcionadas para este assunto.',
        'Corrija as lacunas específicas.',
        'Atualize seu material se necessário.'
      ],
      objective: 'Corrigir falhas',
      question_group: 'D',
      question_reference: 'Volume reduzido',
      reason: 'Desempenho baixo ou erro recorrente detectado neste assunto.'
    };
  }

  return {
    title: 'PICO',
    action_list: [
      'Faça volume de questões misturadas.',
      'Mantenha velocidade alta.',
      'Não trave em um único assunto.'
    ],
    objective: 'Volume e velocidade',
    question_group: 'D',
    question_reference: '40–50 questões/h',
    reason: 'Seus materiais estão atualizados e não existem lacunas críticas abertas.'
  };
}

export function getSuggestedRebalance(db: DatabaseState): Record<string, { old: number, new: number, reason: string }> {
  const suggestions: Record<string, { old: number, new: number, reason: string }> = {};
  
  db.subjects.filter(s => s.active).forEach(sub => {
    const logs = db.questionLogs.filter(l => l.subject_id === sub.id);
    const qCount = logs.reduce((a, b) => a + b.questions, 0);
    const cCount = logs.reduce((a, b) => a + b.correct, 0);
    
    let newMinutes = sub.block_minutes;
    let reason = 'Ritmo mantido.';

    if (qCount >= 15) { // Minimum evidence
      const acc = cCount / qCount;
      if (acc < 0.6) {
        newMinutes = Math.min(120, sub.block_minutes + 15);
        reason = 'Desempenho baixo. Sugerido aumento de tempo.';
      } else if (acc > 0.8) {
        newMinutes = Math.max(30, sub.block_minutes - 10);
        reason = 'Desempenho alto. Tempo reduzido para focar nas fraquezas.';
      }
    } else {
      reason = 'Poucos dados. Ênfase mantida.';
    }

    if (newMinutes !== sub.block_minutes) {
      suggestions[sub.id] = {
        old: sub.block_minutes,
        new: newMinutes,
        reason
      };
    }
  });

  return suggestions;
}
