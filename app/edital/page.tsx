"use client";

import React, { useState } from "react";
import knowledgeTree from "@/lib/knowledge_tree.json";
import { ChevronDown, ChevronRight, BookOpen, Bookmark, List } from "lucide-react";

export default function Edital() {
  const [expandedDisciplinas, setExpandedDisciplinas] = useState<Record<string, boolean>>({});
  const [expandedMacrotemas, setExpandedMacrotemas] = useState<Record<string, boolean>>({});

  const toggleDisciplina = (nome: string) => {
    setExpandedDisciplinas(prev => ({ ...prev, [nome]: !prev[nome] }));
  };

  const toggleMacrotema = (key: string) => {
    setExpandedMacrotemas(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const newD: Record<string, boolean> = {};
    const newM: Record<string, boolean> = {};
    knowledgeTree.disciplinas.forEach(d => {
      newD[d.nome] = true;
      d.macrotemas.forEach(m => {
        newM[`${d.nome}-${m.nome}`] = true;
      });
    });
    setExpandedDisciplinas(newD);
    setExpandedMacrotemas(newM);
  };

  const collapseAll = () => {
    setExpandedDisciplinas({});
    setExpandedMacrotemas({});
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-teal-700" />
            Árvore de Conhecimento
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-2 max-w-xl">
            Navegue pela hierarquia do edital. Entenda claramente as disciplinas, macrotemas e assuntos que você precisa dominar, sem esforço cognitivo.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={expandAll}
            className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors"
          >
            Expandir Tudo
          </button>
          <button 
            onClick={collapseAll}
            className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors"
          >
            Recolher Tudo
          </button>
        </div>
      </div>

      {/* TREE LIST */}
      <div className="space-y-4">
        {knowledgeTree.disciplinas.map((disciplina) => {
          const isDExpanded = expandedDisciplinas[disciplina.nome];
          
          return (
            <div key={disciplina.nome} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all">
              {/* DISCIPLINA HEADER */}
              <button 
                onClick={() => toggleDisciplina(disciplina.nome)}
                className="w-full text-left px-5 py-4 flex items-center justify-between bg-slate-50 hover:bg-teal-50/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${isDExpanded ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                    <Bookmark className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{disciplina.nome}</h2>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {disciplina.macrotemas.length} Macrotemas
                    </span>
                  </div>
                </div>
                <div className="text-slate-400">
                  {isDExpanded ? <ChevronDown className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
                </div>
              </button>

              {/* MACROTEMAS */}
              {isDExpanded && (
                <div className="border-t border-slate-100 bg-white">
                  {disciplina.macrotemas.map((macrotema, mIdx) => {
                    const macroKey = `${disciplina.nome}-${macrotema.nome}`;
                    const isMExpanded = expandedMacrotemas[macroKey];
                    
                    return (
                      <div key={macroKey} className={`${mIdx !== disciplina.macrotemas.length - 1 ? 'border-b border-slate-100' : ''}`}>
                        <button 
                          onClick={() => toggleMacrotema(macroKey)}
                          className="w-full text-left px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {isMExpanded ? 
                              <ChevronDown className="w-4 h-4 text-teal-600" /> : 
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            }
                            <h3 className="font-semibold text-slate-800">{macrotema.nome}</h3>
                            <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                              {macrotema.assuntos.length} assuntos
                            </span>
                          </div>
                        </button>
                        
                        {/* ASSUNTOS */}
                        {isMExpanded && (
                          <div className="pl-14 pr-6 pb-4 pt-1 space-y-2">
                            {macrotema.assuntos.map((assunto, aIdx) => (
                              <div 
                                key={aIdx} 
                                className="flex items-start gap-3 bg-slate-50/50 p-2.5 rounded border border-slate-100"
                              >
                                <List className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <span className="text-sm font-medium text-slate-700">{assunto}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
