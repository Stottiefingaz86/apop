# APOP — AI Product Operations Portal

## Local development

1. **Node** — use Node 20+ (see `.nvmrc`).

2. **Environment** — copy env and point at local Postgres:

   ```bash
   cp .env.example .env
   ```

   Default `DATABASE_URL` in `.env.example` matches Docker Compose below.

3. **Database** — start Postgres and apply the schema:

   ```bash
   npm run db:up
   npx prisma db push
   ```

   Or one shot: `npm run setup:local` (starts Docker + `db push`).

   **Demo / “nothing saved” locally:** run `npm run demo:local` — it starts Docker, applies the schema, and warns if `.env` still has a **Supabase** (or other remote) `DATABASE_URL` instead of **`localhost:5432`**.

4. **App** — install and run:

   ```bash
   npm install
   npm run dev
   ```

   In the terminal, Next.js prints a line like **`Local: http://localhost:3000`** (or **3001**, **3002**, … if 3000 is already in use). **Always use that URL and port** — do not assume 3000.

   Open `/pipeline` on that host, e.g. `http://localhost:3002/pipeline` if that is what the terminal shows.

   To force port 3000 (fails if something else is using it): `npm run dev:3000`.

   **No database yet?** The pipeline still renders (empty columns + a yellow notice). Creating features and opening saved feature pages require Postgres + `npx prisma db push`.

### Without Docker

Use any Postgres 14+ instance and set `DATABASE_URL` in `.env`, then `npx prisma db push`.

### Database and agent pipeline

**1. Postgres must be reachable from your machine**

- **Docker (simplest locally):** `npm run db:up` then set `DATABASE_URL` and `DIRECT_URL` in `.env` to the local URLs from `.env.example`, then `npx prisma db push`.
- **Supabase:** use the **Database** connection strings in `.env` (see `SUPABASE_STEPS.txt`). Run `npx prisma db push` when the host answers (not the same as the Supabase *API* URL).

**2. Run the app**

`npm run dev` — use the **`Local: http://localhost:…`** line for the correct port.

**3. Use the product UI**

| Step | Where |
|------|--------|
| Create a feature | **New feature** in the sidebar → title + description → Create |
| Open workspace | Click the card on **Pipeline** or go to `/features/<id>` |
| Run an agent | In the workspace, use **Run** for the current stage (calls `POST /api/features/<id>/run`) |

**4. How stages map to agents** (default)

