# Stage 4: The Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`). No interactive/credential steps — all infra (Vercel, R2, Neon) is already in place. The visual review at the end is the only human touchpoint.

**Goal:** A working editor at `/` where you build per-platform multi-post mockups (live preview, on/off switches, image upload to R2) and click **Create review** to write a DB row and get an instant `/r/{id}` link.

**Architecture:** A client-rendered editor (`'use client'`) holding the same `state` shape as the legacy tool (`{campaign, account, handle, asanaTask, platforms}`) via `useReducer`. The **mockup rendering is ported faithfully** from `legacy/editor.html` (the `mock()` function + `MOCKUP_CSS` + icons + avatar) into a reusable `<Mockup>` component — this same component renders the public review page in Stage 5, so it's the foundation. Image upload reuses Stage 2's `uploadImage()`. "Create review" POSTs to a Zod-validated `/api/reviews` route that calls `createReview()` (Stage 3) and returns `{id}`; the client shows `${origin}/r/${id}`.

**Tech Stack:** Next.js 16 client components + route handler, React `useReducer`, the ported `MOCKUP_CSS` as a global stylesheet, Vitest + jsdom + Testing Library (new), Stage 2 `uploadImage`, Stage 3 `createReview`.

**Reference:** `legacy/editor.html` — `MOCKUP_CSS` (213-289), `ico`/`icoFill` (292-313), `AVATAR` (201), `state` (316-326), `mock()` (377-432), `parseTask` (342-349), body layout (122-192). Design §5 (reuse mockup rendering; same editor UX). The carousel/adaptive-copy belong to the **review page** (Stage 5), not here — the editor shows one selected post per platform via tabs.

## Scope (this stage) / Not in scope (later)

- **In:** Mockup component, `/api/reviews` create route, the editor page (inputs, per-platform cards with on/off + multi-post tabs + image upload + live preview, `copy→all`/`image→all`), create→link flow.
- **Not in (noted):** the public `/r/{id}` page itself (Stage 5 — the generated link 404s until then); the password gate (Stage 7); localStorage/DB **drafts** (Stage 7 polish — the editor does not autosave yet); the Asana decision flow (Stage 6).

---

## File structure after Stage 4

```
src/
├── app/
│   ├── layout.tsx              + imports global mockup.css
│   ├── page.tsx                REPLACED → the editor (client)
│   ├── globals? (none)
│   └── api/reviews/route.ts    POST → createReview → { id }
├── components/
│   ├── Mockup.tsx              <Mockup platform account handle post /> (ported mock())
│   ├── icons.tsx               ported ico()/icoFill() as React SVGs
│   ├── avatar.ts               AVATAR data URI constant
│   ├── PlatformCard.tsx        one editor card (switch, tabs, textarea, image, preview)
│   └── editor-state.ts         state shape + reducer + actions
├── lib/
│   ├── asana.ts                parseTask() (+ unit test)
│   └── review-input.ts         Zod schema for the create payload (+ unit test)
└── styles/mockup.css           MOCKUP_CSS, verbatim (global, single source of truth)
(removed: src/app/upload-test/page.tsx — superseded by the editor)
```

---

## Task 1: The `<Mockup>` component (foundation; reused in Stage 5)

**Files:** Create `src/styles/mockup.css`, `src/components/avatar.ts`, `src/components/icons.tsx`, `src/components/Mockup.tsx`, `src/components/Mockup.test.tsx`. Modify `src/app/layout.tsx`.

- [ ] **Step 1: Port `MOCKUP_CSS` → `src/styles/mockup.css` (verbatim)**

