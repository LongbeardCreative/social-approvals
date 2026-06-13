# Social Approvals — Migration Design (static tool → Next.js app)

**Status:** Approved by Johan, 2026-06-13. Supersedes/consolidates `MIGRATION.md` with the §7 decisions resolved.
**Branch:** `migration` (work happens here; `main` keeps serving the live tool until cutover).

---

## Plain-English summary (for Johan)

Today the tool works like this: you build the mockups in `editor.html`, it "bakes" a self-contained
web page, you drag that page into GitHub, wait for it to publish, then paste the link into Asana. Every
review — and every revision round — means another file, another commit, another wait.

We're replacing that with a **real web app**. After the change:

- You open the app in your browser (protected by **one shared password** your team knows), build the
  mockups exactly like today, and click **Create review**.
- A share link — `https://<app>/r/abc123` — appears **instantly**. No file to download, no GitHub
  drag-and-drop, no waiting for a publish. You paste that link into Asana and assign Matthew, same as now.
- Matthew opens the link, sees only the platforms you turned on (multi-post ones are still swipeable
  carousels), and clicks Approve or Revisions — which still posts the comment to Asana and reassigns the
  task back to you, exactly like today.

Three pieces of plumbing make this work, and you don't have to think about them day-to-day:

1. **Vercel** — the company that hosts the app and gives it a web address. (Replaces GitHub Pages.)
2. **Cloudflare R2** — cheap storage for the images, so review pages load a few small references instead
   of cramming every full-size photo into the page. (You already have a Cloudflare account from the
   current relay.)
3. **Neon** — a small database (think: a smart spreadsheet) that remembers each review, so a link can be
   created the instant you click, with nothing to publish.

We build it in **seven small, separately-checked stages** so nothing is a big risky leap. We start with
stage 1 only: stand up an empty app and confirm it loads on the web. Everything else comes after, one
stage at a time, each one verified before the next.

The current tool keeps working untouched the entire time. We only switch over at the very end.

---

## 1. Settled decisions (the §7 "one-way doors")

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Database | **Neon (serverless Postgres) + Drizzle ORM** | Cleanest fit with Vercel; real SQL if reviews ever need querying/history. Provisioned via the Vercel↔Neon integration so the connection string auto-populates. |
| 2 | Editor auth | **Shared password** | Matches today's single-builder reality without per-user accounts. Reviewers stay link-only (unauthenticated). |
| 3 | Asset access | **Public R2, managed `pub-<hash>.r2.dev` domain** | Simplest; "unlisted but public," same trust model as today's shared-link pages. No custom DNS needed. |
| 4 | Revision rounds | **Overwrite** | A new round mutates the same row; `/r/{id}` always shows the latest set, and the link Matthew already has updates in place — identical to today. New round resets `status → pending`. |
| 5 | Domain | **Vercel default `*.vercel.app` for now** | Unblocks everything immediately. Adding a custom domain later is just updating two env values (CORS origins + the origin check), not a rebuild. |

## 2. Additional technical calls (beyond §7)

- **Auth mechanism — custom middleware + signed httpOnly cookie**, gating *only* editor routes
  (`/`, `/new`, `POST /api/uploads/presign`, `POST /api/reviews`). A `/login` page checks the entered
  password against `EDITOR_PASSWORD` (constant-time compare) and sets the cookie.
  **Public, never gated:** `/r/[id]`, `POST /api/reviews/[id]/decision`, R2 assets, `/login`.
  *Rejected:* Vercel Deployment Protection — it would also lock reviewers out of `/r/[id]`.
- **Branch + cutover** — scaffold the Next app at repo root on `migration`; `main` keeps serving the
  GitHub Pages tool until Step 7 deletes the static files and we cut over.
- **No Tailwind — plain CSS Modules.** Port the existing `MOCKUP_CSS` verbatim as the single source of
  truth for mockup styling. (Avoids running a second styling paradigm next to that pristine CSS; trivial
  to add Tailwind later if desired.)
- **Tests — Vitest** for route/unit/component coverage, re-expressing the behavioural specs currently in
  `test.js` and `worker.test.mjs`. Playwright E2E optional in a later pass.
- **No internal planning docs in the public repo.** `CLAUDE.md` / `MIGRATION.md` stay as local references
  (they name internal accounts/process). This design doc is architecture-only (no secrets) and is safe to
  commit.

## 3. Architecture (affirming MIGRATION.md §3)

```
Browser (editor, password-gated)            Vercel (Next.js App Router)            Cloudflare R2
  build posts ───────────────▶  POST /api/uploads/presign  ──┐
  PUT file (cropped) ──────────────────────────────────────┘─────────────▶  assets bucket (public)
  POST /api/reviews (metadata) ─▶  write review row (Neon) ──▶ returns { id, url }

Reviewer (Matthew, unauthenticated, has link)
  GET /r/{id} ────────────────▶  RSC reads row + R2 URLs, renders mockups (read-only)
  POST /api/reviews/{id}/decision ─▶ Zod-validate ─▶ Asana comment + reassign ─▶ mark row decided
```

- `/r/{id}` — dynamic server-rendered (RSC) public review page; `id` = nanoid (non-guessable, same
  "unlisted" trust model as today). Replaces the baked HTML file.
- Editor — authed route(s) (`/` or `/new`); same UX as today (per-platform on/off, multi-post tabs, live
  preview).
- `POST /api/uploads/presign` — issues a presigned PUT URL. Runs in the **Node runtime** (not a Worker),
  so standard `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` work; S3 client `region:"auto"`,
  `endpoint: https://<accountid>.r2.cloudflarestorage.com`.