| Stage | Agent |
|-------|--------|
| `VALUE_REVIEW` | value analyst (score + optional questions) |
| `PRD` | PRD writer **or** [spec-kit](#spec-kit-cursor-cloud) via Cursor Cloud when configured (see below) |
| `DESIGN_SPEC` | design spec (questions + spec artifact) |
| `READY_FOR_BUILD` / `IN_BUILD` | build (placeholder) |
| `QA` | QA (placeholder) — **not a Kanban column**; legacy rows appear under **Done** |

`INBOX` / `DONE` / `REJECTED` have no default run. Move the card on the Kanban (with DB connected) or adjust stage in the app as you build that flow.

### Spec-kit (Cursor Cloud)

APOP can drive **[GitHub spec-kit](https://github.com/github/spec-kit)** on your **delivery repo** (default: **site-apop** — the Next.js app you ship), so the PRD is real `spec.md` / `plan.md` / `tasks.md` instead of only the in-process LLM PRD writer.

**Requirements**

- Initialize spec-kit in the delivery repo (skills under `.cursor/skills`, templates under `.specify/`, etc.) — see the spec-kit README.
- In APOP `.env`: **`CURSOR_API_KEY`** and **`CURSOR_BUILD_REPOSITORY`** (GitHub HTTPS URL, e.g. `https://github.com/org/site-apop`). Optional: **`CURSOR_BUILD_REF`** (default `main`), **`CURSOR_WEBHOOK_SECRET`**, **`APOP_APP_URL`** (must be a public HTTPS URL for Cursor webhooks; localhost skips webhooks and relies on **polling** in the UI).

**What happens**

1. **Spec phase** — When the feature reaches **`PRD`** (e.g. after you approve design), APOP launches a Cursor Cloud agent with `jobPhase: spec`. The agent runs spec-kit **specify → plan → tasks** and stops (no full app implementation in this phase). Markdown is usually written under **`specs/<feature-folder>/`** (e.g. `specs/001-my-feature/spec.md`).
2. **Pull into APOP** — When the agent finishes, APOP **clones** the agent branch on the server and reads those paths (so private repos work wherever `git clone` is authenticated). The combined markdown is saved as the **PRD** artifact (`specKitSource` in JSON). If clone credentials are missing on the host, set up deploy keys or a machine user as you would for any CI clone.
3. **Build phase** — **Start Cursor agent** uses the spec branch when present, embeds the spec-kit body in the **Ship PRD / Cursor deliverable** prompt, and tells Cursor to run **`speckit-implement`** from the existing tasks.
4. **Manual** — In the feature workspace sidebar, **Run Spec-Kit** starts the same spec-phase agent without waiting for the pipeline transition.

**Reference:** [github.com/github/spec-kit](https://github.com/github/spec-kit) · Cursor Agents API: [cursor.com/docs/background-agent/api/endpoints](https://cursor.com/docs/background-agent/api/endpoints).

**5. Competitive research context (agents)**

- Curated operator set for **pattern-level** benchmarking (not live crawls): **Stake**, **FanDuel**, **DraftKings**, **Bovada**, plus global references **bet365**, **Roobet** — see `src/lib/domain/competitive-landscape.ts`.
- Injected into **value** (OpenAI/Anthropic), **PRD**, and **design** LLM prompts via `deliverySiteContextForLlm()` and the value-analyst system prompt. Future work can add real URL analysis / snapshots on top of this list.

**6. Execution model**

Runs execute **in the Next.js server process** (`enqueueFeatureRun` → `executeFeatureRun`). There is **no separate worker**.

- **Value analyst:** uses **OpenAI** (`OPENAI_API_KEY`, default model `gpt-4o-mini`) when set; else **Anthropic Claude** when `ANTHROPIC_API_KEY` is set; else **rule-based TypeScript**.
- **PRD writer:** uses **OpenAI** then **Anthropic** when keys are set — JSON PRD + `cursorHandoff` + `valueHypothesis` tuned for **site-apop** (see `site-apop-dna.ts`); else **template** PRD (still includes a basic `cursorHandoff`). When **Cursor** env vars are set, the **PRD** stage prefers **spec-kit on Cursor Cloud** (see [Spec-kit](#spec-kit-cursor-cloud) above) instead of this in-process writer.
- **Design spec:** always builds the structured spec from your tokens/brand; then **OpenAI** / **Anthropic** appends an **implementation narrative for Cursor**, component hints, and a **roadmap value angle**. Without keys, you get the base spec only.
- **Build / QA agents:** placeholders today.

**OpenAI “spend” / Usage dashboard**

- **ChatGPT Plus** and **OpenAI API** are billed separately. APOP only uses the **API** when `OPENAI_API_KEY` is set. Usage appears under [platform.openai.com](https://platform.openai.com) → **Usage**, not the consumer ChatGPT subscription page.
- If you see **$0** there: the server may have **no API key**, the key may be **wrong project**, or value analysis never ran past **heuristic** mode (check the terminal for `[apop]` logs). **`GET /api/health`** returns `openaiApiKeySet`, `anthropicApiKeySet`, and `llmForValueAnalysis` so you can confirm the running Next process sees your keys.
- Value analysis also **skips the API** until the context pack has **product area**, **audience**, and **primary KPI** — it will ask questions instead of calling GPT.
- **Implementation:** **Start Cursor agent** in the feature workspace calls the [Cursor Cloud Agents API](https://cursor.com/docs/background-agent/api/endpoints) with the Ship PRD handoff (`CURSOR_API_KEY` + `CURSOR_BUILD_REPOSITORY`). Optional **auto-deploy** hits `VERCEL_DEPLOY_HOOK_URL` when the agent reaches a finished state.

**7. Optional checks**

- `GET /api/health` — Postgres reachable? LLM keys visible to the server (`llmForValueAnalysis`)?
- `GET /api/supabase/status` — Supabase **API** (HTTPS) reachable? (orthogonal to Prisma.)

### Optional (Vercel / deploy hooks)

See `.env.example` for `VERCEL_*` variables; not required for local UI and feature CRUD.

### Troubleshooting

- **Refused to connect / wrong page** — the dev server is not running, **or you are using the wrong port**. Run `npm run dev` and use the exact **`Local: http://localhost:…`** URL from that terminal (not necessarily 3000).
- **Pipeline page errors / Prisma “Can’t reach database”** — Postgres is not running or `DATABASE_URL` is wrong. Start the DB (`npm run db:up` with Docker, or your own Postgres), then `npx prisma db push`.
