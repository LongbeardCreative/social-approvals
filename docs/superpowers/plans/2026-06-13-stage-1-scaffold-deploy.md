# Stage 1: Scaffold + Deploy Empty App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Note:** Task 5 (Vercel) has interactive human steps — Johan must authenticate. Prefer inline execution for this stage.

**Goal:** Stand up an empty Next.js app on the `migration` branch and confirm it loads on a live Vercel URL, with the test runner proven working — without touching `main` or the live tool.

**Architecture:** Next.js App Router (TypeScript) scaffolded at repo root on `migration`. The existing static tool is moved into `legacy/` (kept for reference during the later port; `main` still serves it). Deploy via Vercel's Git integration with the **production branch set to `migration`** during the migration period, so pushes build the Next app (not the static `main`).

**Tech Stack:** Next.js (App Router, TS), Vitest + vite-tsconfig-paths, npm, Vercel (Git integration), GitHub.

**Reference:** `docs/superpowers/specs/2026-06-13-social-approvals-migration-design.md` (§7 build order, §8 Step 1 detail, §9 prerequisites).

---

## File structure after Stage 1

```
social-approvals/                 (migration branch)
├── docs/superpowers/             specs + plans (already present)
├── legacy/                       the old static tool, moved here for reference
│   ├── editor.html
│   ├── worker.js
│   ├── test.js
│   ├── worker.test.mjs
│   ├── reviews/
│   └── README-static.md
├── src/
│   ├── app/
│   │   ├── layout.tsx            (from create-next-app)
│   │   └── page.tsx              minimal placeholder landing
│   └── lib/
│       ├── version.ts            tiny module the smoke test imports
│       └── version.test.ts       Vitest smoke test
├── package.json
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
└── README.md                     (fresh, from create-next-app; edited)
```

---

## Task 1: Stage the workspace (move static tool into `legacy/`)

**Files:**
- Create: `legacy/worker.js`, `legacy/test.js`, `legacy/worker.test.mjs` (copied from `~/Downloads/files2/`)
- Move: `editor.html` → `legacy/editor.html`, `reviews/` → `legacy/reviews/`, `README.md` → `legacy/README-static.md`

- [ ] **Step 1: Confirm we're on the `migration` branch with a clean tree**

Run: `git branch --show-current && git status --short`
Expected: prints `migration` and no uncommitted changes (the design-doc commit is already in).

- [ ] **Step 2: Bring the porting-reference files into `legacy/`**

These three files live only in `~/Downloads/files2/` today; we want them version-controlled for the later port (none contain secrets — the Asana token is a Worker env var, not in the file).

```bash
mkdir -p legacy
cp ~/Downloads/files2/worker.js legacy/worker.js
cp ~/Downloads/files2/test.js legacy/test.js
cp ~/Downloads/files2/worker.test.mjs legacy/worker.test.mjs
```

- [ ] **Step 3: Move the live static files into `legacy/`**

```bash
git mv editor.html legacy/editor.html
git mv reviews legacy/reviews
git mv README.md legacy/README-static.md
```

- [ ] **Step 4: Verify the repo root is now clear for scaffolding**

Run: `ls -A` (excluding `.git`)
Expected: `docs`, `legacy` (and `.git`). No `editor.html`, no `reviews/`, no root `README.md`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: move static tool into legacy/ on migration branch

Frees the repo root for the Next.js scaffold and version-controls
worker.js + the two test harnesses (porting references for later stages).
main still serves the static tool untouched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Scaffold the Next.js app at repo root

**Files:** creates `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore`, `README.md`, etc.

- [ ] **Step 1: Confirm Node version is compatible**

Run: `node -v`
Expected: v18.18+ or v20+ (Next.js requirement). If older, stop and install a current Node LTS first.

- [ ] **Step 2: Confirm the create-next-app flags for the installed version**

Run: `npx create-next-app@latest --help`
Expected: a flag list. Confirm these exist before the next step: `--typescript`, `--eslint`, `--app`, `--src-dir`, `--no-tailwind`, `--import-alias`, `--use-npm`, `--skip-install`, `--disable-git`, `--empty`. If any flag name differs in this version, adjust Step 3 accordingly.

- [ ] **Step 3: Scaffold into a temp dir (no install, no git), then copy in**

We scaffold to a temp dir because `create-next-app` refuses a non-empty target (`docs/`, `legacy/` are present), then copy the files into the repo root.

```bash
rm -rf /tmp/sa-scaffold
npx create-next-app@latest /tmp/sa-scaffold \
  --typescript --eslint --app --src-dir --no-tailwind \
  --import-alias "@/*" --use-npm --skip-install --disable-git --empty
cp -R /tmp/sa-scaffold/. /Users/johanvanzyl/Documents/GitHub/social-approvals/
rm -rf /tmp/sa-scaffold
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: installs cleanly, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 5: Verify a production build succeeds**

Run: `npm run build`
Expected: `✓ Compiled successfully`, a route list including `/`, exit code 0.

- [ ] **Step 6: Verify `.gitignore` covers the right things**

Open `.gitignore` and confirm it ignores `node_modules`, `.next`, `.env*`, and `.vercel`. If `.vercel` is missing, append it (the Vercel CLI writes a `.vercel/` link dir we don't commit):

```bash
grep -qxF '.vercel' .gitignore || printf '\n# vercel\n.vercel\n' >> .gitignore
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app (App Router, TypeScript)