Copy the CSS strings from `legacy/editor.html:214-288` (the array elements of `MOCKUP_CSS`) into `src/styles/mockup.css` as plain CSS — one rule per line, unquoted, no `.join('')`. Keep every selector and value **byte-identical** (it's the tested source of truth shared with the review page). Do not add or rename classes.

- [ ] **Step 2: Import the stylesheet globally in `src/app/layout.tsx`**

Add `import '@/styles/mockup.css';` at the top of `layout.tsx` (global CSS must be imported in the layout in App Router). This makes `.mk`, `.slot`, etc. available app-wide.

- [ ] **Step 3: `src/components/avatar.ts`**

```ts
// Magisterium AI avatar, ported verbatim from legacy/editor.html:201.
export const AVATAR =
  'data:image/jpeg;base64,/9j/...'; // <- paste the FULL string from legacy/editor.html line 201
```
Copy the entire data URI from `legacy/editor.html:201` (the `var AVATAR = '...'` value).

- [ ] **Step 4: `src/components/icons.tsx` (port `ico`/`icoFill`)**

Port the icon path data from `legacy/editor.html:292-313` into a small React component. Two exports: `Icon({name, className})` (stroke icons: heart, chat, repost, shareup, plane, bookmark, thumb, globe, img) and `IconFill({name})` (filled: thumb, heart, dots). Each returns an `<svg>` identical to `ico()`/`icoFill()` output (viewBox `0 0 24 24`; stroke version uses `fill="none" stroke="currentColor" strokeWidth={1.7}` + `className={'ico' + (className ? ' ' + className : '')}`; fill version uses `fill="currentColor"` + `className="ico"`). Use the exact `<path>`/`<circle>` data from the source. Set `aria-hidden`.

- [ ] **Step 5: `src/components/Mockup.tsx` (port `mock()`)**

```tsx
import { AVATAR } from './avatar';
import { Icon, IconFill } from './icons';
import type { Post } from '@/db/schema';

type Platform = 'x' | 'ig' | 'fb' | 'li';

/** Render copy with the legacy nl2br behaviour (newlines → <br>). React escapes text. */
function Copy({ text, muted }: { text: string; muted: string }) {
  const t = (text || '').trim();
  if (!t) return <div className="txt mut">{muted}</div>;
  return (
    <div className="txt">
      {t.split('\n').map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </div>
  );
}

function Photo({ img }: { img: string | null }) {
  if (img)
    return (
      <div className="ph">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="Post image" />
      </div>
    );
  return (
    <div className="ph">
      <div className="ph-empty">
        <Icon name="img" />
        <span>1080 × 1350 image</span>
      </div>
    </div>
  );
}

export function Mockup({
  platform,
  account,
  handle,
  post,
}: {
  platform: Platform;
  account: string;
  handle: string;
  post: Post;
}) {
  // Port each branch of legacy mock() to JSX, 1:1 with the same classes/markup.
  // x | ig | fb | li — see legacy/editor.html:379-431.
  // (Full JSX written during implementation, matching the source exactly.)
  // ...
}
```
Write all four platform branches as JSX matching `legacy/editor.html:379-431` exactly (same classes, same static numbers like "312", "1,247 likes", "2h", action rows, etc.), using `<Icon>`/`<IconFill>`, `<Photo>`, `<Copy>`, `AVATAR`, and the `account`/`handle` props.

- [ ] **Step 6: Install jsdom + Testing Library (component tests)**

```bash
npm install -D jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 7: `src/components/Mockup.test.tsx` (TDD — write, watch fail, then the component makes it pass)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mockup } from './Mockup';

const post = { copy: 'Line one\nLine two', img: null, note: '' };

describe('Mockup', () => {
  it('renders the handle and copy for X', () => {
    render(<Mockup platform="x" account="Magisterium AI" handle="magisteriumai" post={post} />);
    expect(screen.getByText(/Magisterium AI/)).toBeTruthy();
    expect(screen.getByText(/Line one/)).toBeTruthy();
  });
  it('shows the empty-image placeholder when img is null', () => {
    const { container } = render(
      <Mockup platform="ig" account="A" handle="h" post={{ copy: '', img: null, note: '' }} />,
    );
    expect(container.querySelector('.ph-empty')).toBeTruthy();
  });
});
```
Run `npm test` → fails (no Mockup) → after Step 5 it passes. Add `import '@testing-library/jest-dom'` only if using its matchers; the above uses plain truthy checks so it's optional.

- [ ] **Step 8: Verify + commit**

`npm test` (green) and `npm run build` (passes). Then:
```bash
git add -A && git commit -m "feat: <Mockup> component + MOCKUP_CSS (ported from legacy editor)

Faithful port of mock()/MOCKUP_CSS/icons/avatar into a reusable RSC-safe
component. Global mockup.css is the single styling source (editor + review page).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `parseTask` util + create-review API route (TDD)

**Files:** Create `src/lib/asana.ts`, `src/lib/asana.test.ts`, `src/lib/review-input.ts`, `src/lib/review-input.test.ts`, `src/app/api/reviews/route.ts`.

- [ ] **Step 1: `src/lib/asana.ts` (port `parseTask`)**

```ts
/** Extract an Asana task gid from a pasted URL or bare id (ported from legacy parseTask). */
export function parseTask(input: string): string {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^\d{8,}$/.test(s)) return s;
  const m = s.match(/\/task\/(\d{8,})/);
  if (m) return m[1];
  const runs = s.split('?')[0].match(/\d{10,}/g);
  return runs ? runs[runs.length - 1] : '';
}
```

- [ ] **Step 2: `src/lib/asana.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseTask } from '@/lib/asana';

