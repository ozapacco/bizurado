export interface StudyPlan {
  id: string;
  user_id: string;
  name: string;
  current_layer: number;
  created_at: string;
}

export interface ExamGoal {
  id: string;
  user_id: string;
  study_plan_id: string;
  name: string;
  active: boolean;
}

export interface Subject {
  id: string;
  study_plan_id: string;
  name: string;
  active: boolean;
  cycle_order: number;
  block_minutes: number;
  emphasis: number;
}

export interface GoalSubject {
  exam_goal_id: string;
  subject_id: string;
  importance: number;
}

export type MaterialType = 'PDF' | 'curso' | 'livro' | 'outro';

export interface Material {
  subject_id: string;
  name: string;
  type: MaterialType;
  total_units: number;
  current_unit: string;
  current_page: string;
  checkpoint_note: string;
}

export interface SubjectLayerState {
  subject_id: string;
  layer: number;
  completed_in_layer: boolean;
  material_progress: number; // 0 to 100
}

export interface CycleState {
  study_plan_id: string;
  current_subject_id: string;
}

export interface SubjectRoundState {
  subject_id: string;
  planned_minutes: number;
  consumed_minutes: number;
  remaining_minutes: number;
}

export interface StudySession {
  id: string;
  user_id: string;
  subject_id: string;
  layer: number;
  started_at: string;
  finished_at: string;
  net_minutes: number;
  start_unit: string;
  end_unit: string;
  start_page: string;
  end_page: string;
}

export type QuestionGroup = 'A' | 'B' | 'C' | 'D';

export interface QuestionLog {
  id: string;
  user_id: string;
  subject_id: string;
  material_unit_optional: string;
  layer: number;
  group: QuestionGroup;
  questions: number;
  correct: number;
  date: string;
}

export type ImportanceTier = 'CORE' | 'SECONDARY' | 'TERTIARY';

/**
 * `active`   — no ciclo, entra na rotação.
 * `suspended` — fora de escopo agora. Sai da rotação, some da fila de revisão
 *               e sai do denominador do progresso. Volta com um clique.
 * Excluir não é status: o assunto é apagado de verdade e fica só uma lápide
 * (`TopicTombstone`) para o alinhamento não recriá-lo.
 */
export type TopicStatus = 'active' | 'suspended';

export interface Topic {
  id: string;
  subject_id: string;
  name: string;
  order: number;
  importance_tier: ImportanceTier;
  status: TopicStatus;
  /** De onde veio: derivado de baralho, ou criado à mão pelo usuário. */
  origin: 'deck' | 'user';
  /** Unidade de baralho que originou o assunto. Sobrevive ao renomeio. */
  deck_unit_key?: string;
  /** Motivo da suspensão, para o usuário lembrar por que pausou. */
  status_reason?: string;
  status_changed_at?: string;
  /**
   * Assunto-pai. Sem pai, é raiz. Profundidade livre.
   *
   * Regra que governa a árvore: **só folha conta**. Um assunto que ganha filho
   * vira pasta — sai da rotação e do denominador do progresso, e quem trabalha
   * são os filhos. Sem isso o mesmo estudo contaria duas vezes.
   */
  parent_id?: string;
}

/**
 * Lápide: "esta unidade de baralho eu não quero no ciclo".
 *
 * Existe porque os assuntos são DERIVADOS dos baralhos. Sem ela, apagar um
 * assunto só limpa o caminho para o alinhamento recriá-lo no próximo boot.
 * É a memória de uma decisão, e ocupa três campos.
 */
export interface TopicTombstone {
  subject_name: string;
  deck_unit_key: string;
  /** Guardado só para a interface poder dizer o que foi removido. */
  last_name: string;
  at: string;
}

export interface TopicProgress {
  user_id: string;
  topic_id: string;
  contact_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  layer_1_completed: boolean;
  layer_2_completed: boolean;
  layer_3_completed: boolean;
  layer_4_completed: boolean;
  question_count: number;
  correct_count: number;
  difficulty_flag: 'STRONG' | 'INTERMEDIATE' | 'WEAK' | 'NONE';
}

export type ReviewMaterialStatus = 'NONE' | 'SKELETON' | 'ACTIVE';

export interface ReviewMaterial {
  id: string;
  user_id: string;
  subject_id: string;
  topic_id: string;
  title: string;
  type: string;
  status: ReviewMaterialStatus;
  created_at: string;
  updated_at: string;
}

export type LayerStatus = 'IN_PROGRESS' | 'READY_TO_TRANSITION' | 'COMPLETED' | 'SUSTAINING';

export interface LayerState {
  user_id: string;
  study_plan_id: string;
  current_layer: number;
  status: LayerStatus;
  progress: number;
  started_at: string;
  transition_ready_at: string | null;
}

