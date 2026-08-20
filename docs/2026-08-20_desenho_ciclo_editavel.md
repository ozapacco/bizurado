# Desenho: ciclo editável — incluir, excluir e suspender assuntos

**Data**: 20 de agosto de 2026
**Status**: PROPOSTA — não implementado

---

## 1. O problema

Hoje os 122 assuntos do ciclo são **derivados** dos baralhos por `alignWithDecks`, que é aditivo e idempotente. Isso deu 100% de cobertura, mas cria um conflito assim que o usuário quiser mandar no próprio plano:

- **Excluir não gruda.** Apagar "Crimes contra o patrimônio" funciona até o próximo boot, quando o alinhamento recria a unidade que ele não encontrou. A derivação sempre vence a intenção.
- **Incluir sem baralho é órfão de segunda classe.** "Crase" não existe em nenhum baralho. Dá para criar à mão, mas nada distingue "assunto que o usuário quis" de "assunto que o alinhamento ainda não cobriu".
- **Suspender não existe.** Há `card_states.suspended` para cards, nada para assuntos do ciclo.
- **O banco não modela nada disso.** O ciclo é um `jsonb` numa linha; não há como perguntar "quais assuntos eu arquivei e por quê".

A raiz é uma só: **estado derivado e intenção do usuário estão misturados no mesmo lugar.** Todo o desenho abaixo é a separação dos dois.

---

## 2. Princípios

1. **O alinhamento propõe, o usuário dispõe.** Nenhuma decisão do usuário pode ser desfeita por uma rederivação.
2. **Nada que carregue progresso é apagado.** Um assunto tem camadas cumpridas, questões e acertos. Excluir sem mais é destruir histórico; a exclusão vira arquivamento.
3. **Toda decisão é um fato durável no banco**, não efeito colateral de um clique.
4. **Reconciliação explicável.** Seis meses depois, o sistema tem que saber responder "por que este assunto está aqui?" e "por que aquele sumiu?".
5. **Suspender não pode mentir na métrica.** Assunto fora de escopo sai do denominador do progresso — senão a camada trava em 60% para sempre.

---

## 3. Modelo

### 3.1 Ciclo de vida do assunto

Um campo `status` substitui o booleano `active` atual:

| status | significado |
|---|---|
| `active` | no ciclo, entra na rotação |
| `suspended` | fora de escopo agora, histórico preservado, volta com um clique |
| `archived` | removido da vista; é o que o usuário chama de "excluir" |

E **lápide implícita**: um assunto `archived` com `deck_unit_key` preenchido é exatamente o registro que impede o alinhamento de recriá-lo. Não é preciso tabela de lápides — o próprio assunto arquivado é a lápide.

Exclusão permanente (`DELETE` de verdade) existe, mas **só é permitida quando o assunto não tem progresso algum** — zero contatos, zero questões, nenhuma camada cumprida. Com progresso, a interface oferece arquivar e explica por quê.

### 3.2 Procedência

| origin | quem criou | alinhamento pode mexer? |
|---|---|---|
| `deck` | derivado de uma unidade de baralho | cria; nunca remove nem renomeia |
| `user` | criado à mão (ex.: Crase) | **nunca toca** |
| `edital` | derivado do edital consolidado (futuro) | cria; nunca remove |

`deck_unit_key` = a chave normalizada da unidade de origem (`normalize(moduleOf(nome))`). É o que liga o assunto aos baralhos **mesmo depois de renomeado** — renomear é uma decisão de rótulo, não a criação de outro assunto.

### 3.3 Matriz de comportamento

| | rotação do ciclo | plano do dia | flashcards na revisão | denominador da camada | histórico | cobertura |
|---|---|---|---|---|---|---|
| `active` | sim | sim | sim | conta | mantido | exigida |
| `suspended` | não | não | **não** | **não conta** | mantido | dispensada |
| `archived` | não | não | não | não conta | mantido, oculto | dispensada |

O ponto sutil é a coluna dos flashcards: suspender um assunto tem que **tirar os cards dele da fila de revisão**, senão a suspensão é decorativa. Isso é feito por **filtro na consulta**, não escrevendo `suspended = 1` em milhares de linhas de `card_states` — assim é instantâneo, reversível e não polui o estado FSRS.

---

## 4. Banco

### 4.1 Onde isso mora

O ciclo hoje é um documento `jsonb` em `cycle_state`. Duas opções:

**A. Projeção (recomendada).** O documento continua sendo a fonte da verdade e a rota `PUT /api/cycle-state` **explode os assuntos em tabelas relacionais na mesma transação**. O banco passa a ser consultável e evolutivo sem ganhar um segundo canal de sincronia.

**B. Tabelas autoritativas.** Os assuntos passam a viver só em tabelas, lidas ao vivo. Mais canônico — e introduz um terceiro canal de sincronia bidirecional, que é exatamente a classe de complexidade que gerou os bugs corrigidos em 20/08.

Recomendo **A**. Ela entrega o que foi pedido ("o banco corresponder a isso para sempre poder evoluir") sem pagar o preço de B. Migrar de A para B depois é possível e barato; o contrário não.

### 4.2 Esquema

```sql
CREATE TABLE cycle_topics (
  id             text PRIMARY KEY,          -- estável; nunca reusado
  subject_name   text NOT NULL,             -- vocabulário canônico dos baralhos
  name           text NOT NULL,
  origin         text NOT NULL,             -- 'deck' | 'user' | 'edital'
  deck_unit_key  text,                      -- NULL quando origin='user'
  status         text NOT NULL DEFAULT 'active',  -- active|suspended|archived
  status_reason  text,                      -- "foco PF até março"
  resume_at      text,                      -- opcional: volta sozinho nesta data
  importance     text NOT NULL DEFAULT 'SECONDARY',
  position       integer NOT NULL DEFAULT 0,
  created_at     text NOT NULL,
  updated_at     text NOT NULL
);

-- Uma unidade de baralho pertence a no máximo um assunto: é o que impede
-- duplicata quando o alinhamento roda de novo.
CREATE UNIQUE INDEX idx_cycle_topics_unit
  ON cycle_topics (subject_name, deck_unit_key)
  WHERE deck_unit_key IS NOT NULL;

CREATE INDEX idx_cycle_topics_status ON cycle_topics (status);

CREATE TABLE cycle_topic_progress (
  topic_id          text PRIMARY KEY REFERENCES cycle_topics(id) ON DELETE CASCADE,
  contact_count     integer NOT NULL DEFAULT 0,
  first_seen_at     text,
  last_seen_at      text,
  layer_1_completed boolean NOT NULL DEFAULT false,
  layer_2_completed boolean NOT NULL DEFAULT false,
  layer_3_completed boolean NOT NULL DEFAULT false,
  layer_4_completed boolean NOT NULL DEFAULT false,
  question_count    integer NOT NULL DEFAULT 0,
  correct_count     integer NOT NULL DEFAULT 0,
  difficulty_flag   text NOT NULL DEFAULT 'NONE'
);

-- Append-only: a memória das decisões. É o `review_log` do ciclo.
CREATE TABLE cycle_topic_events (
  id          integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  topic_id    text NOT NULL,
  action      text NOT NULL,   -- created|renamed|suspended|resumed|archived|restored|deleted|adopted
  from_status text,
  to_status   text,
  actor       text NOT NULL,   -- 'user' | 'align'
  note        text,
  at          text NOT NULL
);
CREATE INDEX idx_cycle_topic_events_topic ON cycle_topic_events (topic_id, id);
```

O log de eventos é a peça que faz o "sempre poder evoluir" ser real: sem ele, daqui a seis meses não há como distinguir "eu arquivei isso" de "sumiu por um bug", que é exatamente o tipo de dúvida que consumiu o dia 20/08.

---

## 5. O contrato do alinhamento

`alignWithDecks` passa a obedecer esta tabela, e nada além dela:

| situação da unidade do baralho | ação |
|---|---|
| já existe assunto com esse `deck_unit_key` (qualquer status) | **não toca** |
| existe assunto `archived` com esse `deck_unit_key` | **não recria** — a lápide vale |
| não existe assunto, nem lápide | cria `active`, `origin='deck'`, registra evento `created` por `align` |
| existe assunto `origin='user'` cujo nome casa a unidade | **adota**: preenche `deck_unit_key`, evento `adopted`. Não cria duplicata |
| assunto `origin='deck'` cuja unidade sumiu do baralho | mantém, marca `orphaned_deck` no relatório. Nunca apaga sozinho |

A regra de adoção resolve o caso concreto do pedido: o usuário cria "Crase" à mão hoje; se amanhã aparecer um baralho de Crase, o assunto dele **ganha os cards** em vez de virar um duplicado ao lado.

---

