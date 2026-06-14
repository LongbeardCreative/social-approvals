# Social Approvals — Project Handoff

> **Purpose:** orient a fresh Claude Code session (or a developer) to resume work on this
> project. Read this first, then `AGENTS.md` (Next.js 16 rules) and the design/plans under
> `docs/superpowers/`. Written 2026-06-13, at the end of the static-tool → Next.js migration.

## 1. What this is

A social-media asset **approval tool** for Longbeard Creative's client Magisterium AI.
Johan builds post mockups (X / Instagram / Facebook / LinkedIn) in a browser editor, gets an
instant share link, and pastes it into an Asana task for **Matthew** to review. Matthew clicks
**Approve** or **Revisions** on the page; the app posts the decision as a comment on the Asana
task and reassigns the task back to Johan.

This repo was **migrated** from a single static `editor.html` (which "baked" self-contained
review pages committed to GitHub Pages, relayed to Asana via a Cloudflare Worker) into a
**Next.js 16 app on Vercel**, with images in **Cloudflare R2** and data in **Neon Postgres**.
The original static tool is preserved under [`legacy/`](legacy/).

**Audience note:** Johan is **non-technical**. Explain changes in plain language, define jargon,
and favour "what this means for you" framing. (Also captured in Claude's memory.)

## 2. Current status — migration COMPLETE, running in parallel

All 7 migration stages are done, on the **`migration` branch** (~30 commits, pushed to
GitHub). The app is **live**:

- **Editor (password-gated):** https://social-approvals.vercel.app/ — log in with the shared
  `EDITOR_PASSWORD` (ask Johan; it is **not** in this repo).
- **Reviewer page (public):** `https://social-approvals.vercel.app/r/{id}`.

**Deliberately NOT done — cutover.** Johan chose to keep the OLD tool running in parallel:
- `main` still serves the original static `editor.html` on GitHub Pages (untouched).
- The Cloudflare Worker `social-approvals-relay` still exists (no longer used by the new app).
- `migration` has **not** been merged to `main`.
- See §8 for the cutover checklist when Johan is ready.

## 3. Architecture & key files

Next.js App Router (TypeScript), deployed on Vercel. Plain CSS Modules (no Tailwind).

```
src/
├── proxy.ts                     Next 16 "Proxy" (renamed Middleware): optimistic gate
│                                redirecting logged-out users from / and /edit/* to /login
├── app/
│   ├── page.tsx                 "/" → <Editor/> (create mode); gated
│   ├── edit/[id]/page.tsx       "/edit/{id}" RSC → loads row → <Editor/> (edit mode); gated
│   ├── r/[id]/page.tsx          PUBLIC reviewer page (RSC): mockups read-only, decision UI, noindex
│   ├── login/page.tsx           password form
│   └── api/
│       ├── login/route.ts       POST password → signed cookie
│       ├── logout/route.ts      POST → clear cookie
│       ├── uploads/presign/route.ts   POST → presigned R2 PUT URL (gated)
│       └── reviews/
│           ├── route.ts                 POST create (gated)
│           ├── [id]/route.ts            PUT update / revision round (gated)
│           └── [id]/decision/route.ts   POST Approve/Revisions → Asana (PUBLIC)
├── components/
│   ├── Editor.tsx               the editor UI (create + edit modes), useReducer state
│   ├── editor-state.ts          state shape + reducer + PLATFORMS + MAX_POSTS (pure, tested)
│   ├── PlatformCard.tsx         one platform card (switch, post tabs, dropzone, live preview)
│   ├── Mockup.tsx               renders a single post mockup per platform (ported from legacy mock())
│   ├── icons.tsx, avatar.ts     ported SVG icons + the Magisterium avatar data URI
│   ├── Carousel.tsx             swipeable multi-post carousel on the reviewer page
│   ├── Decision.tsx             Approve/Revisions UI + mailto fallback
│   ├── editor.module.css        EDITOR dark chrome (ported verbatim from legacy)
│   └── review.module.css        REVIEW page dark chrome (ported verbatim from legacy)
├── styles/
│   ├── mockup.css               SHARED mockup CSS (the white post cards) — single source of truth
│   └── globals.css              tiny reset
├── lib/
│   ├── auth.ts                  HMAC signed-cookie auth (sessionToken/checkPassword/isAuthed)
│   ├── asana.ts                 parseTask + decisionComment + postDecisionToAsana (ported worker.js)
│   ├── review-input.ts          Zod schema for create/update payloads
│   ├── review-copy.ts           adaptive intro + Approve-label text
│   ├── r2.ts                    S3 client for R2 + presign helpers
│   ├── image.ts                 client crop to 1080×1350 JPEG + assess()
│   └── upload.ts                client uploader: crop → presign → PUT
└── db/
    ├── schema.ts                reviews table + Platforms/Review types
    ├── index.ts                 lazy Drizzle (neon-http) client getDb()
    └── reviews.ts               createReview / getReviewById / updateReview / markReviewDecided
drizzle/                         migrations (0000 = the reviews table)
legacy/                          the ORIGINAL static tool (editor.html, worker.js, tests, sample)
docs/superpowers/                the migration design spec + per-stage implementation plans
```

**Data model** (`reviews` table, overwrite model): `id` (nanoid, the public slug), `campaign`,
`account`, `handle`, `asanaTaskGid`, `platforms` (JSON — per-platform `{on,cur,posts:[{copy,img,note}]}`,
`img` = R2 URL), `status` (`draft|pending|approved|revisions`), `decisionNotes`, `decidedAt`, `createdAt`.

## 4. Infrastructure & environment

| Service | What | Notes |
|---|---|---|
| **Vercel** | hosting | Deployed via CLI to Johan's **personal** scope `johan-3548s-projects` (NOT the Longbeard team — he's a Member there and couldn't create projects). Project: `social-approvals`. |
| **Cloudflare R2** | image storage | Bucket `social-approvals-assets`, public r2.dev domain. CORS allows PUT/GET from localhost + the vercel.app domain, `AllowedHeaders: ["content-type"]`. |
| **Neon** | Postgres | Project `social-approvals`, accessed via Drizzle `neon-http`. |
| **Asana** | decisions | "Review Bot" account token; comment + reassign on the task. |

**Env vars** (values live in `.env.local` locally — gitignored — and in Vercel **production**;
never in the repo): `EDITOR_PASSWORD`, `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `ASANA_TOKEN`, `ASSIGNEE`, `REVIEWER`,
(optional) `ALLOWED_ORIGIN`.

## 5. Run / build / deploy

```bash
npm install
# .env.local must contain the env vars above (ask Johan / pull from Vercel)
npm run dev        # http://localhost:3000 (log in with EDITOR_PASSWORD)
npm test           # Vitest (49 tests at handoff)
npm run build      # production build + type-check + lint

# migrations
npx drizzle-kit generate && npx drizzle-kit migrate

# deploy (needs a Vercel token in /tmp/sa-vercel-token or pass --token)
npx vercel@latest deploy --prod --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"

# preview/screenshot during dev: .claude/launch.json defines the "social-approvals" server
```

## 6. Decisions made (so you don't re-litigate them)

- **DB:** Neon + Drizzle. **Auth:** shared password (not per-user). **Assets:** public R2.
  **Revisions:** overwrite (edit-in-place — same `/r/{id}` link updates, resets to pending).
  **Domain:** the `*.vercel.app` URL for now.
- **Edit-in-place** chosen over new-link-per-round (matches the old tool's "same link updates").
- **Parallel run** chosen over immediate cutover.
- **No Tailwind** — the legacy CSS was ported **verbatim** into CSS Modules. **Match Johan's
  existing designs exactly; do not rebuild/reinterpret** (he rejected a from-scratch restyle in Stage 4).
- Editor under Johan's **personal** Vercel scope (team lacked project-create permission).

## 7. Next.js 16 gotchas (this is NOT the Next.js in your training data — read `AGENTS.md`)

- **Middleware is renamed "Proxy"**: `src/proxy.ts`, `export function proxy()`, `export const config = { matcher }`.
  Proxy is *optimistic* — real auth enforcement is the `isAuthed()` check inside the editor API routes.
- **Dynamic route params are async**: `async function GET/POST/PUT(req, ctx)` then `const { id } = await ctx.params`.
  Use the generated `RouteContext<'/path/[id]'>` type.
- **CSS Modules are scoped** — the editor + review dark themes are separate modules so they don't
  collide; the shared white-card styling is the one global `styles/mockup.css`. Change mockup styling there only.
- The DB client (`getDb()`) and R2 client are built **lazily** so importing them never throws at
  build/test time when env is absent.
- `/edit/[id]` fills any platforms missing from a saved review as "off" (so partial data doesn't crash the cards).
- Verify behaviour-critical Next 16 details against the bundled docs in `node_modules/next/dist/docs/`.

## 8. Cutover checklist (do when Johan is ready to retire the old tool)

1. Merge `migration` → `main` (this makes `main` the Next app).
2. Disable **GitHub Pages** for the repo (Settings → Pages) — `main` is no longer a static site.
3. Delete the **Cloudflare Worker** `social-approvals-relay` (its logic now lives in the decision route).
4. Remove `legacy/` (or keep as an archive).
5. Optionally connect Vercel Git integration + set the production branch to `main` (currently deploys are CLI-driven).
6. Consider a custom domain (update R2 CORS `AllowedOrigins` + `ALLOWED_ORIGIN` if so).

## 9. Open follow-ups / possible next edits

- **🔐 Rotate the secrets** that passed through the build chat: the Vercel token, R2 access
  key/secret, Neon connection string, and Asana token (then update `.env.local` + Vercel). The
  `EDITOR_PASSWORD` is a shared team password — change it anytime (one env var).
- A few **test reviews** remain in the Neon DB from verification — safe to delete.
- **Not built (deferred, could be added):** draft autosave (the old localStorage drafts), a
  **list of existing reviews** to find/reopen them for editing (today you reach `/edit/{id}` from
  the create success panel or by knowing the id), per-user accounts, immutable revision history.
- The `legacy/test.js` (jsdom) and `legacy/worker.test.mjs` were behavioural specs for the old
  tool; their key cases were re-expressed as Vitest tests in the new app.

## 10. How to resume in a new chat

1. Open this repo; read `HANDOFF.md` (this file), then `AGENTS.md`.
2. Skim `docs/superpowers/specs/` (the design) and `docs/superpowers/plans/` (per-stage plans) for detail.
3. The app is on the `migration` branch. `git log --oneline main..migration` shows the full build history.
4. To deploy/test you need the env vars (from Johan / `vercel env pull`) and a Vercel token.
5. State your intended change, confirm scope with Johan (he's non-technical — explain plainly), then proceed.
