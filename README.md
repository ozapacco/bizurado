# Bizurado

Sistema de estudos (flashcards + ciclos de revisão FSRS) em **Next.js 14 (App Router)** com banco **Postgres (Neon)**, hospedado na **Vercel**.

---

## ⚠️ Antes de mexer — acessos obrigatórios

Sem estes 3 acessos **não dá pra avançar**:

| Recurso | Onde | Conta |
|---|---|---|
| Hospedagem | https://vercel.com/matheus-de-castros-projects/bizurado | — |
| Banco de dados | https://console.neon.tech/app/projects/soft-brook-95925879 | — |
| Código | https://github.com/matheusexperienceex-dotcom/bizurado | **matheus.experienceex@gmail.com** |

> **IMPORTANTE:** este repositório usa **somente o GitHub da conta `matheus.experienceex@gmail.com`**.
> Não fazer push/commit com outra conta.

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
| `npm run db:init` | **Aplica o schema** no banco apontado por `DATABASE_URL` (idempotente — `scripts/db-init.ts`). Roda manualmente, nunca a cada request. |
| `npm run seed` | Popula dados (`lib/seed.ts`) |

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
- Todas as rotas em `app/api/*` são `dynamic = "force-dynamic"` → leem o banco **ao vivo** (o build **não** acessa o banco).
- Schema: `lib/schema.ts` (Postgres). Timestamps comparados ficam como texto ISO-8601 'Z'; busca usa `pg_trgm` + `unaccent` (substitui o FTS5 do SQLite).

---

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
5. Validar abrindo `…/api/stats` no navegador — deve retornar JSON com `totalCards` etc.




Sistemas e dashboards: Impeccable
Landing pages e sites impactantes: Taste Skill
Pesquisa e criação do design system: UI UX Pro Max
Código de produção: Frontend UI Engineering