describe('parseTask', () => {
  it('returns a bare numeric id', () => expect(parseTask('1209888777666555')).toBe('1209888777666555'));
  it('extracts from a /task/ URL', () =>
    expect(parseTask('https://app.asana.com/1/15793206/project/1205550001112223/task/1209888777666555?focus=true')).toBe('1209888777666555'));
  it('falls back to the last long run of digits', () =>
    expect(parseTask('https://app.asana.com/0/1200000000000000/1209888777666555')).toBe('1209888777666555'));
  it('returns empty for junk', () => expect(parseTask('not a task')).toBe(''));
});
```

- [ ] **Step 3: `src/lib/review-input.ts` (Zod schema for the create payload)**

```ts
import { z } from 'zod';

const PostInput = z.object({
  copy: z.string(),
  img: z.string().url().nullable(),
  note: z.string(),
});
const PlatformInput = z.object({
  on: z.boolean(),
  cur: z.number().int().nonnegative(),
  posts: z.array(PostInput).min(1).max(6),
});

export const CreateReviewInput = z
  .object({
    campaign: z.string().trim().min(1),
    account: z.string().trim().min(1),
    handle: z.string().trim().min(1),
    asanaTaskGid: z.string().regex(/^\d{8,}$/),
    platforms: z.record(z.string(), PlatformInput),
  })
  .refine((v) => Object.values(v.platforms).some((p) => p.on), {
    message: 'At least one platform must be enabled',
  });

export type CreateReviewInput = z.infer<typeof CreateReviewInput>;
```

- [ ] **Step 4: `src/lib/review-input.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CreateReviewInput } from '@/lib/review-input';

const base = {
  campaign: 'Pentecost',
  account: 'Magisterium AI',
  handle: 'magisteriumai',
  asanaTaskGid: '1209888777666555',
  platforms: { x: { on: true, cur: 0, posts: [{ copy: 'hi', img: null, note: '' }] } },
};

describe('CreateReviewInput', () => {
  it('accepts a valid payload', () => expect(CreateReviewInput.safeParse(base).success).toBe(true));
  it('rejects an empty campaign', () =>
    expect(CreateReviewInput.safeParse({ ...base, campaign: '  ' }).success).toBe(false));
  it('rejects a bad task gid', () =>
    expect(CreateReviewInput.safeParse({ ...base, asanaTaskGid: '123' }).success).toBe(false));
  it('rejects when no platform is enabled', () =>
    expect(
      CreateReviewInput.safeParse({
        ...base,
        platforms: { x: { on: false, cur: 0, posts: [{ copy: '', img: null, note: '' }] } },
      }).success,
    ).toBe(false));
  it('rejects a non-url image', () =>
    expect(
      CreateReviewInput.safeParse({
        ...base,
        platforms: { x: { on: true, cur: 0, posts: [{ copy: '', img: 'not-a-url', note: '' }] } },
      }).success,
    ).toBe(false));
});
```

- [ ] **Step 5: Run tests (asana + review-input) — write tests first, confirm fail, then Steps 1/3 make them pass**

Run `npm test`. Order the work so each test is red before its module exists, then green after.

- [ ] **Step 6: `src/app/api/reviews/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { CreateReviewInput } from '@/lib/review-input';
import { createReview } from '@/db/reviews';

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = CreateReviewInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }

  const review = await createReview({
    campaign: parsed.data.campaign,
    account: parsed.data.account,
    handle: parsed.data.handle,
    asanaTaskGid: parsed.data.asanaTaskGid,
    platforms: parsed.data.platforms,
    // status defaults to 'pending'
  });

  return NextResponse.json({ id: review.id });
}
```

- [ ] **Step 7: Verify build + commit**

`npm run build` (route `ƒ /api/reviews` appears), `npm test` green. Then:
```bash
git add -A && git commit -m "feat: create-review API route + Zod input + parseTask

