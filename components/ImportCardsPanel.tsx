"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import {
  importCards,
  previewImport,
  type ImportPreview,
  type ImportResult,
} from "@/lib/client/engine";

type Props = {
  subjectName: string;
  topicName: string;
  onDone: () => void;
};

/**
 * Lê um arquivo `.txt` no mesmo formato dos materiais originais e transforma em
 * cards. Sempre em dois tempos: primeiro a prévia (nada é gravado), depois a
 * confirmação — importar às cegas um arquivo de 500 linhas no baralho errado é
 * caro de desfazer.
 */
export default function ImportCardsPanel({ subjectName, topicName, onDone }: Props) {
  const [conteudo, setConteudo] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ImportPreview | null>(null);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [ocupado, setOcupado] = useState<"lendo" | "importando" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Lê como UTF-8 e, se vier lixo, tenta de novo como Windows-1252. */
  const lerTexto = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    // U+FFFD é o caractere de substituição: sinal de que a decodificação errou.
    // Arquivo .txt salvo pelo Bloco de Notas antigo costuma ser ANSI.
    if (!utf8.includes("�")) return utf8;
    return new TextDecoder("windows-1252").decode(buffer);
  }, []);

  const escolher = useCallback(
    async (file: File) => {
      setErro(null);
      setResultado(null);
      setPrevia(null);
      setOcupado("lendo");
      try {
        const texto = await lerTexto(file);
        setConteudo(texto);
        setNomeArquivo(file.name);
        setPrevia(await previewImport({ subjectName, topicName, content: texto }));
      } catch (err) {
        setErro(err instanceof Error ? err.message : String(err));
      } finally {
        setOcupado(null);
      }
    },
    [lerTexto, subjectName, topicName]
  );

  const confirmar = useCallback(async () => {
    setOcupado("importando");
    setErro(null);
    try {
      setResultado(await importCards({ subjectName, topicName, content: conteudo }));
      setPrevia(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(null);
    }
  }, [conteudo, subjectName, topicName]);

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={ocupado !== null}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          {ocupado === "lendo" ? (
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <FileUp className="w-4 h-4" />
          )}
          Escolher arquivo .txt
        </button>
        {nomeArquivo && (
          <span className="ml-3 text-xs text-slate-500">{nomeArquivo}</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void escolher(f);
            e.target.value = "";
          }}
        />
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-600">
          Formato aceito
        </summary>
        <div className="mt-2 space-y-1.5">
          <p>Uma linha por card, com ponto e vírgula separando pergunta e resposta:</p>
          <pre className="bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-[11px]">
{`O que é crase?;É a fusão da preposição A com o artigo A.
[DECOREBA] Quando NÃO usar crase?;Antes de palavra masculina, verbo e pronome.`}
          </pre>
          <p>
            É o mesmo formato dos seus materiais originais — <code>[TAG]</code> no início é
            opcional, e a resposta aceita <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>,{" "}
            <code>&lt;br&gt;</code>, <code>&lt;i&gt;Fonte: …&lt;/i&gt;</code> e{" "}
            <code>&lt;hr&gt;&lt;b&gt;BIZU:&lt;/b&gt;</code>.
          </p>
        </div>
      </details>

      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Ou cole o conteúdo aqui
        </span>
        <textarea
          value={conteudo}
          onChange={(e) => {
            setConteudo(e.target.value);
            setPrevia(null);
            setResultado(null);
          }}
          rows={5}
          placeholder="pergunta;resposta"
          className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-900 focus-visible:outline-none focus:ring-2 focus:ring-teal-600"
        />
      </label>

      {conteudo.trim() && !previa && !resultado && (
        <button
          type="button"
          onClick={async () => {
            setOcupado("lendo");
            setErro(null);
            try {
              setPrevia(await previewImport({ subjectName, topicName, content: conteudo }));
            } catch (err) {
              setErro(err instanceof Error ? err.message : String(err));
            } finally {
              setOcupado(null);
            }
          }}
          disabled={ocupado !== null}
          className="text-sm font-bold text-teal-700 hover:text-teal-800 disabled:opacity-50"
        >
          Ler e conferir →
        </button>
      )}

      {erro && (
        <p role="status" className="text-sm text-red-700">
          {erro}
        </p>
      )}

      {previa && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4 space-y-3">
          <p className="text-sm text-slate-800">
            <strong>{previa.aImportar} cards</strong> prontos para entrar em{" "}
            <strong>{previa.gaveta}</strong>.
            {previa.repetidosNoArquivo > 0 && (
              <span className="text-slate-600">
                {" "}
                {previa.repetidosNoArquivo} linha
                {previa.repetidosNoArquivo === 1 ? "" : "s"} repetida
                {previa.repetidosNoArquivo === 1 ? "" : "s"} no arquivo{" "}
                {previa.repetidosNoArquivo === 1 ? "foi ignorada" : "foram ignoradas"}.
              </span>
            )}
          </p>

          <div className="space-y-2">
            {previa.amostra.map((c, i) => (
              <div key={i} className="text-xs bg-white rounded border border-teal-100 p-2.5">
                <p
                  className="font-medium text-slate-900"
                  dangerouslySetInnerHTML={{ __html: c.question }}
                />
                <p
                  className="text-slate-600 mt-1"
                  dangerouslySetInnerHTML={{ __html: c.answer }}
                />
                {c.tags.length > 0 && (
                  <p className="text-[10px] text-teal-700 mt-1 font-bold uppercase">
                    {c.tags.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50"
            >
              {ocupado === "importando" && (
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
              )}
              Importar {previa.aImportar}
            </button>
            <button
              type="button"
              onClick={() => {
                setPrevia(null);
                setConteudo("");
                setNomeArquivo(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-sm text-slate-800">
            <strong>{resultado.importados} cards importados</strong> em {resultado.topicName}.
          </p>
          {resultado.jaExistiam > 0 && (
            <p className="text-xs text-slate-600">
              {resultado.jaExistiam} já existiam e foram mantidos como estavam — reimportar o
              mesmo arquivo não duplica nem apaga seu progresso.
            </p>
          )}
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-bold text-teal-700 hover:text-teal-800"
          >
            Concluir
          </button>
        </div>
      )}
    </div>
  );
}