export interface LayerMetrics {
  user_id: string;
  layer: number;
  total_topics: number;
  core_topics: number;
  topics_completed: number;
  core_topics_completed: number;
  questions: number;
  correct: number;
  net_minutes: number;
  topics_per_hour: number;
}

export type ScopeType = 'FEDERAL' | 'STATE' | 'MUNICIPAL';
export type JurisdictionType = 'NATIONAL' | 'STATE' | 'MUNICIPAL';
export type ExamEditionStatus = 'PUBLISHED' | 'HISTORICAL' | 'PRE_EXAM_PROFILE' | 'ARCHIVED';
export type DataQuality = 'OFFICIAL' | 'HISTORICAL_ANALYSIS' | 'DEMO' | 'MANUAL';
export type IncidenceSourceType = 'OFFICIAL_EXAM' | 'HISTORICAL_ANALYSIS' | 'MANUAL';
export type GoalPriority = 'PRIMARY' | 'SECONDARY';

export interface CareerFamily {
  id: string;
  name: string;
  scope: ScopeType;
  active: boolean;
}

export interface Institution {
  id: string;
  career_family_id: string;
  name: string;
  jurisdiction_type: JurisdictionType;
  active: boolean;
}

export interface Jurisdiction {
  id: string;
  type: JurisdictionType;
  country: string;
  state: string | null;
  city: string | null;
}

export interface Role {
  id: string;
  institution_id: string;
  name: string;
  active: boolean;
}

export interface ExamEdition {
  id: string;
  role_id: string;
  name: string;
  year: number;
  status: ExamEditionStatus;
  exam_board: string | null;
  publication_date: string | null;
  exam_date: string | null;
  source_name: string | null;
  source_url: string | null;
  data_quality: DataQuality;
  active: boolean;
}

export interface ExamBlock {
  id: string;
  exam_edition_id: string;
  name: string;
  order: number;
  question_count: number | null;
  official_weight: number | null;
  minimum_score: number | null;
}

export interface CanonicalDiscipline {
  id: string;
  name: string;
  category: string;
  active: boolean;
}

export interface CanonicalTopic {
  id: string;
  canonical_discipline_id: string;
  parent_topic_id: string | null;
  name: string;
  order: number;
  active: boolean;
}

export interface ExamDiscipline {
  id: string;
  exam_edition_id: string;
  exam_block_id: string | null;
  canonical_discipline_id: string;
  order: number;
  official_question_count: number | null;
  official_weight: number | null;
  observed_question_count: number | null;
  observed_weight: number | null;
  manual_weight: number | null;
  active: boolean;
}

export interface ExamTopic {
  id: string;
  exam_edition_id: string;
  canonical_topic_id: string;
  officially_listed: boolean;
  importance_tier: ImportanceTier;
  historical_incidence: number; // 0 to 100
  observed_incidence: number | null;
  manual_incidence: number | null;
  source_confidence: number;
  active: boolean;
}

export interface IncidenceEvidence {
  id: string;
  exam_topic_id: string;
  source_type: IncidenceSourceType;
  source_exam_id: string | null;
  source_year: number | null;
  question_count: number;
  topic_question_count: number;
  incidence_score: number;
  notes: string | null;
}

export interface UserExamGoal {
  id: string;
  user_id: string;
  exam_edition_id: string;
  priority: GoalPriority;
  active: boolean;
  created_at: string;
}

export interface DatabaseState {
  studyPlans: StudyPlan[];
  examGoals: ExamGoal[];
  subjects: Subject[];
  goalSubjects: GoalSubject[];
  materials: Material[];
  subjectLayerStates: SubjectLayerState[];
  cycleStates: CycleState[];
  subjectRoundStates: SubjectRoundState[];
  studySessions: StudySession[];
  questionLogs: QuestionLog[];
  topics: Topic[];
  topicTombstones: TopicTombstone[];
  topicProgresses: TopicProgress[];
  reviewMaterials: ReviewMaterial[];
  layerStates: LayerState[];
  layerMetrics: LayerMetrics[];

  // Exam & Career Architecture
  careerFamilies: CareerFamily[];
  institutions: Institution[];
  jurisdictions: Jurisdiction[];
  roles: Role[];
  examEditions: ExamEdition[];
  examBlocks: ExamBlock[];
  canonicalDisciplines: CanonicalDiscipline[];
  canonicalTopics: CanonicalTopic[];
  examDisciplines: ExamDiscipline[];
  examTopics: ExamTopic[];
  incidenceEvidences: IncidenceEvidence[];
  userExamGoals: UserExamGoal[];
}
