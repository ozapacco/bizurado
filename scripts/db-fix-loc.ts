import { loadLocalEnv } from "../lib/env";
loadLocalEnv();
import { execute, closePool } from "../lib/db";

async function main() {
  const newAnswer = `São conjuntos de palavras que equivalem a uma classe gramatical. Uma locução pode substituir uma palavra simples sem perder a função ou o sentido básico.<br><br><b>Exemplos Práticos:</b><br>- <i>Locução Adjetiva:</i> amor <b>de mãe</b> (equivale a materno)<br>- <i>Locução Adverbial:</i> saiu <b>às pressas</b> (equivale a apressadamente)<br>- <i>Locução Prepositiva:</i> <b>por causa de</b>, <b>apesar de</b><br><br><i>Fonte: Aula 01, Noções iniciais</i>`;
  
  await execute(`UPDATE cards SET answer = $1 WHERE question LIKE 'O que são <b>locuções</b> na análise das classes de palavras%'`, [newAnswer]);
  console.log("Card de locuções atualizado com sucesso no DB.");
}

main().catch(console.error).finally(() => closePool().then(() => process.exit(0)));
