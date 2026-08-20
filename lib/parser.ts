import fs from "fs";
import path from "path";

export interface ParsedCard {
  question: string;
  answer: string;
  bizu: string;
  source: string;
  tags: string[];
  cardType: string;
}

export interface ParsedTopic {
  subjectName: string;
  topicName: string;
  filePath: string;
  fileName: string;
  cards: ParsedCard[];
}

const BIZU_RE = /<hr>\s*<b>BIZU:\s*<\/b>\s*(.*?)\s*$/is;
const SOURCE_RE = /<i>Fonte:\s*(.*?)<\/i>/is;
const TAG_RE = /^\[([^\]]+)\]\s*/;
const Q_TAG_RE = /^\[Q\d+/i;

export function parseFile(filePath: string): ParsedCard[] {
  return parseContent(fs.readFileSync(filePath, "utf-8"));
}

/**
 * O mesmo parser, a partir de texto em vez de caminho de arquivo.
 *
 * Existe para que a importação pelo app e a importação por script usem
 * EXATAMENTE a mesma regra: um formato só, um lugar só para consertar.
 */
export function parseContent(content: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  const lines = content.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    const semicolonIdx = trimmed.indexOf(";");
    if (semicolonIdx === -1) continue;

    let rawQuestion = trimmed.slice(0, semicolonIdx).trim();
    let rawAnswer = trimmed.slice(semicolonIdx + 1).trim();

    if (!rawQuestion || !rawAnswer) continue;

    const tags: string[] = [];
    let cardType = "normal";

    const tagMatch = rawQuestion.match(TAG_RE);
    if (tagMatch) {
      const tag = tagMatch[1].trim();
      tags.push(tag);
      rawQuestion = rawQuestion.slice(tagMatch[0].length).trim();

      if (Q_TAG_RE.test(tagMatch[0])) {
        cardType = "questao";
      }
      if (/ULTRADECOREBA/i.test(tag)) {
        tags.push("ultradecoreba");
      }
      if (/MAPA/i.test(tag)) {
        tags.push("mapa");
      }
      if (/COMPARAÇÃO|COMPARACAO/i.test(tag)) {
        tags.push("comparacao");
      }
      if (/DECOREBA/i.test(tag)) {
        tags.push("decoreba");
      }
    }

    const sourceMatch = rawAnswer.match(SOURCE_RE);
    const source = sourceMatch ? sourceMatch[1].trim() : "";

    const bizuMatch = rawAnswer.match(BIZU_RE);
    const bizu = bizuMatch ? bizuMatch[1].trim() : "";

    let cleanAnswer = rawAnswer;
    if (bizuMatch) {
      cleanAnswer = cleanAnswer.slice(0, cleanAnswer.indexOf("<hr>")).trim();
    }

    cards.push({
      question: rawQuestion,
      answer: cleanAnswer,
      bizu,
      source,
      tags,
      cardType,
    });
  }

  return cards;
}

export function scanDirectory(basePath: string): ParsedTopic[] {
  const results: ParsedTopic[] = [];

  function walk(dir: string, depth: number = 0) {
    if (depth > 3) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const txtFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".txt"));
    const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules");

    const relativePath = path.relative(basePath, dir);
    const pathParts = relativePath.split(path.sep).filter(Boolean);

    const subjectName = pathParts[0] || "Sem Disciplina";
    // Module folder(s) between the discipline and the file (may be empty).
    const moduleParts = pathParts.slice(1);

    for (const file of txtFiles) {
      const filePath = path.join(dir, file.name);
      const cards = parseFile(filePath);
      if (cards.length > 0) {
        const fileName = file.name.replace(/\.txt$/i, "");
        // Each .txt file is its OWN topic (assunto). The module path is kept as a
        // prefix so topics stay grouped, ordered and unique within a subject.
        const topicName = [...moduleParts, fileName].join(" > ") || fileName;
        results.push({
          subjectName,
          topicName,
          filePath,
          fileName,
          cards,
        });
      }
    }

    for (const subdir of subdirs) {
      walk(path.join(dir, subdir.name), depth + 1);
    }
  }

  walk(basePath);
  return results;
}