POST /api/reviews validates the editor payload (>=1 platform on, valid task
gid, image URLs) and writes a review row, returning { id }. parseTask ported.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The editor page

**Files:** Create `src/components/editor-state.ts`, `src/components/PlatformCard.tsx`. Replace `src/app/page.tsx`. Remove `src/app/upload-test/page.tsx`.

- [ ] **Step 1: `src/components/editor-state.ts` — state shape + reducer**

Define and export:
```ts
import type { Platforms, Post } from '@/db/schema';

export type PlatformId = 'x' | 'ig' | 'fb' | 'li';
export const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'ig', label: 'Instagram' },
  { id: 'fb', label: 'Facebook' },
  { id: 'li', label: 'LinkedIn' },
];
export const MAX_POSTS = 6;

export type EditorState = {
  campaign: string;
  account: string;
  handle: string;
  asanaTask: string; // raw input; gid parsed at submit
  platforms: Platforms; // keyed by PlatformId
};

export function newPost(): Post {
  return { copy: '', img: null, note: '' };
}

export function initialState(): EditorState {
  const p = {} as Platforms;
  for (const { id } of PLATFORMS) p[id] = { on: true, cur: 0, posts: [newPost()] };
  return { campaign: '', account: 'Magisterium AI', handle: 'magisteriumai', asanaTask: '', platforms: p };
}

export type Action =
  | { type: 'field'; key: 'campaign' | 'account' | 'handle' | 'asanaTask'; value: string }
  | { type: 'toggle'; id: PlatformId }
  | { type: 'addPost'; id: PlatformId }
  | { type: 'removePost'; id: PlatformId }
  | { type: 'selectPost'; id: PlatformId; index: number }
  | { type: 'setCopy'; id: PlatformId; value: string }
  | { type: 'setImage'; id: PlatformId; img: string | null; note: string }
  | { type: 'copyToAll' }
  | { type: 'imageToAll' };

export function reducer(s: EditorState, a: Action): EditorState { /* pure updates per action */ }
```
Implement `reducer` as pure immutable updates mirroring legacy `addPost`/`selectPost`/`removeCurPost`/`setImage` (respect `MAX_POSTS`; `removePost` only when >1 post; `copyToAll`/`imageToAll` copy the current post's field into every platform's current post). **Unit-test the reducer** in `editor-state.test.ts` (add post caps at 6; remove keeps ≥1; toggle flips `on`; copyToAll propagates). Run red→green.

- [ ] **Step 2: `src/components/PlatformCard.tsx`**

A card for one platform. Props: `{ platform: PlatformId; label: string; state: PlatformState; account: string; handle: string; dispatch }`. Renders:
- header: label + an on/off toggle (`<input type="checkbox" checked={state.on} onChange → dispatch toggle>`); when off, dim the card body (class `off`).
- numbered tab pills for posts (`state.posts.map`), a selected indicator (`state.cur`), a `+` to add (disabled at `MAX_POSTS`), a `−`/remove for the current (disabled when 1 post). Pills dispatch `selectPost`.
- a `<textarea>` bound to the current post's `copy` → dispatch `setCopy` (only when `on`).
- an image control: `<input type="file" accept="image/*">` → on change call `uploadImage(file)` (Stage 2), set a "uploading…" state, then dispatch `setImage({img: publicUrl, note: assessment})`; show the assessment note (ok/cropped/upscaled) and a small thumbnail.
- a **live `<Mockup platform account handle post={currentPost} />`** preview.
Keep styling simple and brand-consistent (near-black `#0e0d0b` chrome, gold `#c49d4d` accents, serif headings, system-sans UI) via inline styles or a small CSS module — the mockup itself is already styled by `mockup.css`.

- [ ] **Step 3: Replace `src/app/page.tsx` with the editor (`'use client'`)**

Top of file `'use client'`. Uses `useReducer(reducer, undefined, initialState)`. Renders:
- a brand header ("Social Approvals").
- the setup bar: Campaign / Account / Handle / Asana task link inputs (dispatch `field`); an Asana hint line driven by `parseTask(state.asanaTask)` (neutral/ok/bad like legacy `updateAsanaHint`).
- `copy → all` / `image → all` buttons (dispatch `copyToAll`/`imageToAll`).
- the 4 `<PlatformCard>`s (a responsive grid).
- a **Create review** button (gold) that: validates client-side (campaign non-empty, valid `parseTask`, ≥1 platform on — else inline message), builds the payload `{campaign, account, handle, asanaTaskGid: parseTask(asanaTask), platforms}`, POSTs to `/api/reviews`, and on success shows a success panel with the link `${window.location.origin}/r/${id}` + a **Copy link** button. Double-submit guarded with a busy flag.

