"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDb } from "@/lib/preparation/useDb";
import {
  getCurrentSubject,
  getCurrentLayer,
  updateSubjectTime,
  finishRound,
  advanceCycle,
} from "@/lib/preparation/cycle";
import { evaluateLayer, getTopicsForSubjectInLayer, getOrCreateTopicProgress } from "@/lib/preparation/layerEngine";
import { getSessionProtocol } from "@/lib/preparation/sessionEngine";
import { saveDb } from "@/lib/preparation/db";
import { getSubjectTopics, type SubjectTopicOut } from "@/lib/client/engine";
import { Play, Pause, ChevronRight, Check } from "lucide-react";

export default function EstudarPage() {
  const db = useDb();
  const router = useRouter();
  const currentSubject = getCurrentSubject();
  const currentLayer = getCurrentLayer();

  const [isPaused, setIsPaused] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Form states
  const material = db.materials.find((m) => m?.subject_id === currentSubject?.id);
  const roundState = db.subjectRoundStates.find((rs) => rs?.subject_id === currentSubject?.id);
  const [updateAula, setUpdateAula] = useState(material?.current_unit || "");
  const [updatePagina, setUpdatePagina] = useState(material?.current_page || "");

  const [qQuestions, setQQuestions] = useState("");
  const [qCorrect, setQCorrect] = useState("");
  const [qDifficulty, setQDifficulty] = useState(false);

  // Topics
  const activeTopics = currentSubject ? getTopicsForSubjectInLayer(db, currentSubject.id, currentLayer) : [];
  const currentTopic = activeTopics.length > 0 ? activeTopics[0] : null;
  const protocol = currentSubject ? getSessionProtocol(db, currentSubject.id, currentLayer) : null;

  useEffect(() => {
    if (!currentSubject) {
      router.push("/");
      return;
    }
  }, [currentSubject, router]);

  useEffect(() => {
    let interval: number | undefined;
    if (!isPaused && !isFinishModalOpen && !isUpdateModalOpen) {
      interval = window.setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPaused, isFinishModalOpen, isUpdateModalOpen]);

  const [matchedFlashcardTopic, setMatchedFlashcardTopic] = useState<SubjectTopicOut | null>(null);

  useEffect(() => {
    if (currentSubject && currentTopic) {
      getSubjectTopics(currentSubject.name).then((data) => {
        if (data?.topics) {
          const match = data.topics.find(
            (t) => t.name.toLowerCase() === currentTopic.name.toLowerCase()
          );
          setMatchedFlashcardTopic(match || null);
        }
      });
    } else {
      setMatchedFlashcardTopic(null);
    }
  }, [currentSubject, currentTopic]);

  if (!currentSubject || !roundState || !material || !protocol) return null;

  const totalRemainingSeconds = Math.max(0, roundState.remaining_minutes * 60 - secondsElapsed);
  const displayMinutes = Math.floor(totalRemainingSeconds / 60);
  const displaySeconds = totalRemainingSeconds % 60;
  const studiedMinutesThisSession = Math.floor(secondsElapsed / 60);

  const handleUpdateCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    material.current_unit = updateAula;
    material.current_page = updatePagina;
    saveDb({ ...db });
    setIsUpdateModalOpen(false);
  };

  const markTopicCompleted = () => {
    if (!currentTopic) return;

    const prog = getOrCreateTopicProgress(db, currentTopic.id);
    prog.contact_count += 1;
    prog.last_seen_at = new Date().toISOString();
    if (!prog.first_seen_at) prog.first_seen_at = prog.last_seen_at;

    if (currentLayer === 1) prog.layer_1_completed = true;
    if (currentLayer === 2) prog.layer_2_completed = true;
    if (currentLayer === 3) prog.layer_3_completed = true;
    if (currentLayer === 4) prog.layer_4_completed = true;

    saveDb({ ...db });

    // Check if block ended or if there's no more topics
    const nextTopics = getTopicsForSubjectInLayer(db, currentSubject.id, currentLayer);

    if (nextTopics.length === 0) {
      advanceCycle();
      router.push("/");
    } else {
      if (totalRemainingSeconds <= 0) {
        finishRound(currentSubject.id);
        router.push("/");
      }
    }
  };

  const handleFinishStudy = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Save checkpoint
    material.current_unit = updateAula;
    material.current_page = updatePagina;

    // 2. Add time
    updateSubjectTime(currentSubject.id, studiedMinutesThisSession);

    // Check if remaining minutes hit 0
    const newRoundState = db.subjectRoundStates.find((rs) => rs.subject_id === currentSubject.id);
    if (newRoundState && newRoundState.remaining_minutes <= 0) {
      finishRound(currentSubject.id);
    }

    // 3. Questions
    if (qQuestions && qCorrect) {
      db.questionLogs.push({
        id: `q_${Date.now()}`,
        user_id: db.studyPlans[0].user_id,
        subject_id: currentSubject.id,
        material_unit_optional: updateAula,
        layer: currentLayer,
        group: protocol.question_group === "MISTO" ? "D" : protocol.question_group,
        questions: parseInt(qQuestions) || 0,
        correct: parseInt(qCorrect) || 0,
        date: new Date().toISOString(),
      });
    }

    if (currentTopic) {
      const prog = getOrCreateTopicProgress(db, currentTopic.id);
      if (qDifficulty) {
        prog.difficulty_flag = "WEAK";
      }
    }

    saveDb({ ...db });
    router.push("/");
  };

  return (
    <div className="max-w-xl mx-auto font-sans pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900 tracking-tight uppercase leading-none">
            {currentSubject.name}
          </h1>
          <div className="text-slate-600 font-medium text-lg mt-1">
            {currentTopic ? currentTopic.name : "Revisão Geral"}
          </div>
        </div>
        <div className="text-sm font-bold text-teal-700 uppercase tracking-wider">
          Camada {currentLayer}
        </div>
      </div>

      <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 shadow-md mb-6 relative overflow-hidden">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
          <div className="mb-4">
            <div className="font-bold text-slate-800 mb-2">AGORA:</div>
            <ul className="space-y-3">
              {protocol.action_list.map((act, i) => (
                <li key={i} className="flex items-start text-sm text-slate-700 font-medium">
                  <ChevronRight className="w-4 h-4 mr-1 text-slate-400 mt-0.5 flex-shrink-0" />
                  {act}
                </li>
              ))}
            </ul>
          </div>

          {currentTopic && (
            <div className="pt-4 border-t border-slate-200">
              <div className="text-xs text-slate-500 mb-2 font-medium">
                Quando concluir o contato com este assunto:
              </div>
              <button
                onClick={markTopicCompleted}
                className="w-full flex items-center justify-center space-x-2 bg-slate-200 hover:bg-slate-300 text-slate-800 py-2.5 rounded font-bold transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>MARCAR ASSUNTO CONCLUÍDO</span>
              </button>
            </div>
          )}
        </div>

        <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-100 mb-6">
          <div className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Tempo Restante</div>
          <div
            className={`text-6xl font-bold tracking-tight tabular-nums ${
              totalRemainingSeconds === 0 ? "text-red-500" : "text-slate-900"
            }`}
          >
            {String(displayMinutes).padStart(2, "0")}:{String(displaySeconds).padStart(2, "0")}
          </div>
        </div>

        {matchedFlashcardTopic && (
          <div className="mb-6 bg-amber-50/50 rounded-xl p-4 border border-amber-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-left">
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
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto text-center"
            >
              ESTUDAR CARDS
            </Link>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`w-full py-4 rounded-lg font-bold text-center transition-colors flex items-center justify-center space-x-2 ${
              isPaused
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "bg-amber-100 text-amber-800 hover:bg-amber-200"
            }`}
          >
            {isPaused ? (
              <>
                <Play className="w-5 h-5" />
                <span>RETOMAR</span>
              </>
            ) : (
              <>
                <Pause className="w-5 h-5" />
                <span>PAUSAR</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsUpdateModalOpen(true)}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-lg font-medium text-center transition-colors"
          >
            ATUALIZAR ONDE PAREI
          </button>

          <button
            onClick={() => setIsFinishModalOpen(true)}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-lg font-medium text-center transition-colors"
          >
            ENCERRAR ESTUDO
          </button>
        </div>
      </div>

      {/* UPDATE CHECKPOINT MODAL */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 uppercase tracking-wider text-slate-900">Onde você parou?</h3>
            <form onSubmit={handleUpdateCheckpoint} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Aula/Unidade</label>
                <input
                  type="text"
                  value={updateAula}
                  onChange={(e) => setUpdateAula(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Página</label>
                <input
                  type="text"
                  value={updatePagina}
                  onChange={(e) => setUpdatePagina(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="pt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="flex-1 py-2 rounded font-medium text-slate-600 bg-slate-100"
                >
                  CANCELAR
                </button>
                <button type="submit" className="flex-1 py-2 rounded font-bold text-white bg-teal-700">
                  SALVAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FINISH MODAL */}
      {isFinishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl my-8">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold uppercase tracking-wider text-slate-900">Encerrar Sessão</h3>
              <div className="text-slate-600 font-medium mt-1">Tempo estudado: {studiedMinutesThisSession} min</div>
            </div>

            <form onSubmit={handleFinishStudy} className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wider">Onde parou?</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Aula</label>
                    <input
                      type="text"
                      value={updateAula}
                      onChange={(e) => setUpdateAula(e.target.value)}
                      className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Página</label>
                    <input
                      type="text"
                      value={updatePagina}
                      onChange={(e) => setUpdatePagina(e.target.value)}
                      className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wider flex justify-between items-center">
                  <span>Fez questões?</span>
                  <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                    Bateria Automática: {protocol.question_group}
                  </span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Questões Feitas</label>
                    <input
                      type="number"
                      value={qQuestions}
                      onChange={(e) => setQQuestions(e.target.value)}
                      className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Acertos</label>
                    <input
                      type="number"
                      value={qCorrect}
                      onChange={(e) => setQCorrect(e.target.value)}
                      className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-teal-500"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-start space-x-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={qDifficulty}
                    onChange={(e) => setQDifficulty(e.target.checked)}
                    className="w-5 h-5 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                </div>
                <div className="text-sm text-slate-700 font-medium">Tive dificuldade neste conteúdo</div>
              </label>

              <div className="flex flex-col space-y-3 pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg font-bold text-white bg-slate-900 hover:bg-slate-800 text-center"
                >
                  SALVAR E ENCERRAR
                </button>
                <button
                  type="button"
                  onClick={() => setIsFinishModalOpen(false)}
                  className="w-full py-3 rounded-lg font-medium text-slate-500 hover:text-slate-700 text-center bg-slate-100 hover:bg-slate-200"
                >
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
