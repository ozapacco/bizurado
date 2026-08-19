import React, { useState } from 'react';
import { useDb } from '@/lib/preparation/useDb';
import { saveDb } from '@/lib/preparation/db';
import { buildConsolidatedPlan, ConsolidatedTopic } from '@/lib/preparation/consolidatedPlanEngine';
import { CanonicalTopic } from '@/lib/preparation/types';
import { X, ChevronDown, ChevronRight, ShieldCheck, Layers, PlusCircle, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  examEditionId?: string | null; // If provided, shows syllabus for specific exam edition, else consolidated
}

export default function VerticalSyllabusModal({ isOpen, onClose, examEditionId }: Props) {
  const db = useDb();
  const plan = buildConsolidatedPlan(db);

  const [expandedDisciplines, setExpandedDisciplines] = useState<Record<string, boolean>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [selectedTopic, setSelectedTopic] = useState<ConsolidatedTopic | null>(null);

  // Form for adding a new topic
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDisciplineId, setNewTopicDisciplineId] = useState('');
  const [newTopicParentId, setNewTopicParentId] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetEdition = examEditionId ? db.examEditions.find(e => e.id === examEditionId) : null;

  const toggleDiscipline = (discId: string) => {
    setExpandedDisciplines(prev => ({ ...prev, [discId]: !prev[discId] }));
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  const handleAddCustomTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName || !newTopicDisciplineId) return;

    const newTopicId = `ct_custom_${Date.now()}`;
    db.canonicalTopics.push({
      id: newTopicId,
      canonical_discipline_id: newTopicDisciplineId,
      parent_topic_id: newTopicParentId,
      name: newTopicName,
      order: 99,
      active: true,
    });

    // Add ExamTopic link for current active goals
    db.userExamGoals.filter(g => g.active).forEach(g => {
      db.examTopics.push({
        id: `et_custom_${Date.now()}_${g.exam_edition_id}`,
        exam_edition_id: g.exam_edition_id,
        canonical_topic_id: newTopicId,
        officially_listed: true,
        importance_tier: 'CORE',
        historical_incidence: 75,
        observed_incidence: 75,
        manual_incidence: null,
        source_confidence: 1.0,
        active: true,
      });
    });

    saveDb({ ...db });
    setIsAddingTopic(false);
    setNewTopicName('');
  };

  // Helper to render topic tree recursively for unlimited depth!
  const renderTopicTree = (disciplineId: string, parentId: string | null = null, depth: number = 0) => {
    const childTopics = plan.topics.filter(t => 
      t.canonical_discipline_id === disciplineId && t.parent_topic_id === parentId
    );

    if (childTopics.length === 0) return null;

    return (
      <div className={`space-y-1.5 ${depth > 0 ? 'ml-6 border-l-2 border-slate-100 pl-3 mt-1' : ''}`}>
        {childTopics.map(topic => {
          const subChildren = plan.topics.filter(t => t.parent_topic_id === topic.canonical_topic_id);
          const hasSubChildren = subChildren.length > 0;
          const isTopicExpanded = expandedTopics[topic.canonical_topic_id] ?? true;

          return (
            <div key={topic.canonical_topic_id} className="bg-white rounded-lg border border-slate-100 p-3 hover:border-slate-300 transition-all">
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-2 flex-1">
                  {hasSubChildren && (
                    <button 
                      onClick={() => toggleTopic(topic.canonical_topic_id)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      {isTopicExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                  <div>
                    <button 
                      onClick={() => setSelectedTopic(topic)}
                      className="font-medium text-slate-900 hover:text-teal-700 text-left"
                    >
                      {topic.name}
                    </button>
                    
                    <div className="flex items-center space-x-2 mt-1 text-xs">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        topic.importance_tier === 'CORE' ? 'bg-purple-100 text-purple-800' :
                        topic.importance_tier === 'SECONDARY' ? 'bg-teal-100 text-teal-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {topic.importance_tier}
                      </span>

                      <span className={`px-2 py-0.5 rounded font-medium ${
                        topic.incidence_label === 'MUITO ALTA' ? 'bg-red-50 text-red-700' :
                        topic.incidence_label === 'ALTA' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        Incidência: {topic.incidence_label}
                      </span>

                      <span className="text-slate-400">
                        {topic.coverage_count}/{plan.active_goals_count} objetivos
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setNewTopicDisciplineId(disciplineId);
                    setNewTopicParentId(topic.canonical_topic_id);
                    setIsAddingTopic(true);
                  }}
                  className="text-xs text-slate-400 hover:text-teal-600 flex items-center"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-1" />
                  Subassunto
                </button>
              </div>

              {hasSubChildren && isTopicExpanded && (
                renderTopicTree(disciplineId, topic.canonical_topic_id, depth + 1)
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl my-8 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <div className="flex items-center space-x-2 text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">
            <Layers className="w-4 h-4" />
            <span>{targetEdition ? 'Edital Verticalizado' : 'Plano de Conteúdo Consolidado'}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {targetEdition ? targetEdition.name : `Edital Consolidado (${plan.active_goals_count} Provas)`}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Conteúdo único preservado no seu histórico com pesos e incidências por edital.
          </p>
        </div>

        {/* RECURSIVE DISCIPLINE AND TOPIC TREE */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {plan.disciplines.map(disc => {
            const isExpanded = expandedDisciplines[disc.canonical_discipline_id] ?? true;

            return (
              <div key={disc.canonical_discipline_id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleDiscipline(disc.canonical_discipline_id)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors text-left"
                >
                  <div className="flex items-center space-x-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
                    <div>
                      <span className="font-bold text-slate-900 text-base">{disc.name}</span>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Peso Combinado: {Math.round(disc.combined_weight * 100)}% ({disc.emphasis_label})
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold px-2 py-1 bg-white border border-slate-200 rounded text-slate-700">
                      {disc.coverage_count}/{disc.total_active_goals} provas
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 bg-slate-50/30 border-t border-slate-100">
                    {renderTopicTree(disc.canonical_discipline_id, null, 0)}
                    
                    <button
                      onClick={() => {
                        setNewTopicDisciplineId(disc.canonical_discipline_id);
                        setNewTopicParentId(null);
                        setIsAddingTopic(true);
                      }}
                      className="mt-3 text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center space-x-1"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>ADICIONAR ASSUNTO A {disc.name.toUpperCase()}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* TOPIC DETAIL POPOVER MODAL */}
        {selectedTopic && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/30">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl relative">
              <button 
                onClick={() => setSelectedTopic(null)}
                className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">Detalhamento do Assunto</div>
              <h3 className="text-lg font-bold text-slate-900 mb-4">{selectedTopic.name}</h3>

              <div className="space-y-3 text-sm">
                <div className="bg-slate-50 p-3 rounded border border-slate-100 flex justify-between">
                  <span className="text-slate-600 font-medium">Classificação Consolidada:</span>
                  <span className="font-bold text-purple-900">{selectedTopic.importance_tier}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-100 flex justify-between">
                  <span className="text-slate-600 font-medium">Incidência Média:</span>
                  <span className="font-bold text-slate-900">{selectedTopic.incidence_label}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-100 flex justify-between">
                  <span className="text-slate-600 font-medium">Cobertura:</span>
                  <span className="font-bold text-slate-900">{selectedTopic.coverage_count} de {plan.active_goals_count} objetivos</span>
                </div>

                <div className="pt-2">
                  <div className="font-bold text-slate-800 mb-2 text-xs uppercase tracking-wider">Presença nos Editais Ativos:</div>
                  <div className="space-y-2">
                    {Object.keys(selectedTopic.exam_tiers).map(editionId => {
                      const edition = db.examEditions.find(e => e.id === editionId);
                      const tier = selectedTopic.exam_tiers[editionId];
                      const inc = selectedTopic.exam_incidences[editionId];
                      return (
                        <div key={editionId} className="flex justify-between items-center p-2.5 bg-slate-100 rounded text-xs">
                          <span className="font-bold text-slate-800">{edition?.name}</span>
                          <div className="flex space-x-2">
                            <span className="px-1.5 py-0.5 bg-white rounded font-bold">{tier}</span>
                            <span className="px-1.5 py-0.5 bg-white rounded font-bold text-teal-700">{inc}% incidência</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ADD TOPIC MODAL */}
        {isAddingTopic && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Adicionar Novo Assunto</h3>
              <form onSubmit={handleAddCustomTopic} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Assunto</label>
                  <input 
                    type="text" 
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    placeholder="Ex: Teoria das Penas"
                    className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div className="flex space-x-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setIsAddingTopic(false)}
                    className="flex-1 py-2 rounded font-medium text-slate-600 bg-slate-100"
                  >
                    CANCELAR
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 rounded font-bold text-white bg-teal-700 hover:bg-teal-800"
                  >
                    SALVAR
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