## 6. Consequência que é fácil não enxergar

`npm run cobertura -- --ci` hoje falha se **qualquer** card ficar inalcançável. Arquivar "Crimes contra o patrimônio" torna 962 cards inalcançáveis — por decisão, não por defeito. O portão passaria a acusar erro numa escolha legítima.

O relatório precisa de três categorias, não duas:

| categoria | significado | quebra o `--ci`? |
|---|---|---|
| **alcançável** | algum assunto ativo entrega estes cards | — |
| **dispensado** | os cards pertencem a assunto suspenso ou arquivado | não |
| **órfão** | nenhum assunto cobre, e ninguém decidiu isso | **sim** |

Só a terceira é defeito. Sem essa distinção, o portão vira ruído e alguém acaba desligando ele — que é a pior das saídas.

---

## 7. Interface

Tudo acontece em `/disciplinas`, que já lista assunto por assunto dentro de cada disciplina.

**Por linha**, um menu: Renomear · Suspender · Arquivar · Excluir (só quando não há progresso).

**Suspender** abre um campo curto opcional de motivo ("foco PF") e uma data opcional de retorno. A linha continua visível, apagada, com o motivo ao lado — suspenso e escondido seria a receita para esquecer que suspendeu.

**Por disciplina**, um botão "Adicionar assunto" → cria `origin='user'`, entra ativo, aparece com "sem baralho" até que um baralho o adote.

**Ao final da lista**, uma seção recolhida: "3 assuntos arquivados — mostrar", cada um com "Restaurar".

**No topo**, o contador honesto: "122 assuntos · 118 ativos · 3 suspensos · 1 arquivado".

Um filtro **"Foco"** por objetivo (PF / PCSC / PP RS) fica como *lente*, não como estado: ele esconde da vista o que não cai no objetivo escolhido, sem gravar nada. Suspensão é decisão durável; foco é jeito de olhar. Misturar os dois — status por objetivo — multiplicaria o modelo por três sem ganho real, e é o tipo de complexidade que depois ninguém consegue depurar.

---

## 8. Casos de borda já resolvidos pelo desenho

| caso | o que acontece |
|---|---|
| renomear assunto derivado | `deck_unit_key` permanece; continua entregando os mesmos cards; alinhamento não recria pelo nome antigo |
| baralho ganha módulo novo | alinhamento cria assunto novo, ativo |
| módulo some do baralho | assunto fica, marcado `orphaned_deck` no relatório |
| usuário cria assunto que depois vira baralho | adotado, com evento `adopted` |
| dois assuntos disputando a mesma unidade | impedido pelo índice único |
| excluir assunto com progresso | recusado; oferece arquivar, explicando o que seria perdido |
| suspender e reinstalar o navegador | `status` está no documento e na projeção do banco; volta com a hidratação |
| suspender com `resume_at` vencido | ao carregar, volta para `active` sozinho e registra evento `resumed` |

---

## 9. Migração

O estado atual (122 assuntos, todos derivados, todos ativos) migra sem perda:

1. Backfill de `origin='deck'` e `deck_unit_key` re-derivando as unidades — determinístico, já validado pelo relatório de cobertura.
2. `status='active'` para todos.
3. Um evento `created` por assunto, `actor='align'`, com o timestamp do documento.
4. `active: boolean` some do tipo `Topic`; os quatro pontos que hoje leem `t.active` (`cycle.ts:22`, `layerEngine.ts:34` e `:138`, `progresso/page.tsx:23`) passam a ler `status === 'active'`.

Passo 4 é o de maior risco: são os quatro lugares que decidem rotação, progresso de camada e o que aparece na tela. Um deles esquecido = assunto suspenso continuando a contar. Merece teste antes de mexer.

---

## 10. Ordem sugerida

1. Esquema + projeção na rota `PUT` (sem interface ainda) — o banco passa a corresponder ao documento.
2. `status` substituindo `active`, com os quatro consumidores migrados.
3. Contrato novo do alinhamento + lápides.
4. Relatório de cobertura com as três categorias.
5. Interface: suspender/reativar e arquivar/restaurar.
6. Interface: adicionar e renomear, com a regra de adoção.
7. Exclusão permanente, só sem progresso.

Os passos 1–4 são invisíveis e independentes: dá para pará-los em qualquer ponto sem deixar o sistema inconsistente. Os passos 5–7 são o que o usuário efetivamente pediu, e cada um entrega valor sozinho.
