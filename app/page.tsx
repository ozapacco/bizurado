"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDb } from "@/lib/preparation/useDb";
import {
  getCurrentSubject,
  getNextSubjects,
  getPlanId,
  getCurrentLayer,
  advanceToNextLayer,
} from "@/lib/preparation/cycle";
import { evaluateLayer, getTopicsForSubjectInLayer } from "@/lib/preparation/layerEngine";
import { getSessionProtocol, getSuggestedRebalance } from "@/lib/preparation/sessionEngine";
import { buildConsolidatedPlan } from "@/lib/preparation/consolidatedPlanEngine";
import { saveDb } from "@/lib/preparation/db";
import { getStatsData, getSubjectTopics, type SubjectTopicOut } from "@/lib/client/engine";
import { Settings, Play, CheckCircle2, ChevronRight, Clock, Target, BookOpen, AlertTriangle } from "lucide-react";

type Stats = {
  totalCards: number;
  reviewedToday: number;
  streak: number;
  accuracy: number;
  dueToday: number;
};

export default function Home() {
  const db = useDb();
  const router = useRouter();
  const planId = getPlanId();
  const plan = db.studyPlans.find((p) => p.id === planId);
  const currentSubject = getCurrentSubject();
  const nextSubjects = getNextSubjects(3);
  const consolidated = buildConsolidatedPlan(db);

  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getStatsData().then((res) => {
      setStats(res as unknown as Stats);
    });
  }, []);

  if (!plan) return <div className="p-6 text-slate-500 font-sans">Carregando...</div>;

  const currentLayer = getCurrentLayer();
  const layerState = evaluateLayer(db);
  const isReadyToTransition = layerState.status === "READY_TO_TRANSITION";

  const rebalanceSuggestions = isReadyToTransition ? getSuggestedRebalance(db) : {};

  const handleStartTransition = () => {
    setIsRebalanceModalOpen(true);
  };

  const handleConfirmTransition = () => {
    Object.keys(rebalanceSuggestions).forEach((subId) => {
      const sub = db.subjects.find((s) => s.id === subId);
      if (sub) {
        sub.block_minutes = rebalanceSuggestions[subId].new;
        const rs = db.subjectRoundStates.find((r) => r.subject_id === sub.id);
        if (rs) {
          rs.planned_minutes = sub.block_minutes;
          rs.remaining_minutes = sub.block_minutes;
        }
      }
    });
    saveDb({ ...db });
    advanceToNextLayer();
    setIsRebalanceModalOpen(false);
  };

  const roundState = currentSubject
    ? db.subjectRoundStates.find((rs) => rs.subject_id === currentSubject.id)
    : null;
  const activeTopics = currentSubject
    ? getTopicsForSubjectInLayer(db, currentSubject.id, currentLayer)
    : [];
  const protocol = currentSubject
    ? getSessionProtocol(db, currentSubject.id, currentLayer)
    : null;

  // Find coverage count for active topic
  const activeTopic = activeTopics.length > 0 ? activeTopics[0] : null;
  const topicConsolidated = activeTopic
    ? consolidated.topics.find(
        (t) => t.canonical_topic_id === activeTopic.id || t.name === activeTopic.name
      )
    : null;
  const [matchedFlashcardTopic, setMatchedFlashcardTopic] = useState<SubjectTopicOut | null>(null);

  useEffect(() => {
    if (currentSubject && activeTopic) {
      getSubjectTopics(currentSubject.name).then((data) => {
        if (data?.topics) {
          const match = data.topics.find(
            (t) => t.name.toLowerCase() === activeTopic.name.toLowerCase()
          );
          setMatchedFlashcardTopic(match || null);
        }
      });
    } else {
      setMatchedFlashcardTopic(null);
    }
  }, [currentSubject, activeTopic]);

  return (
    <div className="max-w-xl mx-auto space-y-10 font-sans pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900 tracking-tight">HOJE</h1>
          <div className="text-slate-500 mt-1 text-sm flex items-center space-x-2">
            <span>Seu ciclo diário</span>
            {consolidated.goal_names.length > 0 && (
              <>
                <span>•</span>
                <span className="font-medium text-teal-700 truncate max-w-[250px]">
                  {consolidated.goal_names.join(" + ")}
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          href="/configuracoes"
          className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-full transition-colors border border-slate-100"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </header>

      {/* FLASHCARDS INTEGRATION SUMMARY */}
      {stats && stats.totalCards > 0 && (
        <section className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revisão Espaçada</h2>
              <div className="text-lg font-bold text-slate-900">
                {stats.dueToday > 0 ? (
                  <span className="text-amber-700 font-semibold">{stats.dueToday} flashcards aguardando hoje</span>
                ) : (
                  <span className="text-slate-700">Tudo revisado por aqui!</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {stats.totalCards} cards ativos · streak de {stats.streak} {stats.streak === 1 ? "dia" : "dias"}
              </p>
            </div>
            {stats.dueToday > 0 && (
              <Link
                href="/review"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition-colors shadow-sm"
              >
                REVISAR AGORA
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-center mb-4 relative z-10">
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Status Geral</h2>
            <div className="text-lg font-bold text-slate-900 mt-1">Camada {currentLayer}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-teal-600 tracking-tighter">{layerState.progress}%</div>
          </div>
        </div>

        {isReadyToTransition ? (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mt-4 relative z-10">
            <div className="flex items-start">
              <CheckCircle2 className="w-5 h-5 text-teal-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-teal-900">Camada concluída</h3>
                <p className="text-sm text-teal-800 mt-1 mb-3">Você cumpriu os requisitos pedagógicos desta etapa.</p>
                <button
                  onClick={handleStartTransition}
                  className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded font-bold text-sm transition-colors"
                >
                  INICIAR CAMADA {currentLayer + 1}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-slate-100 relative z-10 text-sm">
            <div className="font-medium text-slate-800 mb-2">Status da camada:</div>
            <p className="text-slate-600 mb-2">{layerState.explanation}</p>
            {layerState.missing_requirements.length > 0 && (
              <ul className="space-y-1">
                {layerState.missing_requirements.map((req, idx) => (
                  <li key={idx} className="flex items-start text-slate-600">
                    <span className="text-teal-600 mr-2 font-bold">•</span> {req}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">AGORA</h2>
        {!currentSubject ? (
          <div className="max-w-xl mx-auto py-8 text-center bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h1 className="text-xl font-bold tracking-tight">Todas as matérias desta camada foram concluídas!</h1>
            <p className="text-slate-600 text-sm">A fila aguarda o início da próxima camada.</p>
            {isReadyToTransition && (
              <button
                onClick={handleStartTransition}
                className="inline-block bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                INICIAR CAMADA {currentLayer + 1}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 shadow-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="font-serif text-3xl font-bold text-slate-900 tracking-tight leading-none mb-2">
                  {currentSubject.name}
                </div>
                <div className="text-slate-600 font-medium text-lg flex items-center flex-wrap gap-2">
                  <span>{activeTopic ? activeTopic.name : "Revisão Geral"}</span>
                  {topicConsolidated && topicConsolidated.coverage_count > 1 && (
                    <span className="inline-flex items-center text-xs font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                      <Target className="w-3 h-3 mr-1" />
                      Cai em {topicConsolidated.coverage_count} dos seus objetivos
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-teal-700 uppercase tracking-wider mt-2">
                  Camada {currentLayer} · {protocol?.title}
                </div>
              </div>
              {roundState && (
                <div className="flex items-center text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full font-medium text-sm">
                  <Clock className="w-4 h-4 mr-1.5" />
                  {roundState.remaining_minutes} min
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-6">
              <div className="mb-4">
                <div className="font-bold text-slate-800 mb-2">FAÇA:</div>
                <ul className="space-y-3">
                  {protocol?.action_list.map((act, i) => (
                    <li key={i} className="flex items-start text-sm text-slate-700 font-medium">
                      <ChevronRight className="w-4 h-4 mr-1 text-slate-400 mt-0.5 flex-shrink-0" />
                      {act}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex space-x-4 pt-4 border-t border-slate-200 text-sm font-medium">
                <div className="flex-1">
                  <span className="text-slate-500 block text-xs uppercase mb-1">Bateria Sugerida</span>
                  <span className="text-slate-800">Grupo {protocol?.question_group}</span>
                </div>
                <div className="flex-1">
                  <span className="text-slate-500 block text-xs uppercase mb-1">Referência</span>
                  <span className="text-slate-800">{protocol?.question_reference}</span>
                </div>
              </div>
            </div>

            {matchedFlashcardTopic && (
              <div className="mb-6 bg-amber-50/50 rounded-xl p-4 border border-amber-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm">
                <div>
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-widest block mb-1">
                    Flashcards do Assunto
                  </span>
                  <p className="text-slate-800 font-medium leading-snug">
                    Você tem <strong className="text-slate-900">{matchedFlashcardTopic.cardCount} flashcards</strong> para este assunto.
                  </p>
                  {matchedFlashcardTopic.dueNow > 0 && (
                    <span className="text-xs text-amber-700 font-bold block mt-1">
                      ⚠️ {matchedFlashcardTopic.dueNow} cards precisando de revisão hoje!
                    </span>
                  )}
                </div>
                <Link
                  href={`/study?topicId=${matchedFlashcardTopic.id}`}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto"
                >
                  ESTUDAR CARDS
                </Link>
              </div>
            )}

            <button
              onClick={() => router.push("/estudar")}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-4 font-bold transition-all flex items-center justify-center group-hover:shadow-lg"
            >
              CONTINUAR ESTUDO
              <Play className="w-5 h-5 ml-2 fill-current" />
            </button>

            <div className="mt-4 text-center">
              <span className="text-xs text-slate-400">Por que? {protocol?.reason}</span>
            </div>
          </div>
        )}
      </section>

      {nextSubjects.length > 0 && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Próximas na Fila</h2>
            <Link
              href="/ciclo"
              className="text-xs font-bold text-teal-600 hover:text-teal-700 uppercase tracking-wider"
            >
              Ver Ciclo
            </Link>
          </div>
          <div className="space-y-3">
            {nextSubjects.map((subject, index) => {
              const rs = db.subjectRoundStates.find((r) => r.subject_id === subject.id);
              return (
                <div
                  key={`${subject.id}-${index}`}
                  className="flex items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-teal-200 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-sm mr-4 border border-slate-200">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">{subject.name}</div>
                    <div className="text-sm text-slate-500">{rs?.planned_minutes} min previstos</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isRebalanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl my-8">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold uppercase tracking-wider text-slate-900">
                Preparar Camada {currentLayer + 1}
              </h3>
              <p className="text-slate-600 mt-2 text-sm">
                O sistema calculou os novos tempos de bloco com base no seu desempenho.
              </p>
            </div>

            <div className="space-y-4 mb-8 max-h-[50vh] overflow-y-auto pr-2">
              {Object.keys(rebalanceSuggestions).length === 0 ? (
                <div className="text-center text-slate-500 py-4 bg-slate-50 rounded-lg">
                  Tempos mantidos (dados insuficientes para ajuste automático).
                </div>
              ) : (
                Object.keys(rebalanceSuggestions).map((subId) => {
                  const sub = db.subjects.find((s) => s.id === subId);
                  if (!sub) return null;
                  const change = rebalanceSuggestions[subId];
                  const isIncrease = change.new > change.old;
                  const isDecrease = change.new < change.old;
                  return (
                    <div key={subId} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-slate-800">{sub.name}</span>
                        <div className="flex items-center space-x-2 font-bold tabular-nums text-sm">
                          <span className="text-slate-400">{change.old}m</span>
                          <span className="text-slate-300">→</span>
                          <span
                            className={
                              isIncrease
                                ? "text-teal-600"
                                : isDecrease
                                ? "text-amber-600"
                                : "text-slate-800"
                            }
                          >
                            {change.new}m
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{change.reason}</div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex flex-col space-y-3">
              <button
                onClick={handleConfirmTransition}
                className="w-full py-3 rounded-lg font-bold text-white bg-teal-700 hover:bg-teal-800 text-center"
              >
                ACEITAR CICLO SUGERIDO
              </button>
              <button
                onClick={() => setIsRebalanceModalOpen(false)}
                className="w-full py-3 rounded-lg font-medium text-slate-500 hover:text-slate-700 text-center bg-slate-100 hover:bg-slate-200"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
