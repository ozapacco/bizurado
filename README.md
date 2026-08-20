# Bizurado

Sistema de estudos (flashcards + ciclos de revisão FSRS) em **Next.js 14 (App Router)** com banco **Postgres (Neon)**, hospedado na **Vercel**.

---

## ⚠️ Antes de mexer — acessos obrigatórios

Sem estes 3 acessos **não dá pra avançar**:

| Recurso | Onde | Observação |
|---|---|---|
| Hospedagem | https://vercel.com/matheus-de-castros-projects/bizurado | — |
| Banco de dados | Neon, host `ep-twilight-bar-ac49tfsr-pooler.sa-east-1.aws.neon.tech` (região `sa-east-1`) | é o host que está no `.env.local` |
| Código | https://github.com/ozapacco/bizurado | remotes `origin` e `ozapacco` apontam para **este mesmo** repositório |

> O README apontava para `matheusexperienceex-dotcom/bizurado` e mandava usar
> aquela conta. Estava defasado: os commits vão para `ozapacco/bizurado` desde
> a migração para local-first. Corrigido em 20/08/2026.

---

## Parâmetros (variáveis de ambiente)

O app usa **apenas 2** variáveis de ambiente (confirmado em `lib/db.ts` e `middleware.ts`):

| Variável | Obrigatória? | O que é | Onde configurar |
|---|---|---|---|
| `DATABASE_URL` | **Sim** | Connection string do Postgres da Neon. Use o host **`-pooler`** (serverless). O app remove `channel_binding` automaticamente, então pode colar a string completa da Neon. | Vercel → Settings → Environment Variables **e** `.env.local` (local) |
| `APP_PASSWORD` | Não (recomendada em prod) | Senha única do app. É o portão (HTTP Basic Auth no `middleware.ts`). Se **não** definida, o portão fica **desligado** (útil em dev local). | Vercel → Environment Variables **e** `.env.local` |

Modelo: ver [.env.example](.env.example).

---

## Rodar localmente

```bash
npm install
# crie .env.local com DATABASE_URL (e opcionalmente APP_PASSWORD)
npm run dev          # http://localhost:3000
```

Scripts úteis:

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint (config em `.eslintrc.json`) |
| `npm run reset` | **Destrutivo.** Zera todo o progresso (revisões, estados FSRS, voltas, ciclo) preservando o conteúdo. Exige `-- --confirmo`. Faça backup antes. |
| `npm run cobertura` | Mede o encaixe ciclo ↔ baralhos nas duas direções: quantos assuntos do ciclo alcançam cards e quantos cards são alcançáveis pelo ciclo. `-- --ci` sai com erro se algum card ficar inalcançável. |
| `npm run db:init` | **Aplica o schema** no banco apontado por `DATABASE_URL` (idempotente — `scripts/db-init.ts`). Roda manualmente, nunca a cada request. |
| `npm run seed` | Importa os `.txt` das disciplinas para o Postgres (`lib/seed.ts`) |
| `npm run content:sync` | `seed` + `export:static`: roda **só quando o conteúdo dos cards muda**. O `build` não faz mais isso — deploy não escreve no banco. |

---

## Deploy na Vercel — checklist

1. Projeto importado do GitHub `matheusexperienceex-dotcom/bizurado` (branch `main`). A Vercel detecta Next.js automaticamente (não precisa de `vercel.json`).
2. **Settings → Environment Variables**: definir `DATABASE_URL` (e `APP_PASSWORD`) para **Production, Preview e Development**.
3. **Redeploy** após qualquer mudança de env var — variáveis novas **não** se aplicam a deploys já existentes.

---

## Como o banco é acessado (arquitetura)

- Driver: `@neondatabase/serverless` (`lib/db.ts`).
- Queries simples (`query`/`queryOne`/`execute`) vão por **HTTP fetch** (`poolQueryViaFetch`). Transações (`tx`) usam **WebSocket** (`ws`).
- `next.config.mjs` mantém `@neondatabase/serverless` e `ws` **fora** do bundle do webpack (`serverComponentsExternalPackages`) — não remover, senão a mascara de frame do `ws` quebra.
- A superfície de servidor é pequena de propósito — **4 rotas**, todas de sincronia: `sync/up`, `sync/down`, `cycle-state`, `cycle-state/snapshots`. Todas são `dynamic = "force-dynamic"` → falam com o banco **ao vivo** (o build **não** acessa o banco). O resto do app lê de `public/data` + IndexedDB.
- As rotas da geração pré-local-first (`/api/plan`, `/api/stats`, `/api/study`, `/api/review`, …) e a página `/plan` foram removidas — ninguém as chamava.
- Schema: `lib/schema.ts` (Postgres). Timestamps comparados ficam como texto ISO-8601 'Z'; busca usa `pg_trgm` + `unaccent` (substitui o FTS5 do SQLite).

