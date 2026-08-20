"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useDb } from "@/lib/preparation/useDb";
import { getCurrentSubject, getNextSubjects, getPlanId, getCurrentLayer } from "@/lib/preparation/cycle";
import { evaluateLayer, getOrCreateTopicProgress } from "@/lib/preparation/layerEngine";
import { buildConsolidatedPlan } from "@/lib/preparation/consolidatedPlanEngine";
import { getSubjectTopics, type SubjectTopicOut } from "@/lib/client/engine";
import { matchTopicDecks, resolveSubjectName } from "@/lib/subjectMatch";
import AddCardModal from "@/components/AddCardModal";
import TopicActions from "@/components/TopicActions";
import { fullName, isLeaf, pathOf, scopedLeaves, treeOf } from "@/lib/preparation/topicOps";
import AddTopicButton from "@/components/AddTopicButton";
import { pickEntryDeck } from "@/lib/deckEntry";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock, Target, Play } from "lucide-react";

export default function Disciplinas() {
  const db = useDb();
  const planId = getPlanId();
  const currentLayer = getCurrentLayer();
  const layerState = evaluateLayer(db);
  const currentSubject = getCurrentSubject();
  const nextSubjects = getNextSubjects(2);
  const consolidated = buildConsolidatedPlan(db);

  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>("TODAS");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("TODAS");
  const [sortBy, setSortBy] = useState<string>("CICLO");

  // Local flashcard topics cache
  const [novoCard, setNovoCard] = useState<{ subject: string; topic: string } | null>(null);
  const [flashcardTopics, setFlashcardTopics] = useState<Record<string, SubjectTopicOut[]>>({});

  const layerTitles: Record<number, string> = {
    1: "Orientação e Ambientação",
    2: "Consolidação do Núcleo",
    3: "Aceleração e Reforço",
    4: "Construção",
    5: "Sustentações",
  };

  const allSubjects = db.subjects.filter((s) => s.study_plan_id === planId);

  // Pre-carrega os baralhos de cada disciplina para montar os links de estudo.
  // A dependência é a lista de nomes (string estável), não o array de objetos —
  // assim o efeito não redispara a cada render.
  const subjectNames = allSubjects.map((s) => s.name).join("|");

  useEffect(() => {
    let cancelled = false;
    subjectNames
      .split("|")
      .filter(Boolean)
      .forEach((name) => {
        getSubjectTopics(name).then((data) => {
          if (cancelled || !data?.topics) return;
          setFlashcardTopics((prev) => ({
            ...prev,
            [name.toLowerCase()]: data.topics,
          }));
        });
      });
    return () => {
      cancelled = true;
    };
  }, [subjectNames]);

  // Build enhanced data model for each subject
  const subjectsData = allSubjects.map((subject) => {
    const rs = db.subjectRoundStates.find((r) => r.subject_id === subject.id);
    const material = db.materials.find((m) => m.subject_id === subject.id);

    // Consolidated info
    const discConsolidated = consolidated.disciplines.find(
      (d) => d.name === resolveSubjectName(subject.name, consolidated.disciplines.map((x) => x.name))
    );

    const emphasisLabel = discConsolidated ? discConsolidated.emphasis_label : "MÉDIA";

    // Topic completion stats
    // Contagem e progresso usam só os ativos. A TABELA mostra os pausados
    // também, apagados: esconder o que você pausou é receita para esquecer que
    // pausou e achar que sumiu.
    const subjectTopics = scopedLeaves(db, subject.id).sort((a, b) => a.order - b.order);
    // Árvore: pais antes dos filhos, com a profundidade para a indentação.
    const topicosVisiveis = treeOf(db, subject.id);
    const eligibleCount = subjectTopics.length;

    let completedCount = 0;
    subjectTopics.forEach((t) => {
      const prog = getOrCreateTopicProgress(db, t.id);
      if (currentLayer === 1 && prog.layer_1_completed) completedCount++;
      else if (currentLayer === 2 && (t.importance_tier !== "CORE" || prog.layer_2_completed)) completedCount++;
      else if (currentLayer === 3 && (t.importance_tier !== "CORE" || prog.layer_3_completed)) completedCount++;
      else if (currentLayer === 4 && (t.importance_tier !== "CORE" || prog.layer_4_completed)) completedCount++;
      else if (currentLayer === 5) completedCount++;
    });

    const progressPct = eligibleCount === 0 ? 0 : Math.round((completedCount / eligibleCount) * 100);

    // Question stats
    const logs = db.questionLogs.filter((l) => l.subject_id === subject.id);
    const totalQ = logs.reduce((acc, l) => acc + l.questions, 0);
    const totalC = logs.reduce((acc, l) => acc + l.correct, 0);

    let accuracyText = "—";
    let rawAccuracy = -1;
    if (totalQ > 0) {
      if (totalQ < 15) {
        accuracyText = "Poucos dados";
      } else {
        rawAccuracy = Math.round((totalC / totalQ) * 100);
        accuracyText = `${rawAccuracy}%`;
      }
    }

    // Material progress
    let materialProgress = 0;
    if (material && material.total_units > 0) {
      const currentUnitNum = parseInt(material.current_unit) || 0;
      materialProgress = Math.min(100, Math.round((currentUnitNum / material.total_units) * 100));
    }

    // Cycle Status
    const isCurrent = currentSubject?.id === subject.id;
    const isNext = nextSubjects.some((s) => s.id === subject.id);
    const isCompletedInLayer = eligibleCount > 0 && completedCount === eligibleCount;
    const isDoneInRound = !isCompletedInLayer && rs && rs.remaining_minutes === 0;

    let cycleStatus: "ATUAL" | "PRÓXIMA" | "AGUARDANDO" | "RODADA CONCLUÍDA" | "CONCLUÍDA NA CAMADA" =
      "AGUARDANDO";
    if (isCompletedInLayer) cycleStatus = "CONCLUÍDA NA CAMADA";
    else if (isCurrent) cycleStatus = "ATUAL";
    else if (isNext) cycleStatus = "PRÓXIMA";
    else if (isDoneInRound) cycleStatus = "RODADA CONCLUÍDA";

    // Discrete Alert
    let discreteAlert = "Dentro do esperado.";
    if (
      (emphasisLabel === "MUITO ALTA" || emphasisLabel === "ALTA") &&
      rawAccuracy !== -1 &&
      rawAccuracy < 60
    ) {
      discreteAlert = "Alta importância · desempenho abaixo do esperado";
    } else if (eligibleCount - completedCount > 0) {
      const layerOrd =
        currentLayer === 1
          ? "primeira"
          : currentLayer === 2
          ? "segunda"
          : currentLayer === 3
          ? "terceira"
          : "quarta";
      discreteAlert = `${eligibleCount - completedCount} assuntos ainda precisam da ${layerOrd} passagem.`;
    }

    // Current topic
    const activeTopicsForSub = subjectTopics.filter((t) => {
      const p = getOrCreateTopicProgress(db, t.id);
      if (currentLayer === 1) return !p.layer_1_completed;
      if (currentLayer === 2) return t.importance_tier === "CORE" && !p.layer_2_completed;
      if (currentLayer === 3) return t.importance_tier === "CORE" && !p.layer_3_completed;
      if (currentLayer === 4) return t.importance_tier === "CORE" && !p.layer_4_completed;
      return false;
    });
    const currentTopicName =
      activeTopicsForSub.length > 0 ? activeTopicsForSub[0].name : subjectTopics[0]?.name || "Concluído";

    return {
      subject,
      emphasisLabel,
      eligibleCount,
      completedCount,
      progressPct,
      totalQ,
      totalC,
      accuracyText,
      rawAccuracy,
      materialProgress,
      material,
      rs,
      cycleStatus,
      discreteAlert,
      subjectTopics,
      topicosVisiveis,
      currentTopicName,
      examNames: discConsolidated?.exam_names || [],
    };
  });

  // Apply filters
  let filtered = subjectsData.filter((item) => {
    if (selectedExamFilter !== "TODAS") {
      if (!item.examNames.includes(selectedExamFilter)) return false;
    }
    if (selectedStatusFilter === "ATUAL" && item.cycleStatus !== "ATUAL") return false;
    if (selectedStatusFilter === "PENDENTES" && item.cycleStatus === "CONCLUÍDA NA CAMADA") return false;
    if (selectedStatusFilter === "CONCLUÍDAS" && item.cycleStatus !== "CONCLUÍDA NA CAMADA") return false;

    return true;
  });

  // Apply sort
  filtered.sort((a, b) => {
    if (sortBy === "PESO") {
      const order: Record<string, number> = { "MUITO ALTA": 4, ALTA: 3, MÉDIA: 2, BAIXA: 1 };
      return order[b.emphasisLabel] - order[a.emphasisLabel];
    }
    if (sortBy === "DESEMPENHO") {
      return b.rawAccuracy - a.rawAccuracy;
    }
    return a.subject.cycle_order - b.subject.cycle_order;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans pb-12">
      {/* TOP SECTION */}
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">DISCIPLINAS</h1>
            <div className="text-slate-600 font-medium text-sm mt-1">
              Objetivos ativos:{" "}
              <span className="font-bold text-teal-700">
                {consolidated.goal_names.join(" + ") || "Nenhum"}
              </span>
            </div>
          </div>
          <div className="bg-slate-100 px-4 py-2 rounded-xl text-left self-start sm:self-auto">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Camada Atual</div>
            <div className="text-sm font-bold text-slate-900">
              Camada {currentLayer} — {layerTitles[currentLayer] || "Ambientação"}
            </div>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-wider">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500">PROVA:</span>
            <select
              value={selectedExamFilter}
              onChange={(e) => setSelectedExamFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded p-1.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="TODAS">Todas</option>
              {consolidated.goal_names.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500">SITUAÇÃO:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded p-1.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="TODAS">Todas</option>
              <option value="ATUAL">Atual</option>
              <option value="PENDENTES">Pendentes</option>
              <option value="CONCLUÍDAS">Concluídas</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider">
          <span className="text-slate-500">ORDENAR:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white border border-slate-300 rounded p-1.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="CICLO">Ordem do ciclo</option>
            <option value="PESO">Peso</option>
            <option value="DESEMPENHO">Desempenho</option>
          </select>
        </div>
      </div>

      {/* SPREADSHEET TABLE (DESKTOP) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4 w-8"></th>
              <th className="p-4">DISCIPLINA</th>
              <th className="p-4">PESO</th>
              <th className="p-4">CAMADA</th>
              <th className="p-4 text-center">ASSUNTOS</th>
              <th className="p-4 text-right">QUESTÕES</th>
              <th className="p-4 text-right">ACERTOS</th>
              <th className="p-4 text-center">MATERIAL</th>
              <th className="p-4">CICLO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((item) => {
              const isExpanded = expandedSubjectId === item.subject.id;

              return (
                <React.Fragment key={item.subject.id}>
                  <tr
                    onClick={() => setExpandedSubjectId(isExpanded ? null : item.subject.id)}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                      item.cycleStatus === "ATUAL" ? "bg-teal-50/40" : ""
                    }`}
                  >
                    <td className="p-4 text-slate-400">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="p-4 font-bold text-slate-900">{item.subject.name}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          item.emphasisLabel === "MUITO ALTA"
                            ? "bg-purple-100 text-purple-800"
                            : item.emphasisLabel === "ALTA"
                            ? "bg-teal-100 text-teal-800"
                            : item.emphasisLabel === "MÉDIA"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.emphasisLabel}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-800">
                      C{currentLayer} · {item.completedCount}/{item.eligibleCount}
                    </td>
                    <td className="p-4 text-center text-slate-600 font-medium">
                      {item.completedCount} / {item.eligibleCount}
                    </td>
                    <td className="p-4 text-right tabular-nums text-slate-700">{item.totalQ}</td>
                    <td className="p-4 text-right tabular-nums font-bold text-slate-800">{item.accuracyText}</td>
                    <td className="p-4 text-center font-medium text-slate-700">{item.materialProgress}%</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${
                          item.cycleStatus === "ATUAL"
                            ? "bg-teal-700 text-white"
                            : item.cycleStatus === "PRÓXIMA"
                            ? "bg-teal-100 text-teal-800"
                            : item.cycleStatus === "CONCLUÍDA NA CAMADA"
                            ? "bg-slate-200 text-slate-700"
                            : item.cycleStatus === "RODADA CONCLUÍDA"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.cycleStatus}
                      </span>
                    </td>
                  </tr>

                  {/* EXPANDED ROW DETAILS */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="bg-slate-50 p-6 border-t border-b border-slate-200">
                        <div className="space-y-6">
                          {/* DISCRETE ALERT */}
                          <div className="bg-white border border-slate-200 p-3.5 rounded-xl flex items-center justify-between text-sm font-medium text-slate-800">
                            <div className="flex items-center space-x-3">
                              <AlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                              <span>{item.discreteAlert}</span>
                            </div>
                            {/* Só oferecer revisão quando existe baralho: antes o
                                link aparecia até para Informática, que não tem
                                card nenhum, e levava a um falso "acabou". */}
                            {flashcardTopics[item.subject.name.toLowerCase()] && (
                            <Link
                              href={`/review?subjectId=${encodeURIComponent(item.subject.name)}`}
                              className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center space-x-1"
                            >
                              <span>Revisar flashcards desta disciplina</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                            )}
                          </div>

                          {/* 4 SUMMARY INDICATORS */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Progresso Camada
                              </div>
                              <div className="text-lg font-bold text-slate-900">
                                {item.completedCount} / {item.eligibleCount} ({item.progressPct}%)
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Desempenho
                              </div>
                              <div className="text-lg font-bold text-slate-900">{item.accuracyText}</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Peso Consolidado
                              </div>
                              <div className="text-lg font-bold text-slate-900">{item.emphasisLabel}</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Posição Ciclo
                              </div>
                              <div className="text-lg font-bold text-slate-900">
                                {item.cycleStatus} ({item.subject.block_minutes}m)
                              </div>
                            </div>
                          </div>

                          {/* CHECKPOINT DETAILS */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                            <div>
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Onde parou
                              </div>
                              <div className="font-medium text-slate-800">
                                {item.material?.name || "Nenhum"}{" "}
                                {item.material?.current_unit ? `· Aula ${item.material.current_unit}` : ""}{" "}
                                {item.material?.current_page ? `, Pág ${item.material.current_page}` : ""}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Assunto Atual
                              </div>
                              <div className="font-medium text-teal-800">{item.currentTopicName}</div>
                            </div>
                          </div>

                          {/* TOPICS SUB-TABLE */}
                          <div>
                            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Assuntos da Disciplina
                                <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                                  {item.subjectTopics.length} ativo
                                  {item.subjectTopics.length === 1 ? "" : "s"}
                                  {item.topicosVisiveis.length > item.subjectTopics.length &&
                                    ` · ${
                                      item.topicosVisiveis.length - item.subjectTopics.length
                                    } pausado${
                                      item.topicosVisiveis.length - item.subjectTopics.length === 1
                                        ? ""
                                        : "s"
                                    }`}
                                </span>
                              </div>
                              <AddTopicButton
                                subjectId={item.subject.id}
                                subjectName={item.subject.name}
                              />
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                              <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    <th className="p-3">ASSUNTO</th>
                                    <th className="p-3">INCIDÊNCIA</th>
                                    <th className="p-3">PASSAGENS</th>
                                    <th className="p-3 text-right">QUESTÕES</th>
                                    <th className="p-3 text-right">ACERTOS</th>
                                    <th className="p-3">STATUS</th>
                                    <th className="p-3 text-center">FLASHCARDS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {item.topicosVisiveis.map(({ topic, depth }) => {
                                    const prog = getOrCreateTopicProgress(db, topic.id);

                                    // Topic incidence label
                                    const topicCons = consolidated.topics.find(
                                      (t) =>
                                        t.canonical_topic_id === topic.id || t.name === topic.name
                                    );
                                    const incidenceText = topicCons ? topicCons.incidence_label : "MÉDIA";

                                    const isCurrentTopic = item.currentTopicName === topic.name;

                                    const renderPassageBadge = (layerNum: number, isDone: boolean) => {
                                      const isCurrentLayerTarget = layerNum === currentLayer && isCurrentTopic;
                                      if (isDone)
                                        return (
                                          <span key={layerNum} className="text-teal-600 font-bold mx-1">
                                            C{layerNum} ✓
                                          </span>
                                        );
                                      if (isCurrentLayerTarget)
                                        return (
                                          <span key={layerNum} className="text-amber-600 font-bold mx-1">
                                            C{layerNum} →
                                          </span>
                                        );
                                      return (
                                        <span key={layerNum} className="text-slate-300 mx-1">
                                          C{layerNum} ○
                                        </span>
                                      );
                                    };

                                    // Topic status
                                    let topicStatus = "PENDENTE";
                                    if (isCurrentTopic && item.cycleStatus === "ATUAL") topicStatus = "ATUAL";
                                    else if (
                                      (currentLayer === 1 && prog.layer_1_completed) ||
                                      (currentLayer === 2 && prog.layer_2_completed) ||
                                      (currentLayer === 3 && prog.layer_3_completed)
                                    )
                                      topicStatus = "CONCLUÍDO NA CAMADA";
                                    else if (prog.difficulty_flag === "WEAK") topicStatus = "DIFICULDADE";
                                    else if (prog.question_count === 0) topicStatus = "SEM EVIDÊNCIA";

                                    const topicAccuracy =
                                      prog.question_count > 0
                                        ? `${Math.round((prog.correct_count / prog.question_count) * 100)}%`
                                        : "—";

                                    // Baralhos que cobrem o tema (casamento por
                                    // módulo — ver lib/subjectMatch.ts).
                                    const matchSub = flashcardTopics[item.subject.name.toLowerCase()];
                                    // Subassunto sem baralho próprio herda o do
                                    // ancestral mais próximo que tenha.
                                    const ancestrais = pathOf(db, topic.id)
                                      .slice(0, -1)
                                      .reverse()
                                      .map((a) => a.name);
                                    let matchedDecks = matchSub
                                      ? matchTopicDecks(topic.name, matchSub)
                                      : [];
                                    if (matchedDecks.length === 0 && matchSub) {
                                      for (const a of ancestrais) {
                                        const herdado = matchTopicDecks(a, matchSub);
                                        if (herdado.length > 0) {
                                          matchedDecks = herdado;
                                          break;
                                        }
                                      }
                                    }
                                    const deckDue = matchedDecks.reduce((a, d) => a + d.dueNow, 0);
                                    const deckCards = matchedDecks.reduce((a, d) => a + d.cardCount, 0);
                                    const entryDeck = pickEntryDeck(matchedDecks);

                                    return (
                                      <tr
                                        key={topic.id}
                                        className={`hover:bg-slate-50 ${
                                          topic.status === "suspended" ? "opacity-55" : ""
                                        }`}
                                      >
                                        <td className="p-3 font-medium text-slate-800">
                                          <span
                                            className="flex items-center gap-2 flex-wrap"
                                            style={{ paddingLeft: `${depth * 18}px` }}
                                          >
                                            {depth > 0 && (
                                              <span className="text-slate-300" aria-hidden="true">
                                                └
                                              </span>
                                            )}
                                            <span>{topic.name}</span>
                                            {!isLeaf(db, topic.id) && (
                                              <span
                                                title="Tem subassuntos: quem entra na rotação e no progresso são eles"
                                                className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded"
                                              >
                                                pasta
                                              </span>
                                            )}
                                            {topic.status === "suspended" && (
                                              <span
                                                title={topic.status_reason || "Pausado"}
                                                className="text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded"
                                              >
                                                pausado
                                                {topic.status_reason ? ` · ${topic.status_reason}` : ""}
                                              </span>
                                            )}
                                            {topic.origin === "user" && (
                                              <span className="text-[10px] font-bold uppercase tracking-wide bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">
                                                meu
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                        <td className="p-3">
                                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                            {incidenceText}
                                          </span>
                                        </td>
                                        <td className="p-3 text-xs font-medium">
                                          {renderPassageBadge(1, prog.layer_1_completed)}
                                          {renderPassageBadge(2, prog.layer_2_completed)}
                                          {renderPassageBadge(3, prog.layer_3_completed)}
                                          {renderPassageBadge(4, prog.layer_4_completed)}
                                        </td>
                                        <td className="p-3 text-right tabular-nums text-slate-600">
                                          {prog.question_count}
                                        </td>
                                        <td className="p-3 text-right tabular-nums font-bold text-slate-800">
                                          {topicAccuracy}
                                        </td>
                                        <td className="p-3">
                                          <span
                                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                                              topicStatus === "ATUAL"
                                                ? "bg-teal-700 text-white"
                                                : topicStatus === "CONCLUÍDO NA CAMADA"
                                                ? "bg-slate-200 text-slate-700"
                                                : topicStatus === "DIFICULDADE"
                                                ? "bg-amber-100 text-amber-800"
                                                : "bg-slate-100 text-slate-500"
                                            }`}
                                          >
                                            {topicStatus}
                                          </span>
                                        </td>
                                        <td className="p-3 text-center whitespace-nowrap">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setNovoCard({
                                                subject: item.subject.name,
                                                topic: fullName(db, topic.id),
                                              })
                                            }
                                            title="Criar um card neste assunto"
                                            className="mr-1.5 inline-flex items-center text-xs font-bold text-slate-500 hover:text-teal-700 border border-slate-200 hover:border-teal-200 px-1.5 py-1 rounded"
                                          >
                                            + card
                                          </button>
                                          {entryDeck ? (
                                            <Link
                                              href={`/study?topicId=${entryDeck.id}&disciplina=${encodeURIComponent(
                                                item.subject.name
                                              )}&assunto=${encodeURIComponent(topic.name)}`}
                                              title={`${deckCards} cards em ${matchedDecks.length} ${
                                                matchedDecks.length === 1 ? "baralho" : "baralhos"
                                              }`}
                                              className="inline-flex items-center space-x-1 text-xs font-bold text-teal-600 hover:text-teal-700 border border-teal-200 hover:bg-teal-50 px-2 py-1 rounded"
                                            >
                                              <Play className="w-3 h-3 fill-current" />
                                              <span>
                                                Estudar
                                                {deckDue > 0 ? ` (${deckDue})` : ""}
                                              </span>
                                            </Link>
                                          ) : (
                                            // Dois vazios diferentes: a disciplina
                                            // não tem baralho, ou tem e nenhum
                                            // módulo cobre este assunto.
                                            <span
                                              className="text-xs text-slate-400"
                                              title={
                                                matchSub
                                                  ? "Nenhum baralho cobre este assunto"
                                                  : "Esta disciplina ainda não tem baralho"
                                              }
                                            >
                                              {matchSub ? "sem cobertura" : "sem baralho"}
                                            </span>
                                          )}
                                          <AddTopicButton
                                            subjectId={item.subject.id}
                                            subjectName={item.subject.name}
                                            parentId={topic.id}
                                            parentName={topic.name}
                                            compact
                                          />
                                          <TopicActions topic={topic} />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE COMPACT CARDS */}
      <div className="md:hidden space-y-3">
        {filtered.map((item) => {
          const isExpanded = expandedSubjectId === item.subject.id;

          return (
            <div
              key={item.subject.id}
              onClick={() => setExpandedSubjectId(isExpanded ? null : item.subject.id)}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">{item.subject.name}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                      Peso: {item.emphasisLabel}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded text-xs font-bold ${
                    item.cycleStatus === "ATUAL" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.cycleStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-500 block uppercase">Camada</span>
                  <span className="font-bold text-slate-800">
                    C{currentLayer} · {item.completedCount}/{item.eligibleCount}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 block uppercase">Acertos</span>
                  <span className="font-bold text-slate-800">{item.accuracyText}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="pt-3 border-t border-slate-200 space-y-4 text-sm">
                  <div className="text-xs text-slate-600 bg-teal-50 p-2.5 rounded border border-teal-100 font-medium flex justify-between items-center">
                    <span>{item.discreteAlert}</span>
                    {flashcardTopics[item.subject.name.toLowerCase()] && (
                      <Link
                        href={`/review?subjectId=${encodeURIComponent(item.subject.name)}`}
                        className="text-xs font-bold text-amber-700 underline shrink-0 ml-2"
                      >
                        Revisar Cards
                      </Link>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Onde parou
                    </div>
                    <div className="font-medium text-slate-800">
                      {item.material?.name || "Nenhum"}{" "}
                      {item.material?.current_unit ? `· Aula ${item.material.current_unit}` : ""}{" "}
                      {item.material?.current_page ? `, Pág ${item.material.current_page}` : ""}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Assunto Atual
                    </div>
                    <div className="font-medium text-teal-800">{item.currentTopicName}</div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-bold text-slate-500 uppercase">
                      Assuntos ({item.subjectTopics.length})
                    </div>
                    {item.subjectTopics.map((t) => {
                      const p = getOrCreateTopicProgress(db, t.id);
                      return (
                        <div
                          key={t.id}
                          className="bg-slate-50 p-2.5 rounded border border-slate-100 flex justify-between items-center text-xs"
                        >
                          <span className="font-medium text-slate-800">{t.name}</span>
                          <span className="font-bold text-teal-700">
                            {p.layer_1_completed ? "C1 ✓" : "C1 ○"}{" "}
                            {p.layer_2_completed ? "C2 ✓" : "C2 ○"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {novoCard && (
        <AddCardModal
          subjectName={novoCard.subject}
          topicName={novoCard.topic}
          onClose={() => setNovoCard(null)}
        />
      )}
    </div>
  );
}
