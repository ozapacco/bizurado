import fs from "fs";
import path from "path";
import { loadLocalEnv } from "../lib/env";
loadLocalEnv();
import { query, execute, closePool } from "../lib/db";

const MATERIALS_DIR = path.join(process.cwd());

function walk(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === ".next" || file.startsWith(".")) continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath, fileList);
    } else if (filePath.endsWith(".txt")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function fixString(l: string) {
  if (!l) return l;
  let text = l;

  // Fix Font Color
  text = text.replace(/font color=#([0-9a-fA-F]{6})(.*?)font/g, '<font color="#$1">$2</font>');

  // Fix Fonte and BIZU
  text = text.replace(/brbriFonte (.*?)ihrbBIZUb/g, '<br><br><i>Fonte: $1</i><hr><b>BIZU:</b>');
  
  // Alternative without BIZU
  text = text.replace(/brbriFonte (.*?)i/g, '<br><br><i>Fonte: $1</i>');

  // Fix bold tags
  // We look for bWordb or bMultiple wordsb
  text = text.replace(/\bb([A-Za-zÀ-ÿ0-9 \-]+)b\b/g, (match, inner) => {
    // Avoid legitimate words like "bob" or "web" if any (though web doesn't start with b)
    if (inner.toLowerCase() === "o") return "bob";
    return `<b>${inner}</b>`;
  });

  return text;
}

async function fixFiles() {
  const txtFiles = walk(MATERIALS_DIR);
  let filesChanged = 0;

  for (const file of txtFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const fixedContent = content.split("\n").map(line => {
      // split by semicolon to avoid messing up the format
      const parts = line.split(";");
      return parts.map(p => fixString(p)).join(";");
    }).join("\n");

    if (content !== fixedContent) {
      fs.writeFileSync(file, fixedContent, "utf-8");
      filesChanged++;
    }
  }
  console.log(`Foram corrigidos ${filesChanged} arquivos de texto locais.`);
}

async function fixDatabase() {
  const cards = await query<{ id: number, question: string, answer: string, bizu: string, source: string }>(
    `SELECT id, question, answer, bizu, source FROM cards`
  );

  let dbChanged = 0;

  for (const card of cards) {
    const newQ = fixString(card.question || "");
    const newA = fixString(card.answer || "");
    const newB = fixString(card.bizu || "");
    const newS = fixString(card.source || "");

    if (newQ !== card.question || newA !== card.answer || newB !== card.bizu || newS !== card.source) {
      await execute(`UPDATE cards SET question = $1, answer = $2, bizu = $3, source = $4 WHERE id = $5`, 
        [newQ, newA, newB, newS, card.id]
      );
      dbChanged++;
    }
  }
  console.log(`Foram corrigidos ${dbChanged} cards no banco de dados Neon.`);
}

async function main() {
  console.log("Iniciando correção em massa de sintaxe (Arquivos e Banco)...");
  await fixFiles();
  await fixDatabase();
}

main().catch(console.error).finally(() => closePool().then(() => process.exit(0)));