---

## Backup: onde cada progresso mora

São dois tipos de progresso, com caminhos diferentes até o Neon:

| Progresso | Fonte da verdade | Backup | Como restaurar |
|---|---|---|---|
| Revisões de flashcards (FSRS) | IndexedDB (`bizurado`) | Fila em `queue` → `POST /api/sync/up` a cada 60s, ao focar a aba e ao voltar a ficar online | Configurações → "Puxar flashcards da nuvem" (`/api/sync/down`) |
| Ciclo de estudos (plano, camadas, metas, materiais) | `localStorage` (`study_cycle_db`) | Documento inteiro → `PUT /api/cycle-state`, 2s depois de cada alteração | Configurações → "Versões na nuvem" ou "Restaurar de arquivo" |

Garantias do lado do ciclo (`lib/preparation/sync.ts` + `app/api/cycle-state`):

- **Toda escrita empilha a versão anterior** em `cycle_snapshots` (últimas 200). Sobrescrita errada continua recuperável.
- **Concorrência otimista** por `revision`: se outro dispositivo gravou antes, a rota responde 409; o cliente reenvia com `force` e a versão da nuvem fica no histórico.
- **Navegador novo nunca sobrepõe a nuvem**: enquanto o estado local for o seed de fábrica (`meta.seeded`), a nuvem sempre vence.
- **Ações destrutivas guardam antes**: reset, import e restauração estacionam a cópia atual em `cycle_snapshots` primeiro.

Proteções adicionais na fila de flashcards:

- **Lotes de 100.** A fila inteira num POST só era uma bomba-relógio: quanto mais progresso represado, mais garantido o estouro do limite de tempo da função — e aí toda tentativa futura falhava igual. Cada lote que confirma sai da fila, então o progresso é monotônico.
- **Idempotência por `(card_id, review_date)`.** Reenviar um lote cuja resposta se perdeu não duplica mais. (Foi esse mecanismo que gerou 48 linhas duplicadas em `review_log` em julho/2026.)
- **Mutex de envio.** `visibilitychange` + `online` + intervalo + botão manual podiam disparar quase juntos e subir o mesmo lote duas vezes.
- **Sem veneno na fila.** Um `cardId` que não existe mais violava a FK e derrubava a transação inteira, travando o backup para sempre. Agora ids desconhecidos são ignorados e o resto passa.
- **Escrita atômica.** `states`, `log` e `queue` entram na mesma transação IndexedDB: fechar a aba no meio não deixa mais uma revisão registrada e não enfileirada.
- **Nuvem antes do seed estático.** Um dispositivo novo busca `/api/sync/down` primeiro; `progress-seed.json` é só o plano B offline. Antes ele começava semanas atrasado e subia agendamentos velhos por cima dos atuais.

`syncWithNeon()` apaga da fila **apenas as chaves que enviou** (`getAllWithKeys` + `deleteKeys`) — um `clearStore` descartaria em silêncio as revisões feitas durante o POST.

O estado dos dois canais fica visível no `SyncManager` (barra lateral no desktop, aviso no topo do conteúdo no mobile). Falha de rede não é engolida: aparece como "Backup pendente" e a fila é preservada.

## Ciclo editável: criar, pausar, excluir e aninhar assuntos

Os assuntos do ciclo são **derivados** dos baralhos por `alignWithDecks`. Isso
cria um conflito com a vontade do usuário, e todo o desenho existe para
resolvê-lo: **o alinhamento propõe, o usuário dispõe.**

| ação | o que acontece | por quê |
|---|---|---|
| **Pausar** (`status: 'suspended'`) | sai da rotação, sai do denominador da camada, some da fila de revisão. Continua visível, apagado. | esconder o que foi pausado é receita para esquecer que pausou |
| **Excluir** | apaga a linha e grava uma **lápide** em `topicTombstones` | sem a lápide, apagar só limpa o caminho para o alinhamento recriar o assunto no próximo boot |
| **Criar** (`origin: 'user'`) | nasce ativo, sem baralho | é o caminho para temas do edital sem card — "Crase" é o caso concreto |
| **Aninhar** (`parent_id`) | profundidade livre | — |

