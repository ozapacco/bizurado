"use client";

import React, { useState } from "react";
import { parkCurrentCycle, resetHydration } from "@/lib/preparation/sync";
import AlignPanel from "@/components/AlignPanel";
import BackupPanel from "@/components/BackupPanel";
import { useDb } from "@/lib/preparation/useDb";
import { evaluateLayer } from "@/lib/preparation/layerEngine";
import { buildConsolidatedPlan } from "@/lib/preparation/consolidatedPlanEngine";
import { generateCycleSuggestions, syncConsolidatedCycleToDb } from "@/lib/preparation/cycleBuilderEngine";
import { resetDb, saveDb } from "@/lib/preparation/db";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AddGoalWizardModal from "@/components/AddGoalWizardModal";
import VerticalSyllabusModal from "@/components/VerticalSyllabusModal";
import { PlusCircle, Layers, Trash2 } from "lucide-react";

export default function Settings() {
  const db = useDb();
  const router = useRouter();
  const plan = db.studyPlans[0];
  const layerState = evaluateLayer(db);
  const consolidatedPlan = buildConsolidatedPlan(db);

  const [isAddWizardOpen, setIsAddWizardOpen] = useState(false);
  const [isSyllabusOpen, setIsSyllabusOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  const handleReset = () => {
    if (
      confirm(
        "Tem certeza? Todos os seus dados de preparação serão apagados e os dados de demonstração serão recarregados."
      )
    ) {
      // Guarda o estado atual na nuvem antes de apagar. Se não der para
      // guardar, o reset NÃO acontece — sem cópia não há volta.
      void parkCurrentCycle("pre-reset").then((guardado) => {
        if (!guardado) {
          window.alert(
            "Não foi possível guardar uma cópia do seu ciclo na nuvem. O reset foi cancelado."
          );
          return;
        }
        resetDb();
        // O módulo de sincronia continua vivo numa navegação client-side: sem
        // reabrir a hidratação, a primeira edição empurraria o seed de fábrica
        // por cima do ciclo real na nuvem.
        resetHydration();
        router.push("/");
      });
    }
  };

  const handleTogglePriority = (goalId: string) => {
    const goal = db.userExamGoals.find((g) => g.id === goalId);
    if (goal) {
      goal.priority = goal.priority === "PRIMARY" ? "SECONDARY" : "PRIMARY";
      saveDb({ ...db });
      const suggestions = generateCycleSuggestions(db);
      syncConsolidatedCycleToDb(db, suggestions);
    }
  };

  const handleRemoveGoal = (goalId: string) => {
    const goal = db.userExamGoals.find((g) => g.id === goalId);
    if (goal) {
      goal.active = false;
      saveDb({ ...db });
      const suggestions = generateCycleSuggestions(db);
      syncConsolidatedCycleToDb(db, suggestions);
    }
  };

  const activeGoals = db.userExamGoals.filter((g) => g.active);

  return (
    <div className="max-w-3xl mx-auto space-y-8 font-sans pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CONFIGURAÇÕES</h1>
        <div className="text-slate-500 mt-1 text-sm">
          Gerencie seus objetivos de prova e estrutura de preparação
        </div>
      </div>

      <AlignPanel />

      <BackupPanel />

      {/* PLANOS DE PROVA (EXAM GOALS) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
              Planos de Prova (Objetivos)
            </h2>
            <div className="text-sm text-slate-600 mt-0.5">
              O sistema consolida seus alvos e calcula os pesos ideais para o seu ciclo.
            </div>
          </div>
          <button
            onClick={() => setIsAddWizardOpen(true)}
            className="inline-flex items-center justify-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ADICIONAR OBJETIVO</span>
          </button>
        </div>

        <div className="space-y-3 mb-6">
          {activeGoals.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 rounded-xl text-slate-500 text-sm">
              Nenhum objetivo de prova ativo. Clique em &ldquo;Adicionar Objetivo&rdquo; para selecionar sua carreira.
            </div>
          ) : (
            activeGoals.map((goal) => {
              const edition = db.examEditions.find((e) => e.id === goal.exam_edition_id);
              if (!edition) return null;

              return (
                <div
                  key={goal.id}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-base">{edition.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          goal.priority === "PRIMARY"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {goal.priority === "PRIMARY" ? "PRINCIPAL" : "SECUNDÁRIO"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-medium ${
                          edition.status === "PUBLISHED"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {edition.status === "PUBLISHED" ? "Edital Publicado" : "Pré-edital / Perfil Histórico"}
                      </span>

                      <span className="text-slate-500">
                        {edition.data_quality === "OFFICIAL"
                          ? "Baseado em edital oficial"
                          : edition.data_quality === "HISTORICAL_ANALYSIS"
                          ? "Pré-edital / Análise histórica"
                          : "Dados de demonstração"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    <button
                      onClick={() => {
                        setSelectedExamId(edition.id);
                        setIsSyllabusOpen(true);
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 flex items-center"
                    >
                      <Layers className="w-3.5 h-3.5 mr-1" />
                      Edital
                    </button>

                    <button
                      onClick={() => handleTogglePriority(goal.id)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium text-slate-600"
                    >
                      Mudar Prioridade
                    </button>

                    <button
                      onClick={() => handleRemoveGoal(goal.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Remover Objetivo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {activeGoals.length > 0 && (
          <button
            onClick={() => {
              setSelectedExamId(null);
              setIsSyllabusOpen(true);
            }}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-sm transition-colors flex items-center justify-center space-x-2"
          >
            <Layers className="w-4 h-4" />
            <span>VER PLANO CONSOLIDADO (TODOS OS OBJETIVOS)</span>
          </button>
        )}
      </section>

      {/* CAMADA ATUAL */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Camada Atual</h2>
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          <div>
            <div className="text-xl font-bold text-slate-900">Camada {plan?.current_layer}</div>
            <div className="text-sm text-slate-600">
              {plan?.current_layer === 1
                ? "Orientação e Ambientação"
                : plan?.current_layer === 2
                ? "Consolidação do Núcleo"
                : plan?.current_layer === 3
                ? "Aceleração e Reforço"
                : plan?.current_layer === 4
                ? "Construção"
                : "Sustentação"}
            </div>

            <div className="mt-4 flex flex-col space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</div>
              <div className="font-medium text-slate-800">
                {layerState.status === "READY_TO_TRANSITION"
                  ? "PRONTA PARA TRANSIÇÃO"
                  : layerState.status === "SUSTAINING"
                  ? "SUSTENTAÇÃO"
                  : "EM ANDAMENTO"}
              </div>
            </div>
            <div className="mt-2 flex flex-col space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Progresso</div>
              <div className="font-medium text-slate-800">{layerState.progress}%</div>
            </div>
          </div>

          <Link
            href="/"
            className="inline-block bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors self-start md:self-auto text-center"
          >
            VER CRITÉRIOS (HOME)
          </Link>
        </div>
      </section>

      {/* DADOS & RESET */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Dados & Sistema</h2>
        <div className="space-y-3">
          <button
            onClick={handleReset}
            className="w-full bg-red-50 hover:bg-red-100 text-red-700 py-3 rounded-lg font-bold text-center transition-colors mt-4"
          >
            RESETAR PARA DEMONSTRAÇÃO
          </button>
        </div>
      </section>

      {/* MODALS */}
      <AddGoalWizardModal isOpen={isAddWizardOpen} onClose={() => setIsAddWizardOpen(false)} />

      <VerticalSyllabusModal
        isOpen={isSyllabusOpen}
        onClose={() => setIsSyllabusOpen(false)}
        examEditionId={selectedExamId}
      />
    </div>
  );
}