- [ ] **Step 4: Remove the temporary upload-test page**

```bash
git rm src/app/upload-test/page.tsx
```
(The editor's image upload supersedes it. `scripts/verify-r2.mjs` stays for diagnostics.)

- [ ] **Step 5: Verify locally**

`npm run build` (passes; `/` is now dynamic/client). Then `npm run dev`, open `http://localhost:3000/`:
- type a campaign, paste an Asana URL (hint turns green), toggle a platform off (card dims), add a 2nd post on X (tab appears), type copy (preview updates), upload an image (crops, preview shows it).
- click **Create review** → success panel with a `/r/<id>` link. (That link 404s until Stage 5 — expected.)
Confirm the row with: `npx tsx scripts/verify-db.ts` is unrelated; instead check the new row was written (the success id) — optionally `node --env-file=.env.local` a quick `SELECT`. (Claude can drive the browser, or Johan eyeballs it.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: editor page (port) — cards, tabs, switches, image upload, create→link

useReducer state (legacy shape), PlatformCard with live Mockup preview and
R2 image upload, Create review -> POST /api/reviews -> /r/{id} link. Removes
the temporary upload-test page.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Deploy + end-to-end verify (with Johan's eyes)

- [ ] **Step 1: Deploy to production**

```bash
npx vercel@latest deploy --prod --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"
```
(Token is at `/tmp/sa-vercel-token`; if missing after a reboot, ask Johan for a fresh one — see memory `vercel-deploy-setup`.)

- [ ] **Step 2: Live end-to-end**

Open `https://social-approvals.vercel.app/`, build a quick review (a platform or two, an image), click **Create review**. Expect a `/r/<id>` link. Confirm the row landed by querying Neon (a `SELECT id, campaign, status FROM reviews ORDER BY created_at DESC LIMIT 3` via a one-off `tsx`/`--env-file` script) — the new id should be present with status `pending`.

- [ ] **Step 3 (Johan): Visual review**

Share the live editor URL with Johan to confirm it looks/feels right (it's a faithful port of his current editor). Capture any tweaks as follow-ups; small visual fixes can be folded in now, larger UX changes noted for Stage 7 polish.

---

## Acceptance criteria (Stage 4 done when all true)

- [ ] `/` is the editor: per-platform on/off, multi-post tabs (≤6), live `<Mockup>` preview, R2 image upload with off-ratio/upscale flagging.
- [ ] **Create review** writes a `reviews` row (status `pending`) and returns a `/r/{id}` link shown with a Copy button; double-submit guarded; ≥1-platform-enabled enforced client- and server-side.
- [ ] `<Mockup>` renders all 4 platforms from `mockup.css` (the single shared stylesheet).
- [ ] Tests green (Mockup, parseTask, review-input, editor-state reducer + prior); `npm run build` passes; deployed to prod; live create writes a real row.
- [ ] Temporary `/upload-test` removed. `main` + live static tool untouched.

## Self-review (against spec §5)

- **Reuse mockup rendering:** `<Mockup>` + `mockup.css` ported verbatim; reused by Stage 5. ✓
- **Same editor UX:** on/off switches, multi-post tabs, live preview, copy→all/image→all. ✓
- **Image pipeline reuse:** upload via Stage 2 `uploadImage` (crop→presign→PUT), flagging shown. ✓
- **Instant link (removes the rebuild step):** create writes a row + returns `/r/{id}` immediately. ✓
- **Retire bake/download/GitHub flow:** none of it ported; `generate()`/`REVIEW_TEMPLATE` left in `legacy/`. ✓
- **Public POST validated:** `CreateReviewInput` Zod + safeParse in the route. ✓
- **Deferred & noted:** drafts (Stage 7), auth gate (Stage 7), `/r/{id}` page (Stage 5), decision flow (Stage 6). ✓
- **Naming consistency:** `Mockup`, `PLATFORMS`, `EditorState`, `reducer`, `initialState`, `newPost`, `parseTask`, `CreateReviewInput`, `createReview`, `uploadImage` used identically across files. ✓
```