Empty app at repo root on the migration branch. No Tailwind (mockup CSS
will be ported as the single styling source of truth in a later stage).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add Vitest and a smoke test (TDD)

**Files:**
- Create: `vitest.config.ts`, `src/lib/version.ts`, `src/lib/version.test.ts`
- Modify: `package.json` (add `test` script + dev deps)

- [ ] **Step 1: Install Vitest and the tsconfig-paths plugin**

```bash
npm install -D vitest vite-tsconfig-paths
```
(`vite-tsconfig-paths` makes the `@/*` import alias resolve inside tests, matching the app.)

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```
(We use the `node` environment for now; a later stage that tests React components will switch to `jsdom`.)

- [ ] **Step 3: Write the failing test**

Create `src/lib/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { APP_NAME } from '@/lib/version';

describe('app metadata', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('Social Approvals');
  });
});
```

- [ ] **Step 4: Add the `test` script and run to verify it FAILS**

Add to `package.json` `"scripts"`: `"test": "vitest run"`.

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/version` (the module doesn't exist yet).

- [ ] **Step 5: Write the minimal implementation**

Create `src/lib/version.ts`:

```ts
export const APP_NAME = 'Social Approvals';
```

- [ ] **Step 6: Run the test to verify it PASSES**

Run: `npm test`
Expected: PASS — 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add Vitest with a smoke test

Proves the test runner + @/* alias resolution work. node environment
for now; jsdom added when component tests arrive.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Minimal placeholder landing page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the page body with a minimal placeholder**

Overwrite `src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        color: '#0e0d0b',
      }}
    >
      <h1 style={{ fontFamily: 'Iowan Old Style, Palatino, Georgia, serif', margin: 0 }}>
        Social Approvals
      </h1>
      <p style={{ margin: 0, opacity: 0.7 }}>New app — under construction.</p>
    </main>
  );
}
```

- [ ] **Step 2: Verify it builds and renders locally**

Run: `npm run build` then `npm run dev`, open the printed `http://localhost:3000`.
Expected: build passes; the page shows the heading and subtitle. Stop the dev server (Ctrl-C) when confirmed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: minimal placeholder landing page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Deploy to Vercel ⚠️ INTERACTIVE — needs Johan

This is the only task that needs Johan, because it involves logging into accounts. Plain-language version: we put the app online, and Vercel gives it a web address.

- [ ] **Step 1: Push the `migration` branch to GitHub**

```bash
git push -u origin migration
```
Expected: branch appears on GitHub at `longbeardcreative/social-approvals`. (This does not affect `main` or the live Pages tool.)

- [ ] **Step 2 (Johan): Create a Vercel project from the repo**

Either via the Vercel CLI (Claude drives, Johan completes the browser login) or the dashboard. Dashboard click-path (most explicit):
1. Go to `vercel.com` → log in / sign up (Johan).
2. **Add New… → Project**.
3. **Import** the `longbeardcreative/social-approvals` repo (authorize Vercel↔GitHub if prompted — Johan).
4. Framework Preset should auto-detect **Next.js**; Root Directory `./`; leave build/output defaults.
5. **No environment variables** are needed yet — skip that section.
6. **Deploy.**

- [ ] **Step 3 (Johan): Set the Production Branch to `migration`**

In the new project: **Settings → Git → Production Branch** → set to `migration` → Save.
*Why:* `main` is still the old static site with no `package.json`; if Vercel built `main` as production it would fail. Pointing production at `migration` makes Vercel build the Next app. (At cutover in Stage 7 we set this back to `main`.)

- [ ] **Step 4: Trigger/confirm the deploy and open the URL**

If the project was created before Step 3's branch change, redeploy (Vercel **Deployments → ⋯ → Redeploy**, or push an empty commit: `git commit --allow-empty -m "chore: trigger Vercel build" && git push`).
Open the assigned `*.vercel.app` URL.
Expected: the placeholder landing page loads over HTTPS.

- [ ] **Step 5: Record the URL**

Note the live URL in the PR/notes for later stages. No commit needed.

---

## Acceptance criteria (Stage 1 done when all true)

- [ ] Empty Next.js app loads at its live `*.vercel.app` URL (HTTPS).
- [ ] `npm run build` passes locally; `npm test` is green.
- [ ] Static tool is intact in `legacy/` on `migration`, and `main` + the live GitHub Pages tool are untouched.
- [ ] Vercel production branch = `migration`; future pushes auto-deploy.

---

## Self-review (against spec §8 Step 1)

- **Scaffold create-next-app (App Router, TS):** Task 2. ✓
- **No Tailwind / src dir / `@/*` alias:** Task 2 Step 3 flags. ✓
- **Trivial placeholder landing:** Task 4. ✓
- **Deploy to Vercel + confirm round-trip:** Task 5. ✓
- **Vitest + one trivial passing test:** Task 3. ✓
- **`main` / live tool untouched:** Task 1 keeps work on `migration`, moves (not deletes) static files; Task 5 Step 3 protects against a failed `main` build. ✓
- **Placeholder scan:** no TBD/TODO; every code/command step shows exact content. ✓
- **Type/name consistency:** `APP_NAME` defined in `version.ts` and imported identically in `version.test.ts`. ✓
