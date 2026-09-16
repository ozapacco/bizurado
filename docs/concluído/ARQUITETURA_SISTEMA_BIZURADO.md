# 🗺️ Arquitetura & Fonte de Conhecimento — Bizurado

> **Criado em:** 2026-09-16
> **Status:** ✅ Documento de referência principal — atualizar sempre que mudar infra ou lógica core

---

## ✅ Checklist de Acessos Obrigatórios

| # | Recurso | Conta / URL | Observação |
|---|---------|-------------|-----------|
| 1 | **Código (GitHub)** | https://github.com/ozapacco/bizurado | Conta: `ozapacco`. Branch principal: `main` |
| 2 | **Deploy (Vercel)** | https://vercel.com/matheus-de-castros-projects/bizurado | Conta Vercel: `matheus-de-castros-projects` (é o ozapacco) |
| 3 | **Banco de dados (Neon)** | Projeto `twilight-bar` — conta **ozapacco** | Região: `sa-east-1` (São Paulo) |

> ⚠️ IMPORTANTE: Os 3 serviços estão todos na conta ozapacco. GitHub + Vercel + Neon.

---

## 🗄️ Banco de Dados — Neon (PostgreSQL)

### Conexão ativa (produção)
```
Host:     ep-twilight-bar-ac49tfsr-pooler.sa-east-1.aws.neon.tech
Banco:    neondb
Usuário:  neondb_owner
Região:   sa-east-1 (São Paulo)
Driver:   @neondatabase/serverless
```

A string completa fica no `.env.local` (nunca sobe ao GitHub — está no `.gitignore`).
Na Vercel: Settings → Environment Variables → `DATABASE_URL`.

### Histórico de projetos Neon
| Projeto | Status | Host |
|---------|--------|------|
| `twilight-bar` | ✅ ATIVO (produção) | ep-twilight-bar-ac49tfsr-pooler.sa-east-1.aws.neon.tech |
| `wild-breeze` | ⛔ Obsoleto | ep-wild-breeze-acd10lca-pooler.sa-east-1.aws.neon.tech |

### Tabelas no banco
| Tabela | O que armazena |
|--------|---------------|
| `subjects` | Disciplinas (ex: Direito Penal) |
| `topics` | Tópicos/aulas dentro de cada disciplina |
| `cards` | Flashcards (pergunta, resposta, bizu, tags) |
| `card_states` | Estado FSRS de cada card (due, stability, reps...) |
| `review_log` | Histórico de revisões (append-only) |
| `topic_study` | Estado de ciclo por tópico (due, interval, priority) |
| `topic_sessions` | Sessões de estudo registradas |
| `daily_plan` | Plano diário de estudos |
| `daily_budget` | Budget de minutos por dia |
| `cycle_state` | 1 linha só — snapshot atual do Ciclo de Estudos (JSONB) |
| `cycle_snapshots` | Histórico append-only do ciclo (últimas 200 versões) |

### Volume de dados (medido em 2026-06-22)
- 8 disciplinas · 575 tópicos · **44.908 cards**

---

## 🔧 Variáveis de Ambiente

| Variável | Obrigatória? | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | **SIM** | Connection string Neon host `-pooler`. O app remove `channel_binding` automaticamente. |
| `APP_PASSWORD` | Recomendada em prod | Senha única (HTTP Basic Auth). Se ausente, portão desligado. |

Configurar em:
- **Local:** `.env.local` (nunca comitar)
- **Produção:** Vercel → Settings → Environment Variables → marcar Production + Preview + Development

> ⚠️ Após mudar env vars na Vercel: fazer Redeploy — variáveis novas não se aplicam a deploys existentes.

---

## 🏗️ Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    USUÁRIO (browser)                 │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐   │
│  │  IndexedDB       │    │  localStorage         │   │
│  │  "bizurado"      │    │  "study_cycle_db"     │   │
│  │  (flashcards)    │    │  (ciclo de estudos)   │   │
│  └────────┬─────────┘    └──────────┬───────────┘   │
└───────────┼──────────────────────────┼───────────────┘
            │ sync (60s/foco/online)   │ sync (2s após edição)
            ▼                          ▼
┌─────────────────────────────────────────────────────┐
│            VERCEL — Next.js 14 App Router            │
│  GitHub: ozapacco/bizurado  |  branch: main          │
│                                                     │
│  API Routes (force-dynamic):                        │
│  POST /api/sync/up      ← envia reviews             │
│  GET  /api/sync/down    → baixa estados FSRS        │
│  PUT  /api/cycle-state  ← ciclo completo            │
│  GET  /api/cycle-state  → ciclo atual               │
│  GET  /api/cycle-state/snapshots → histórico        │
│  POST /api/cards        ← novo card manual          │
│  POST /api/cards/import ← importar .txt             │
│                                                     │
│  Conteúdo estático: public/data/decks/ (575 decks)  │
└─────────────────────┬───────────────────────────────┘
                      │ @neondatabase/serverless
                      ▼
