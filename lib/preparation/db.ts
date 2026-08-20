import { DatabaseState, Subject, SubjectRoundState } from './types';

const DB_KEY = 'study_cycle_db';
const META_KEY = 'study_cycle_meta';

/**
 * Metadados do backup do ciclo. Ficam fora do documento para que o snapshot
 * enviado à nuvem seja exatamente o estado do estudo, sem ruído de sincronia.
 *
 * - `revision`: a revisão da nuvem em que esta cópia local se baseia.
 * - `dirty`: há mudança local ainda não enviada.
 * - `seeded`: esta cópia é o seed de fábrica, nunca editada — nesse caso a
 *   nuvem sempre vence, para um navegador novo não sobrepor o progresso real.
 */
export type CycleMeta = {
  revision: number;
  dirty: boolean;
  seeded: boolean;
  lastSyncedAt: string | null;
  /** Quando o ciclo foi alinhado aos baralhos pela última vez. */
  alignedAt: string | null;
};

const DEFAULT_META: CycleMeta = {
  revision: 0,
  dirty: false,
  seeded: false,
  lastSyncedAt: null,
  alignedAt: null,
};

export function getMeta(): CycleMeta {
  if (typeof window === 'undefined') return { ...DEFAULT_META };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { ...DEFAULT_META };
    return { ...DEFAULT_META, ...(JSON.parse(raw) as Partial<CycleMeta>) };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function setMeta(patch: Partial<CycleMeta>): CycleMeta {
  const next = { ...getMeta(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(META_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('cycle-sync-meta'));
  }
  return next;
}

const defaultSeed: DatabaseState = {
  studyPlans: [
    {
      id: 'plan_1',
      user_id: 'user_1',
      name: 'PF + Polícia Penal',
      current_layer: 1,
      created_at: new Date().toISOString(),
    },
  ],
  examGoals: [
    { id: 'goal_1', user_id: 'user_1', study_plan_id: 'plan_1', name: 'Polícia Federal — Agente', active: true },
    { id: 'goal_2', user_id: 'user_1', study_plan_id: 'plan_1', name: 'Polícia Penal', active: true },
  ],
  // Disciplinas com o nome CANÔNICO dos baralhos. Este é o vocabulário único
  // do sistema: o mesmo nome no ciclo, no índice de cards e no banco.
  // Os assuntos NÃO são semeados à mão — `alignWithDecks` os deriva das
  // unidades reais dos baralhos na primeira carga, o que garante cobertura de
  // 100% desde o minuto zero. Semear assunto inventado aqui foi o que criou o
  // descolamento entre o plano e os cards.
  subjects: [
    { id: 'sub_portugues', study_plan_id: 'plan_1', name: 'Português', active: true, cycle_order: 1, block_minutes: 60, emphasis: 1.0 },
    { id: 'sub_direito_constitucional', study_plan_id: 'plan_1', name: 'Direito Constitucional', active: true, cycle_order: 2, block_minutes: 60, emphasis: 1.0 },
    { id: 'sub_direito_administrativo', study_plan_id: 'plan_1', name: 'Direito Administrativo', active: true, cycle_order: 3, block_minutes: 60, emphasis: 1.0 },
    { id: 'sub_direito_processual_penal', study_plan_id: 'plan_1', name: 'Direito Processual Penal', active: true, cycle_order: 4, block_minutes: 60, emphasis: 1.0 },
    { id: 'sub_direito_penal', study_plan_id: 'plan_1', name: 'Direito Penal', active: true, cycle_order: 5, block_minutes: 60, emphasis: 1.0 },
    { id: 'sub_legislacao_penal_especial', study_plan_id: 'plan_1', name: 'Legislação Penal Especial', active: true, cycle_order: 6, block_minutes: 60, emphasis: 1.0 },
    { id: 'sub_direitos_humanos', study_plan_id: 'plan_1', name: 'Direitos Humanos', active: true, cycle_order: 7, block_minutes: 45, emphasis: 1.0 },
    { id: 'sub_matematica', study_plan_id: 'plan_1', name: 'Matemática', active: true, cycle_order: 8, block_minutes: 60, emphasis: 1.0 },
  ],
  // Vazio de propósito: o mapa meta -> disciplina é derivado do edital pelo
  // `consolidatedPlanEngine`. A versão anterior era uma lista pela metade, com
  // um `// and so on... skipping` no meio.
  goalSubjects: [],
  materials: [
    { subject_id: 'sub_portugues', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_direito_constitucional', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_direito_administrativo', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_direito_processual_penal', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_direito_penal', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_legislacao_penal_especial', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_direitos_humanos', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
    { subject_id: 'sub_matematica', name: 'Baralho de flashcards', type: 'outro', total_units: 0, current_unit: '01', current_page: '', checkpoint_note: '' },
  ],
  // Zero em tudo. Os percentuais de antes (30%, 26%, 46%...) eram de
  // demonstração e apareciam na interface como se fossem progresso real.
  subjectLayerStates: [
    { subject_id: 'sub_portugues', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_direito_constitucional', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_direito_administrativo', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_direito_processual_penal', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_direito_penal', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_legislacao_penal_especial', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_direitos_humanos', layer: 1, completed_in_layer: false, material_progress: 0 },
    { subject_id: 'sub_matematica', layer: 1, completed_in_layer: false, material_progress: 0 },
  ],
  cycleStates: [
    { study_plan_id: 'plan_1', current_subject_id: 'sub_portugues' },
  ],
  subjectRoundStates: [
    { subject_id: 'sub_portugues', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
    { subject_id: 'sub_direito_constitucional', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
    { subject_id: 'sub_direito_administrativo', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
    { subject_id: 'sub_direito_processual_penal', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
    { subject_id: 'sub_direito_penal', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
    { subject_id: 'sub_legislacao_penal_especial', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
    { subject_id: 'sub_direitos_humanos', planned_minutes: 45, consumed_minutes: 0, remaining_minutes: 45 },
    { subject_id: 'sub_matematica', planned_minutes: 60, consumed_minutes: 0, remaining_minutes: 60 },
  ],
  studySessions: [],
  questionLogs: [],
  topics: [],
  topicProgresses: [],
  reviewMaterials: [],
  layerStates: [],
  layerMetrics: [],

  // Exam & Career Architecture Seeds
  careerFamilies: [
    { id: 'cf_pf', name: 'Polícia Federal', scope: 'FEDERAL', active: true },
    { id: 'cf_prf', name: 'Polícia Rodoviária Federal', scope: 'FEDERAL', active: true },
    { id: 'cf_pc', name: 'Polícia Civil', scope: 'STATE', active: true },
    { id: 'cf_pm', name: 'Polícia Militar', scope: 'STATE', active: true },
    { id: 'cf_pp', name: 'Polícia Penal', scope: 'STATE', active: true },
    { id: 'cf_gcm', name: 'Guarda Municipal', scope: 'MUNICIPAL', active: true },
  ],
  institutions: [
    { id: 'inst_pf', career_family_id: 'cf_pf', name: 'Polícia Federal', jurisdiction_type: 'NATIONAL', active: true },
    { id: 'inst_prf', career_family_id: 'cf_prf', name: 'Polícia Rodoviária Federal', jurisdiction_type: 'NATIONAL', active: true },
    { id: 'inst_pc_sc', career_family_id: 'cf_pc', name: 'Polícia Civil de Santa Catarina', jurisdiction_type: 'STATE', active: true },
    { id: 'inst_pm_sc', career_family_id: 'cf_pm', name: 'Polícia Militar de Santa Catarina', jurisdiction_type: 'STATE', active: true },
    { id: 'inst_pp_rs', career_family_id: 'cf_pp', name: 'Polícia Penal do Rio Grande do Sul', jurisdiction_type: 'STATE', active: true },
    { id: 'inst_gcm_sp', career_family_id: 'cf_gcm', name: 'Guarda Civil Metropolitana de São Paulo', jurisdiction_type: 'MUNICIPAL', active: true },
  ],
  jurisdictions: [
    { id: 'jur_br', type: 'NATIONAL', country: 'Brasil', state: null, city: null },
    { id: 'jur_sc', type: 'STATE', country: 'Brasil', state: 'Santa Catarina', city: null },
    { id: 'jur_rs', type: 'STATE', country: 'Brasil', state: 'Rio Grande do Sul', city: null },
    { id: 'jur_sp', type: 'MUNICIPAL', country: 'Brasil', state: 'São Paulo', city: 'São Paulo' },
  ],
  roles: [
    { id: 'role_pf_agente', institution_id: 'inst_pf', name: 'Agente de Polícia Federal', active: true },
    { id: 'role_prf_policial', institution_id: 'inst_prf', name: 'Policial Rodoviário Federal', active: true },
    { id: 'role_pc_sc_agente', institution_id: 'inst_pc_sc', name: 'Agente de Polícia Civil', active: true },
    { id: 'role_pm_sc_soldado', institution_id: 'inst_pm_sc', name: 'Soldado PM', active: true },
    { id: 'role_pp_rs_agente', institution_id: 'inst_pp_rs', name: 'Policial Penal', active: true },
    { id: 'role_gcm_sp_gcm', institution_id: 'inst_gcm_sp', name: 'Guarda Civil', active: true },
  ],
  examEditions: [
    {
      id: 'ee_pf_2025',
      role_id: 'role_pf_agente',
      name: 'Polícia Federal — Agente 2025',
      year: 2025,
      status: 'PUBLISHED',
      exam_board: 'Cebraspe',
      publication_date: '2025-01-15',
      exam_date: '2025-05-18',
      source_name: 'DOU Edital 01/2025',
      source_url: 'https://gov.br/pf',
      data_quality: 'OFFICIAL',
      active: true,
    },
    {
      id: 'ee_pc_sc_2025',
      role_id: 'role_pc_sc_agente',
      name: 'PCSC — Agente 2025',
      year: 2025,
      status: 'PRE_EXAM_PROFILE',
      exam_board: 'Fepese',
      publication_date: null,
      exam_date: null,
      source_name: 'Histórico da Carreira',
      source_url: null,
      data_quality: 'HISTORICAL_ANALYSIS',
      active: true,
    },
    {
      id: 'ee_pp_rs_2024',
      role_id: 'role_pp_rs_agente',
      name: 'Polícia Penal RS — 2024',
      year: 2024,
      status: 'HISTORICAL',
      exam_board: 'Fundatec',
      publication_date: '2024-03-10',
      exam_date: '2024-07-21',
      source_name: 'Edital 01/2024 SUSEPE/RS',
      source_url: null,
      data_quality: 'OFFICIAL',
      active: true,
    },
  ],
  examBlocks: [
    { id: 'eb_pf_1', exam_edition_id: 'ee_pf_2025', name: 'Bloco I', order: 1, question_count: 24, official_weight: 0.20, minimum_score: null },
    { id: 'eb_pf_2', exam_edition_id: 'ee_pf_2025', name: 'Bloco II', order: 2, question_count: 36, official_weight: 0.30, minimum_score: null },
    { id: 'eb_pf_3', exam_edition_id: 'ee_pf_2025', name: 'Bloco III', order: 3, question_count: 60, official_weight: 0.50, minimum_score: null },
  ],
  canonicalDisciplines: [
    { id: 'cd_port', name: 'Língua Portuguesa', category: 'Gerais', active: true },
    { id: 'cd_const', name: 'Direito Constitucional', category: 'Jurídicas', active: true },
    { id: 'cd_adm', name: 'Direito Administrativo', category: 'Jurídicas', active: true },
    { id: 'cd_penal', name: 'Direito Penal', category: 'Jurídicas', active: true },
    { id: 'cd_proc_penal', name: 'Direito Processual Penal', category: 'Jurídicas', active: true },
    { id: 'cd_info', name: 'Informática', category: 'Gerais', active: true },
    { id: 'cd_cont', name: 'Contabilidade Geral', category: 'Específicas', active: true },
    { id: 'cd_exec_penal', name: 'Execução Penal', category: 'Específicas', active: true },
  ],
  canonicalTopics: [
    // Português
    { id: 'ct_port_1', canonical_discipline_id: 'cd_port', parent_topic_id: null, name: 'Compreensão e Interpretação de Textos', order: 1, active: true },
    { id: 'ct_port_2', canonical_discipline_id: 'cd_port', parent_topic_id: null, name: 'Sintaxe da Oração e do Período', order: 2, active: true },
    { id: 'ct_port_2_1', canonical_discipline_id: 'cd_port', parent_topic_id: 'ct_port_2', name: 'Concordância Verbal e Nominal', order: 1, active: true },
    { id: 'ct_port_3', canonical_discipline_id: 'cd_port', parent_topic_id: null, name: 'Emprego do Sinal Indicativo de Crase', order: 3, active: true },

    // Constitucional
    { id: 'ct_const_1', canonical_discipline_id: 'cd_const', parent_topic_id: null, name: 'Direitos e Garantias Fundamentais', order: 1, active: true },
    { id: 'ct_const_1_1', canonical_discipline_id: 'cd_const', parent_topic_id: 'ct_const_1', name: 'Remédios Constitucionais', order: 1, active: true },
    { id: 'ct_const_2', canonical_discipline_id: 'cd_const', parent_topic_id: null, name: 'Poder Constituinte e Eficácia das Normas', order: 2, active: true },
    { id: 'ct_const_3', canonical_discipline_id: 'cd_const', parent_topic_id: null, name: 'Organização Político-Administrativa do Estado', order: 3, active: true },

    // Administrativo
    { id: 'ct_adm_1', canonical_discipline_id: 'cd_adm', parent_topic_id: null, name: 'Atos Administrativos', order: 1, active: true },
    { id: 'ct_adm_2', canonical_discipline_id: 'cd_adm', parent_topic_id: null, name: 'Poderes da Administração Pública', order: 2, active: true },
    { id: 'ct_adm_3', canonical_discipline_id: 'cd_adm', parent_topic_id: null, name: 'Agentes Públicos e Estatuto', order: 3, active: true },
    { id: 'ct_adm_4', canonical_discipline_id: 'cd_adm', parent_topic_id: null, name: 'Licitações e Contratos (Lei 14.133/21)', order: 4, active: true },

    // Penal
    { id: 'ct_pen_1', canonical_discipline_id: 'cd_penal', parent_topic_id: null, name: 'Teoria Geral do Crime', order: 1, active: true },
    { id: 'ct_pen_1_1', canonical_discipline_id: 'cd_penal', parent_topic_id: 'ct_pen_1', name: 'Fato Típico, Ilicitude e Culpabilidade', order: 1, active: true },
    { id: 'ct_pen_2', canonical_discipline_id: 'cd_penal', parent_topic_id: null, name: 'Concurso de Pessoas', order: 2, active: true },

    // Processo Penal
    { id: 'ct_pp_1', canonical_discipline_id: 'cd_proc_penal', parent_topic_id: null, name: 'Inquérito Policial', order: 1, active: true },
    { id: 'ct_pp_1_1', canonical_discipline_id: 'cd_proc_penal', parent_topic_id: 'ct_pp_1', name: 'Notitia Criminis e Instauração', order: 1, active: true },
    { id: 'ct_pp_2', canonical_discipline_id: 'cd_proc_penal', parent_topic_id: null, name: 'Ação Penal', order: 2, active: true },
    { id: 'ct_pp_3', canonical_discipline_id: 'cd_proc_penal', parent_topic_id: null, name: 'Provas no Processo Penal', order: 3, active: true },
    { id: 'ct_pp_4', canonical_discipline_id: 'cd_proc_penal', parent_topic_id: null, name: 'Prisões e Liberdade Provisória', order: 4, active: true },

    // Informática
    { id: 'ct_inf_1', canonical_discipline_id: 'cd_info', parent_topic_id: null, name: 'Redes de Computadores e Internet', order: 1, active: true },
    { id: 'ct_inf_2', canonical_discipline_id: 'cd_info', parent_topic_id: null, name: 'Segurança da Informação e Malwares', order: 2, active: true },

    // Contabilidade
    { id: 'ct_cont_1', canonical_discipline_id: 'cd_cont', parent_topic_id: null, name: 'Patrimônio e Equação Patrimonial', order: 1, active: true },
    { id: 'ct_cont_2', canonical_discipline_id: 'cd_cont', parent_topic_id: null, name: 'Fatos Contábeis e Escrituração', order: 2, active: true },

    // Execução Penal
    { id: 'ct_ep_1', canonical_discipline_id: 'cd_exec_penal', parent_topic_id: null, name: 'Lei de Execução Penal (Lei 7.210/84)', order: 1, active: true },
  ],
  examDisciplines: [
    // PF 2025
    { id: 'ed_pf_info', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_3', canonical_discipline_id: 'cd_info', order: 1, official_question_count: 36, official_weight: 0.30, observed_question_count: 36, observed_weight: 0.30, manual_weight: null, active: true },
    { id: 'ed_pf_cont', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_3', canonical_discipline_id: 'cd_cont', order: 2, official_question_count: 24, official_weight: 0.20, observed_question_count: 24, observed_weight: 0.20, manual_weight: null, active: true },
    { id: 'ed_pf_port', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_1', canonical_discipline_id: 'cd_port', order: 3, official_question_count: 24, official_weight: 0.20, observed_question_count: 24, observed_weight: 0.20, manual_weight: null, active: true },
    { id: 'ed_pf_penal', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_2', canonical_discipline_id: 'cd_penal', order: 4, official_question_count: 9, official_weight: 0.075, observed_question_count: 9, observed_weight: 0.075, manual_weight: null, active: true },
    { id: 'ed_pf_pp', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_2', canonical_discipline_id: 'cd_proc_penal', order: 5, official_question_count: 9, official_weight: 0.075, observed_question_count: 9, observed_weight: 0.075, manual_weight: null, active: true },
    { id: 'ed_pf_adm', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_2', canonical_discipline_id: 'cd_adm', order: 6, official_question_count: 9, official_weight: 0.075, observed_question_count: 9, observed_weight: 0.075, manual_weight: null, active: true },
    { id: 'ed_pf_const', exam_edition_id: 'ee_pf_2025', exam_block_id: 'eb_pf_2', canonical_discipline_id: 'cd_const', order: 7, official_question_count: 9, official_weight: 0.075, observed_question_count: 9, observed_weight: 0.075, manual_weight: null, active: true },

    // PCSC 2025
    { id: 'ed_pc_port', exam_edition_id: 'ee_pc_sc_2025', exam_block_id: null, canonical_discipline_id: 'cd_port', order: 1, official_question_count: 20, official_weight: 0.25, observed_question_count: 20, observed_weight: 0.25, manual_weight: null, active: true },
    { id: 'ed_pc_penal', exam_edition_id: 'ee_pc_sc_2025', exam_block_id: null, canonical_discipline_id: 'cd_penal', order: 2, official_question_count: 15, official_weight: 0.20, observed_question_count: 15, observed_weight: 0.20, manual_weight: null, active: true },
    { id: 'ed_pc_pp', exam_edition_id: 'ee_pc_sc_2025', exam_block_id: null, canonical_discipline_id: 'cd_proc_penal', order: 3, official_question_count: 15, official_weight: 0.20, observed_question_count: 15, observed_weight: 0.20, manual_weight: null, active: true },
    { id: 'ed_pc_const', exam_edition_id: 'ee_pc_sc_2025', exam_block_id: null, canonical_discipline_id: 'cd_const', order: 4, official_question_count: 10, official_weight: 0.15, observed_question_count: 10, observed_weight: 0.15, manual_weight: null, active: true },
    { id: 'ed_pc_adm', exam_edition_id: 'ee_pc_sc_2025', exam_block_id: null, canonical_discipline_id: 'cd_adm', order: 5, official_question_count: 10, official_weight: 0.10, observed_question_count: 10, observed_weight: 0.10, manual_weight: null, active: true },
    { id: 'ed_pc_info', exam_edition_id: 'ee_pc_sc_2025', exam_block_id: null, canonical_discipline_id: 'cd_info', order: 6, official_question_count: 10, official_weight: 0.10, observed_question_count: 10, observed_weight: 0.10, manual_weight: null, active: true },

    // PP RS 2024
    { id: 'ed_pp_exec', exam_edition_id: 'ee_pp_rs_2024', exam_block_id: null, canonical_discipline_id: 'cd_exec_penal', order: 1, official_question_count: 20, official_weight: 0.30, observed_question_count: 20, observed_weight: 0.30, manual_weight: null, active: true },
    { id: 'ed_pp_penal', exam_edition_id: 'ee_pp_rs_2024', exam_block_id: null, canonical_discipline_id: 'cd_penal', order: 2, official_question_count: 15, official_weight: 0.20, observed_question_count: 15, observed_weight: 0.20, manual_weight: null, active: true },
    { id: 'ed_pp_pp', exam_edition_id: 'ee_pp_rs_2024', exam_block_id: null, canonical_discipline_id: 'cd_proc_penal', order: 3, official_question_count: 15, official_weight: 0.20, observed_question_count: 15, observed_weight: 0.20, manual_weight: null, active: true },
    { id: 'ed_pp_port', exam_edition_id: 'ee_pp_rs_2024', exam_block_id: null, canonical_discipline_id: 'cd_port', order: 4, official_question_count: 10, official_weight: 0.15, observed_question_count: 10, observed_weight: 0.15, manual_weight: null, active: true },
    { id: 'ed_pp_const', exam_edition_id: 'ee_pp_rs_2024', exam_block_id: null, canonical_discipline_id: 'cd_const', order: 5, official_question_count: 10, official_weight: 0.15, observed_question_count: 10, observed_weight: 0.15, manual_weight: null, active: true },
  ],
  examTopics: [
    // PF Topics
    { id: 'et_pf_inq', exam_edition_id: 'ee_pf_2025', canonical_topic_id: 'ct_pp_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 85, observed_incidence: 85, manual_incidence: null, source_confidence: 0.95, active: true },
    { id: 'et_pf_provas', exam_edition_id: 'ee_pf_2025', canonical_topic_id: 'ct_pp_3', officially_listed: true, importance_tier: 'CORE', historical_incidence: 80, observed_incidence: 80, manual_incidence: null, source_confidence: 0.95, active: true },
    { id: 'et_pf_crime', exam_edition_id: 'ee_pf_2025', canonical_topic_id: 'ct_pen_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 88, observed_incidence: 88, manual_incidence: null, source_confidence: 0.95, active: true },
    { id: 'et_pf_redes', exam_edition_id: 'ee_pf_2025', canonical_topic_id: 'ct_inf_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 92, observed_incidence: 92, manual_incidence: null, source_confidence: 0.95, active: true },
    { id: 'et_pf_patr', exam_edition_id: 'ee_pf_2025', canonical_topic_id: 'ct_cont_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 90, observed_incidence: 90, manual_incidence: null, source_confidence: 0.95, active: true },
    { id: 'et_pf_port_text', exam_edition_id: 'ee_pf_2025', canonical_topic_id: 'ct_port_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 82, observed_incidence: 82, manual_incidence: null, source_confidence: 0.90, active: true },

    // PCSC Topics
    { id: 'et_pc_inq', exam_edition_id: 'ee_pc_sc_2025', canonical_topic_id: 'ct_pp_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 87, observed_incidence: 87, manual_incidence: null, source_confidence: 0.90, active: true },
    { id: 'et_pc_crime', exam_edition_id: 'ee_pc_sc_2025', canonical_topic_id: 'ct_pen_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 90, observed_incidence: 90, manual_incidence: null, source_confidence: 0.90, active: true },
    { id: 'et_pc_atos', exam_edition_id: 'ee_pc_sc_2025', canonical_topic_id: 'ct_adm_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 85, observed_incidence: 85, manual_incidence: null, source_confidence: 0.90, active: true },

    // PP RS Topics
    { id: 'et_pp_lep', exam_edition_id: 'ee_pp_rs_2024', canonical_topic_id: 'ct_ep_1', officially_listed: true, importance_tier: 'CORE', historical_incidence: 95, observed_incidence: 95, manual_incidence: null, source_confidence: 0.95, active: true },
    { id: 'et_pp_inq', exam_edition_id: 'ee_pp_rs_2024', canonical_topic_id: 'ct_pp_1', officially_listed: true, importance_tier: 'SECONDARY', historical_incidence: 50, observed_incidence: 50, manual_incidence: null, source_confidence: 0.85, active: true },
  ],
  incidenceEvidences: [
    { id: 'ie_1', exam_topic_id: 'et_pf_inq', source_type: 'OFFICIAL_EXAM', source_exam_id: 'ee_pf_2025', source_year: 2021, question_count: 50, topic_question_count: 8, incidence_score: 85, notes: 'Cebraspe PF Agente 2021' },
    { id: 'ie_2', exam_topic_id: 'et_pf_redes', source_type: 'OFFICIAL_EXAM', source_exam_id: 'ee_pf_2025', source_year: 2021, question_count: 50, topic_question_count: 14, incidence_score: 92, notes: 'Cebraspe PF Agente 2021 Bloco III' },
  ],
  userExamGoals: [
    { id: 'ueg_1', user_id: 'user_1', exam_edition_id: 'ee_pf_2025', priority: 'PRIMARY', active: true, created_at: new Date().toISOString() },
    { id: 'ueg_2', user_id: 'user_1', exam_edition_id: 'ee_pc_sc_2025', priority: 'SECONDARY', active: true, created_at: new Date().toISOString() },
    { id: 'ueg_3', user_id: 'user_1', exam_edition_id: 'ee_pp_rs_2024', priority: 'SECONDARY', active: true, created_at: new Date().toISOString() },
  ],
};

/** O seed de fábrica — o único estado que o servidor conhece. */
export function getSeedDb(): DatabaseState {
  return defaultSeed;
}

export function getDb(): DatabaseState {
  if (typeof window === 'undefined') {
    return defaultSeed;
  }
  const data = localStorage.getItem(DB_KEY);
  if (!data) {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultSeed));
    setMeta({ ...DEFAULT_META, seeded: true });
    return defaultSeed;
  }

  let parsed: DatabaseState;
  try {
    parsed = JSON.parse(data) as DatabaseState;
  } catch {
    // Nunca descartar dados do usuário: a cópia ilegível fica guardada com
    // carimbo de hora para inspeção/recuperação manual antes do fallback.
    try {
      // UMA cópia só. Antes a chave levava Date.now(), e como `getDb()` é
      // chamada dezenas de vezes por navegação, uma corrupção gerava uma cópia
      // nova a cada chamada até estourar a cota — a corrupção virava paralisia
      // total de escrita.
      const CORROMPIDO = `${DB_KEY}__corrompido`;
      if (localStorage.getItem(CORROMPIDO) === null) {
        localStorage.setItem(CORROMPIDO, data);
      }
    } catch {
      /* cota estourada: seguimos com o seed, o original continua na chave viva */
    }
    return defaultSeed;
  }
  
  // Ensure new arrays exist for users with older local storage data
  if (!parsed.topics) parsed.topics = [...defaultSeed.topics];
  if (!parsed.topicProgresses) parsed.topicProgresses = [...defaultSeed.topicProgresses];
  if (!parsed.reviewMaterials) parsed.reviewMaterials = [];
  if (!parsed.layerStates) parsed.layerStates = [];
  if (!parsed.layerMetrics) parsed.layerMetrics = [];

  // Career and Exam architecture array fallbacks
  if (!parsed.careerFamilies) parsed.careerFamilies = [...defaultSeed.careerFamilies];
  if (!parsed.institutions) parsed.institutions = [...defaultSeed.institutions];
  if (!parsed.jurisdictions) parsed.jurisdictions = [...defaultSeed.jurisdictions];
  if (!parsed.roles) parsed.roles = [...defaultSeed.roles];
  if (!parsed.examEditions) parsed.examEditions = [...defaultSeed.examEditions];
  if (!parsed.examBlocks) parsed.examBlocks = [...defaultSeed.examBlocks];
  if (!parsed.canonicalDisciplines) parsed.canonicalDisciplines = [...defaultSeed.canonicalDisciplines];
  if (!parsed.canonicalTopics) parsed.canonicalTopics = [...defaultSeed.canonicalTopics];
  if (!parsed.examDisciplines) parsed.examDisciplines = [...defaultSeed.examDisciplines];
  if (!parsed.examTopics) parsed.examTopics = [...defaultSeed.examTopics];
  if (!parsed.incidenceEvidences) parsed.incidenceEvidences = [...defaultSeed.incidenceEvidences];
  if (!parsed.userExamGoals) parsed.userExamGoals = [...defaultSeed.userExamGoals];

  return parsed;
}

export function saveDb(state: DatabaseState) {
  if (typeof window === 'undefined') return;
  try {
    // `dirty` PRIMEIRO: se a escrita do documento passar e a do meta falhar por
    // cota, ficaríamos com progresso novo marcado como "salvo" — a barra diria
    // "Tudo salvo" e a hidratação seguinte apagaria a alteração.
    setMeta({ dirty: true, seeded: false });
    localStorage.setItem(DB_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('db-updated'));
  } catch (err) {
    // Nenhum call site tinha catch: a exceção subia crua para o handler de
    // clique e a alteração sumia sem ninguém saber.
    reportCycleWriteError(err);
    throw err;
  }
}

/** Publicado no canal do ciclo para a falha aparecer na barra de sincronia. */
function reportCycleWriteError(err: unknown) {
  const detalhe = err instanceof Error ? err.message : String(err);
  const cheio = /quota|exceeded|NS_ERROR_DOM_QUOTA/i.test(detalhe);
  window.dispatchEvent(
    new CustomEvent('cycle-write-error', {
      detail: cheio
        ? 'Armazenamento do navegador cheio — a alteração do ciclo não foi salva'
        : `A alteração do ciclo não foi salva: ${detalhe}`,
    })
  );
}

/**
 * Substitui o estado local pelo que veio da nuvem. Não marca `dirty`: o que
 * acabou de chegar do servidor já está, por definição, salvo lá.
 */
export function replaceDb(state: DatabaseState, revision: number) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  setMeta({
    revision,
    dirty: false,
    seeded: false,
    lastSyncedAt: new Date().toISOString(),
  });
  window.dispatchEvent(new Event('db-updated'));
}

export function resetDb() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(META_KEY);
  getDb();
  window.dispatchEvent(new Event('db-updated'));
}