**Só folha conta.** Um assunto que ganha filho vira pasta: sai da rotação e do
progresso, e quem trabalha são os filhos. Sem essa regra o mesmo estudo
contaria duas vezes e a camada nunca fecharia. Um filho sem baralho próprio
herda o do ancestral mais próximo que tenha. Excluir pai leva o galho inteiro;
pausar pai tira o galho de escopo.

A exclusão dos cards da fila de revisão é feita por **filtro na consulta**
(`suspendedDeckIds()`), não escrevendo `suspended` em milhares de linhas de
`card_states`: pausar e reativar é instantâneo e não toca no estado FSRS. O
filtro é aplicado nos **dois** caminhos de `loadReviewCards` — o de cards com
estado e o de cards novos, que não passa por `states`.

## Cards criados dentro do app

Cada assunto ganha uma gaveta sob demanda: `<caminho do assunto> > Meus cards`.
O nome faz o casamento por módulo agrupá-la junto dos baralhos oficiais daquele
assunto, sem nenhuma regra especial. Cards do app têm `cards.source = 'app'` —
é o que os distingue dos importados por `npm run seed`.

Duas portas, um formato:

- **Escrever um** — formulário, `POST /api/cards`.
- **Importar `.txt`** — `POST /api/cards/import`, que usa `parseContent` (o
  mesmo parser de `npm run seed`, extraído de `parseFile`). Sempre em dois
  tempos: `dryRun` mostra a prévia sem gravar, depois a confirmação importa.
  Reimportar o mesmo arquivo não duplica nem apaga progresso. Lê UTF-8 e cai
  para Windows-1252 quando os acentos vêm quebrados.

Os 575 baralhos importados continuam vindo de `public/data/decks` (arquivo
estático); os do app vivem no IndexedDB (`userCards`/`userTopics`, v2) e são
mesclados em `getIndex`, `loadDeck` e `fetchDeck`. `pullUserCards()` traz os
que foram criados em outro dispositivo.

## Ponte entre o ciclo e os baralhos

`lib/subjectMatch.ts` traduz o vocabulário do ciclo ("Processo Penal" › "Controle Administrativo") para o dos baralhos ("Direito Processual Penal" › "6. Controle da Administração Pública > 1.1 …"):

- **Disciplina**: por apelido + normalização (sem acento, sem numeração), não por igualdade exata.
- **Assunto**: casamento no nível do **módulo** (o que vem antes de `>`), nunca da aula — comparar com o nome da aula gera falso positivo fácil, e mandar o usuário para o baralho errado custa mais caro que não oferecer baralho.
- Sem módulo à altura, a interface diz "nenhum baralho cobre este assunto" em vez de esconder o bloco.

## Diagnóstico: "está na Vercel mas não puxa do banco"

Verificado em 2026-06-22:

- ✅ O banco Neon **está íntegro e acessível**: schema aplicado + dados (8 disciplinas, 575 tópicos, **44.908 cards**).
- ✅ O código está correto (caminho HTTP fetch, rotas `force-dynamic`, build não depende do banco).
- ❗ **Causa provável:** `DATABASE_URL` **ausente ou não aplicada** nas Environment Variables da Vercel (ou o deploy em produção é anterior à criação da variável). Sem `DATABASE_URL` em runtime, `getPool()` lança erro → **toda** rota `/api/*` retorna 500 → a tela não mostra dados.

**Correção (na conta correta da Vercel):**
1. Vercel → projeto `bizurado` → **Settings → Environment Variables**.
2. Adicionar/conferir `DATABASE_URL` = a connection string **`-pooler`** da Neon (a mesma do `.env.local`), marcada para **Production, Preview e Development**.
3. (Recomendado) Adicionar `APP_PASSWORD`.
4. **Redeploy** (Deployments → Redeploy no último, ou novo push).
5. Validar abrindo `…/api/cycle-state` no navegador — deve retornar JSON com `revision` e `data`.
   (A rota `/api/stats` citada aqui até 08/2026 não existe mais: as estatísticas
   passaram a ser calculadas no navegador quando o app virou local-first.)

---

## Notas soltas

Skills usadas por frente de trabalho:

| Frente | Skill |
|---|---|
| Sistemas e dashboards | Impeccable |
| Landing pages e sites impactantes | Taste Skill |
| Pesquisa e criação do design system | UI UX Pro Max |
| Código de produção | Frontend UI Engineering |