┌─────────────────────────────────────────────────────┐
│        NEON — PostgreSQL Serverless                  │
│        Projeto: twilight-bar  |  Conta: ozapacco     │
│        Região: sa-east-1 (São Paulo)                 │
└─────────────────────────────────────────────────────┘
```

---

## 📦 Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS + tailwind-merge + clsx |
| Banco | PostgreSQL via Neon Serverless |
| Driver DB | @neondatabase/serverless (HTTP fetch + WebSocket/ws) |
| Algoritmo revisão | FSRS-4.5 (lib/fsrs.ts) |
| Algoritmo ciclo | Expanding window com ceiling por prioridade (lib/cycle.ts) |
| Charts | Recharts |
| Ícones | Lucide React |
| Datas | date-fns |
| Auth | HTTP Basic Auth via middleware.ts |
| Deploy | Vercel (auto-deploy branch main) |

---

## 🧠 Lógica Core

### 1. Arquitetura Local-First
O app é local-first: toda interação do usuário acontece no browser.
O servidor existe apenas para backup/sincronização.

Fontes de verdade:
- **Flashcards (FSRS):** IndexedDB `bizurado`
- **Ciclo de estudos:** localStorage `study_cycle_db`

### 2. Flashcards — FSRS-4.5
- 17 parâmetros oficiais (não alterar sem evidência)
- Ratings: Again(1), Hard(2), Good(3), Easy(4)
- Estados: new → learning → review ↔ relearning
- Learning steps: [1 min, 10 min]
- Relearning steps: [10 min]
- Request retention: 90%
- Max interval: 36.500 dias

### 3. Ciclo de Estudos — Expanding Window
Revisão espaçada por tópico com ceiling de intervalo por prioridade:

| Prioridade | Intervalo máximo |
|-----------|-----------------|
| 5 (máxima) | 21 dias |
| 4 | 35 dias |
| 3 | 60 dias |
| 2 | 90 dias |
| 1 (mínima) | 120 dias |

Progressão de intervalo: 1→1, 2→3, 3→7, >=4→intervalo×2.5
- Só folhas contam (pasta vira container)
- Lápides (topicTombstones) evitam que exclusões sejam revertidas

### 4. Sincronização

**Flashcards (IndexedDB → Neon):**
- Lotes de 100 → POST /api/sync/up a cada 60s / foco / online
- Idempotência por (card_id, review_date)
- Mutex de envio (sem lotes duplicados)
- Banco novo: busca /api/sync/down primeiro

**Ciclo (localStorage → Neon):**
- Snapshot completo → PUT /api/cycle-state, 2s após cada edição
- Concorrência otimista por revision (409 se conflito)
- Histórico: últimas 200 versões em cycle_snapshots
- Navegador novo nunca sobrepõe nuvem se meta.seeded=true

---

## 📁 Arquivos Relevantes

```
bizurado/
├── app/
│   ├── page.tsx                # Home
│   ├── api/
│   │   ├── sync/               # up (POST) / down (GET)
│   │   ├── cycle-state/        # GET + PUT + /snapshots
│   │   └── cards/              # POST (manual) + /import
│   ├── ciclo/                  # Tela ciclo de estudos
│   ├── estudar/                # Sessão de flashcards
│   └── configuracoes/          # Settings + backup/restore
├── lib/
│   ├── db.ts                   # Pool Neon + query/execute/tx
│   ├── schema.ts               # DDL completo (idempotente)
│   ├── fsrs.ts                 # Algoritmo FSRS-4.5
│   ├── cycle.ts                # Lógica pura do ciclo (sem I/O)
│   ├── seed.ts                 # Importa .txt → banco
│   ├── parser.ts               # Parser de arquivos .txt
│   ├── subjectMatch.ts         # Traduz ciclo ↔ baralhos
│   ├── client/
│   │   ├── engine.ts           # Engine cliente (IndexedDB + lógica)
│   │   ├── idb.ts              # Abstração IndexedDB
│   │   └── syncStatus.ts       # Status de sync na UI
│   └── preparation/
│       ├── db.ts               # Banco do ciclo (localStorage)
│       ├── sync.ts             # Sync ciclo ↔ Neon
│       ├── alignWithDecks.ts   # Alinhamento ciclo ↔ baralhos
│       ├── types.ts            # Tipos do ciclo
│       ├── layerEngine.ts      # Engine de camadas
│       ├── sessionEngine.ts    # Engine de sessões
│       └── topicOps.ts         # Operações de tópico
├── middleware.ts               # HTTP Basic Auth gate
├── .env.local                  # DATABASE_URL + APP_PASSWORD (NÃO comitar)
├── .env.example                # Modelo de variáveis
└── vercel.json                 # maxDuration: 60s nas API routes
```

---

## 🚀 Scripts de Manutenção

| Comando | O que faz | Quando usar |
|---------|-----------|------------|
| `npm run dev` | Dev local em localhost:3000 | Desenvolvimento |
| `npm run build` | Build de produção | Antes de deploy manual |
| `npm run db:init` | Aplica schema no banco (idempotente) | Banco novo ou schema atualizado |
| `npm run seed` | Importa .txt das disciplinas → Postgres | Conteúdo de cards mudou |
| `npm run content:sync` | seed + gera JSONs estáticos (public/data) | Conteúdo mudou |
| `npm run reset` | ⚠️ Zera todo o progresso (mantém conteúdo) | Só com `-- --confirmo` |
| `npm run cobertura` | Relatório de coverage ciclo ↔ baralhos | Diagnóstico |

---

## 🩺 Diagnóstico — "Não carrega dados na Vercel"

1. Vercel → projeto `bizurado` → Settings → Environment Variables
2. Confirmar `DATABASE_URL` = string host `-pooler` do Neon twilight-bar
3. Marcada para Production + Preview + Development
4. **Redeploy** após qualquer mudança
5. Validar: abrir `[url]/api/cycle-state` → deve retornar JSON com `revision`

---

## 📝 Histórico

| Data | Mudança |
|------|---------|
| 2026-06-22 | Diagnóstico: banco íntegro, problema era ausência de DATABASE_URL na Vercel |
| 2026-07-xx | Bug: 48 duplicatas em review_log — corrigido com idempotência por (card_id, review_date) |
| 2026-08-20 | Migração para local-first completa. Conta migrada de matheusexperienceex → ozapacco |
| 2026-08-20 | Ciclo editável: criar cards, importar .txt, pausar/excluir assuntos, lápides |
| 2026-09-16 | Este documento criado como fonte de conhecimento centralizada |