- `POST /api/reviews` — writes the row, returns `{ id, url }` (the instant-link moment).
- `POST /api/reviews/{id}/decision` — Zod-validated; ports `worker.js`'s Asana comment + reassign;
  marks the row decided; keeps the prefilled-mailto fallback and double-submit guard. **Worker retired.**

## 4. Data model (overwrite variant)

One `review` row:
- `id` (string, nanoid) — public URL slug
- `campaign`, `account`, `handle` (strings)
- `asanaTaskGid` (string)
- `platforms` (JSON) — same shape as the editor's `p` object, but each post's `img` is an **R2 object
  key / URL** instead of a base64 data URI
- `status` (`'draft' | 'pending' | 'approved' | 'revisions'`), `decisionNotes`, `decidedAt`
- `createdAt`
- (`createdBy` omitted/constant — shared-password model has no per-user identity)

No separate history table (overwrite model). A new revision round mutates the row and resets
`status → pending`, `decisionNotes/decidedAt → null`.

## 5. Reuse / rebuild / retire (MIGRATION.md §5)

- **Reuse** — `mock(id, post)` rendering + `MOCKUP_CSS` → a `<Mockup platform account handle post />`
  component + CSS module. The baked template's carousel script (scroll-snap track, dots, prev/next,
  "n / m" counter) → a small client component. `processFile()` image pipeline → client-side canvas
  crop/cover to 1080×1350 q0.85 JPEG, off-ratio/upscale flagging, **before** the presigned PUT (R2 stores
  the normalized asset).
- **Rebuild** — persistence + delivery: DB rows + presigned uploads + dynamic routes. Drafts become
  autosaved DB rows in `'draft'` status (replacing localStorage).
- **Retire** — `worker.js` (logic moves to the decision route), the bake markers / template-literal
  discipline, the GitHub upload flow.

## 6. Hard constraints (build around these — MIGRATION.md §2)

- **Vercel serverless body cap ~4.5 MB** → never route uploaded images through a route handler/server
  action. Use **presigned direct-to-R2 uploads**.
- **R2 CORS** for the upload bucket: `AllowedHeaders: ["content-type"]` (exactly — **not** `["*"]`, which
  silently fails preflight), `AllowedMethods: ["PUT"]`, `AllowedOrigins` scoped to the app domain in prod
  (`"*"` only in local dev).
- **Presigning runs in the Node runtime**, so the Workers/DOMParser incompatibility does not apply.
- **Server Actions / route handlers are public POST endpoints** → Zod-validate and authorize every input.

## 7. Build order (one plan→implement→verify cycle each)

Each stage ships and is verified on a Vercel preview deployment before the next begins.

1. **Scaffold + deploy empty app** — `create-next-app` (App Router, TS), deploy to Vercel, confirm the
   round-trip loads. ← **we start here**
2. **R2 + presigned uploads** — buckets, CORS, S3 client, `POST /api/uploads/presign`, client uploader
   (crop → request URL → PUT). Test with a real image end to end.
3. **Data layer** — Neon + Drizzle, `review` schema, migrations.
4. **Editor route** (authed) — port mockup component, carousel, multi-post tabs, platform switches, image
   pipeline. "Create review" writes the row and shows the `/r/{id}` link.
5. **Review route** `/r/{id}` — RSC read-only mockups from the row; carousel client component; Approve /
   Revisions UI.
6. **Decision endpoint** — port the Worker's Asana comment + reassign into `POST /api/reviews/{id}/decision`,
   Zod-validated; mark the row decided; keep the mailto fallback. Retire the Worker.
7. **Auth gate + parity polish** — middleware/cookie gate, adaptive intro/labels, "copy link" affordance.
   Then delete the old static files and cut over.

## 8. Step 1 detail (the first plan)

- `create-next-app` — App Router, TypeScript, ESLint; **no Tailwind**; `src/` dir; import alias `@/*`.
- Trivial landing page (placeholder) — no features yet.
- Connect the repo's `migration` branch to a new Vercel project; deploy; confirm the assigned
  `*.vercel.app` URL loads.
- Add Vitest with one trivial passing test to prove the test runner works.
- **Acceptance:** empty app loads at its Vercel URL; `npm test` runs green locally; `main` and the live
  Pages tool are untouched.

## 9. Prerequisites / who does what

| Item | Who | Notes |
|------|-----|-------|
| Vercel account + project | Johan authenticates once; Claude drives the CLI/tooling | New project, linked to the `migration` branch |
| Neon database | Provision via the Vercel↔Neon integration | Auto-populates `DATABASE_URL` |
| Cloudflare R2 bucket + API token + CORS rule | Johan provides token / Claude gives exact click-path | Reuses existing Cloudflare account |
| Asana env (reused) | Already exists in the Worker | `ASANA_TOKEN`, `ASSIGNEE`, `REVIEWER` |
| New env | Set in Vercel | `EDITOR_PASSWORD`, R2 access key/secret/account-id/bucket, R2 public base URL, later `ALLOWED_ORIGIN` |

**No secrets live in this repo or any page** — all of the above are environment variables stored in
Vercel/Cloudflare, exactly as the token lives only in the Worker today.

## 10. Behaviour to preserve (MIGRATION.md §8 — non-negotiable)

- Decision posts to Asana as "✅ Approved by Matthew" / "🔁 Revisions requested by Matthew" + notes +
  review link, then reassigns the task to Johan.
- Reviewer sees only enabled platforms; multi-post platforms are swipeable carousels with dots + counter;
  single-post platforms have no carousel chrome.
- Approve button + intro copy adapt to the set ("Approve all 5" / "Approve this post").
- Images normalized to 1080×1350, off-ratio/upscale flagged at upload time.
- Decision endpoint resilient: never lose feedback (mailto fallback if Asana fails); guard double-submit.
- Review pages carry `noindex`.
