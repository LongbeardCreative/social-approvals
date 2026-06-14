# Social Approvals

A small web app for Longbeard Creative: build social-post mockups for Magisterium AI
(X, Instagram, Facebook, LinkedIn), share a link for review, and collect a single
**Approve / Revisions** decision — posted straight onto the Asana task, with the task
assigned back to Johan automatically.

This is the Next.js / Vercel rebuild of the original single-file `editor.html` tool
(now kept under [`legacy/`](legacy/) for reference). Creating a review is now an instant
database write that returns a live `/r/{id}` link — no file to commit, no Pages rebuild.

## How it's used

1. **Log in** to the editor (one shared password, set via `EDITOR_PASSWORD`). Reviewers
   never log in — they only need the link.
2. **Build the review**: paste the Asana task link, name the campaign, fill copy +
   images per platform (per-platform on/off, up to 6 posts each, live preview). Images
   are cropped to 1080×1350 in the browser and uploaded straight to Cloudflare R2.
3. **Generate review page** → you get an instant `https://<app>/r/{id}` link (and an
   "Edit this review" link). Paste the review link into the Asana task and assign Matthew.
4. **Matthew opens the link** (no login): sees only the enabled platforms (multi-post ones
   are swipeable carousels), and clicks **Approve** or **Revisions needed** + notes.
5. The decision posts to the Asana task ("✅ Approved by Matthew" / "🔁 Revisions
   requested by Matthew" + notes + link) and reassigns the task to Johan. If Asana is ever
   unreachable, the page falls back to a prefilled email so feedback is never lost.
6. **Revision round**: open `/edit/{id}`, change the set, **Save** — the same link updates
   and resets to pending.

## Architecture

- **Next.js (App Router) on Vercel.** Editor pages (`/`, `/edit/[id]`) are password-gated
  by `src/proxy.ts` + an `isAuthed` check in the editor's API routes. `/r/[id]` (the
  reviewer page) and `POST /api/reviews/[id]/decision` are public.
- **Cloudflare R2** stores post images; the browser uploads directly via a presigned URL
  (`POST /api/uploads/presign`). Served from a public r2.dev domain.
- **Neon Postgres + Drizzle** stores one `review` row per review (`src/db/`). Migrations in
  `drizzle/`.
- **Asana**: the decision endpoint posts the comment + reassigns the task (ported from the
  old Cloudflare Worker, which is now retired).

## Local development

```bash
npm install
# create .env.local with the env vars below
npm run dev      # http://localhost:3000 (log in with EDITOR_PASSWORD)
npm test         # Vitest
npm run build    # production build / type-check
```

### Environment variables (`.env.local` locally, Vercel project settings in prod)

| Name | Purpose |
|------|---------|
| `EDITOR_PASSWORD` | shared password to use the editor (fail-closed if unset) |
| `DATABASE_URL` | Neon Postgres connection string |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 |
| `ASANA_TOKEN`, `ASSIGNEE`, `REVIEWER` | Review Bot token, who the task returns to, the reviewer's name |
| `ALLOWED_ORIGIN` | optional — restrict the decision endpoint to one origin |

## Deploy

Deployed via the Vercel CLI to a personal scope (see `docs/superpowers/specs` /
`docs/superpowers/plans` for the migration history):

```bash
npx vercel@latest deploy --prod --scope johan-3548s-projects --token=…
```

Migrations: `npx drizzle-kit generate` then `npx drizzle-kit migrate`.

## Status

The old static tool (`legacy/editor.html` + the Cloudflare Worker + GitHub Pages) is kept
running in parallel; it will be retired at a later cutover.
