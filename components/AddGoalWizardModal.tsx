import React, { useState } from 'react';
import { useDb } from '@/lib/preparation/useDb';
import { saveDb } from '@/lib/preparation/db';
import { generateCycleSuggestions, syncConsolidatedCycleToDb } from '@/lib/preparation/cycleBuilderEngine';
import { CareerFamily, GoalPriority, ExamEdition } from '@/lib/preparation/types';
import { X, ChevronRight, CheckCircle, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const BRAZIL_STATES = [
  'Acre (AC)', 'Alagoas (AL)', 'Amapá (AP)', 'Amazonas (AM)', 'Bahia (BA)', 'Ceará (CE)',
  'Distrito Federal (DF)', 'Espírito Santo (ES)', 'Goiás (GO)', 'Maranhão (MA)', 'Mato Grosso (MT)',
  'Mato Grosso do Sul (MS)', 'Minas Gerais (MG)', 'Pará (PA)', 'Paraíba (PB)', 'Paraná (PR)',
  'Pernambuco (PE)', 'Piauí (PI)', 'Rio de Janeiro (RJ)', 'Rio Grande do Norte (RN)',
  'Rio Grande do Sul (RS)', 'Rondônia (RO)', 'Roraima (RR)', 'Santa Catarina (SC)',
  'São Paulo (SP)', 'Sergipe (SE)', 'Tocantins (TO)'
];

export default function AddGoalWizardModal({ isOpen, onClose }: Props) {
  const db = useDb();

  const [step, setStep] = useState<number>(1);
  const [selectedCareer, setSelectedCareer] = useState<CareerFamily | null>(null);
  const [selectedState, setSelectedState] = useState<string>('Santa Catarina (SC)');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedEditionId, setSelectedEditionId] = useState<string>('');
  const [priority, setPriority] = useState<GoalPriority>('PRIMARY');

  if (!isOpen) return null;

  // Step 1: Careers
  const careers = db.careerFamilies.filter(c => c.active);

  // Step 2: Institutions & Roles
  const institutions = selectedCareer 
    ? db.institutions.filter(i => i.career_family_id === selectedCareer.id && i.active) 
    : [];
  const instIds = institutions.map(i => i.id);
  const roles = db.roles.filter(r => instIds.includes(r.institution_id) && r.active);

  // Step 3: Editions
  const editions = selectedRoleId
    ? db.examEditions.filter(e => e.role_id === selectedRoleId && e.active)
    : [];

  const handleNextStep1 = (career: CareerFamily) => {
    setSelectedCareer(career);
    if (career.scope === 'FEDERAL') {
      setStep(3); // Skip state/city selection for Federal
    } else {
      setStep(2);
    }
  };

  const handleNextStep2 = () => {
    setStep(3);
  };

  const handleNextStep3 = (roleId: string) => {
    setSelectedRoleId(roleId);
    setStep(4);
  };

  const handleFinish = (editionId: string) => {
    const edition = db.examEditions.find(e => e.id === editionId);
    if (!edition) return;

    // Check if goal already exists
    const existing = db.userExamGoals.find(g => g.exam_edition_id === editionId);
    if (existing) {
      existing.active = true;
      existing.priority = priority;
    } else {
      db.userExamGoals.push({
        id: `ueg_${Date.now()}`,
        user_id: db.studyPlans[0].user_id,
        exam_edition_id: editionId,
        priority: priority,
        active: true,
        created_at: new Date().toISOString(),
      });
    }

    // Auto-update cycle based on Consolidated Plan
    saveDb({ ...db });
    const suggestions = generateCycleSuggestions(db);
    syncConsolidatedCycleToDb(db, suggestions);

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl my-8 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <div className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">Passo {step} de 4</div>
          <h2 className="text-xl font-bold text-slate-900">
            {step === 1 && 'Selecione a Carreira'}
            {step === 2 && 'Selecione a Localidade'}
            {step === 3 && 'Selecione o Cargo'}
            {step === 4 && 'Selecione o Plano / Edital'}
          </h2>
        </div>

        {/* STEP 1: CAREER */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {careers.map(career => (
              <button
                key={career.id}
                onClick={() => handleNextStep1(career)}
                className="p-4 border border-slate-200 rounded-xl text-left hover:border-teal-500 hover:bg-teal-50/50 transition-all group flex justify-between items-center"
              >
                <div>
                  <div className="font-bold text-slate-900 group-hover:text-teal-900">{career.name}</div>
                  <div className="text-xs text-slate-500 uppercase mt-0.5">{career.scope}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600" />
              </button>
            ))}
          </div>
        )}

        {/* STEP 2: LOCATION */}
        {step === 2 && selectedCareer && (
          <div className="space-y-4">
            {selectedCareer.scope === 'STATE' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Estado</label>
                <select 
                  value={selectedState}
                  onChange={e => setSelectedState(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500"
                >
                  {BRAZIL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {selectedCareer.scope === 'MUNICIPAL' && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Estado</label>
                  <select 
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500"
                  >
                    {BRAZIL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Município</label>
                  <input 
                    type="text" 
                    value={selectedCity} 
                    onChange={e => setSelectedCity(e.target.value)}
                    placeholder="Ex: São Paulo, Chapecó..."
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </>
            )}

            <button
              onClick={handleNextStep2}
              className="w-full py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold transition-colors mt-4"
            >
              CONTINUAR PARA CARGOS
            </button>
          </div>
        )}

        {/* STEP 3: ROLE */}
        {step === 3 && (
          <div className="space-y-3">
            {roles.length === 0 ? (
              <div className="text-center text-slate-500 py-6 bg-slate-50 rounded-xl">
                Nenhum cargo ativo encontrado para esta instituição.
              </div>
            ) : (
              roles.map(role => {
                const inst = db.institutions.find(i => i.id === role.institution_id);
                return (
                  <button
                    key={role.id}
                    onClick={() => handleNextStep3(role.id)}
                    className="w-full p-4 border border-slate-200 rounded-xl text-left hover:border-teal-500 hover:bg-teal-50/50 transition-all flex justify-between items-center group"
                  >
                    <div>
                      <div className="font-bold text-slate-900 group-hover:text-teal-900">{role.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{inst?.name}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600" />
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* STEP 4: EDITION & PRIORITY */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Prioridade do Objetivo</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPriority('PRIMARY')}
                  className={`p-3 rounded-xl border font-bold text-sm text-center transition-all ${
                    priority === 'PRIMARY' 
                      ? 'border-teal-600 bg-teal-50 text-teal-900' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  OBJETIVO PRINCIPAL
                  <div className="text-xs font-normal text-slate-500 mt-0.5">Peso 100% no ciclo</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('SECONDARY')}
                  className={`p-3 rounded-xl border font-bold text-sm text-center transition-all ${
                    priority === 'SECONDARY' 
                      ? 'border-teal-600 bg-teal-50 text-teal-900' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  OBJETIVO SECUNDÁRIO
                  <div className="text-xs font-normal text-slate-500 mt-0.5">Peso 70% no ciclo</div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {editions.map(ed => (
                <button
                  key={ed.id}
                  onClick={() => handleFinish(ed.id)}
                  className="w-full p-4 border border-slate-200 rounded-xl text-left hover:border-teal-600 hover:bg-teal-50/50 transition-all flex justify-between items-center group"
                >
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-teal-900 flex items-center">
                      {ed.name}
                      {ed.data_quality === 'OFFICIAL' && (
                        <ShieldCheck className="w-4 h-4 text-teal-600 ml-2" title="Oficial" />
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        ed.status === 'PUBLISHED' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {ed.status === 'PUBLISHED' ? 'Edital Publicado' : 'Pré-edital / Histórico'}
                      </span>
                      <span>Banca: {ed.exam_board || 'A definir'}</span>
                    </div>
                  </div>
                  <CheckCircle className="w-6 h-6 text-slate-300 group-hover:text-teal-600" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
