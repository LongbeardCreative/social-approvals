# Stage 7: Auth Gate + Edit-in-Place (revision rounds) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. **Task 5 is interactive** (Johan picks the editor password). Build + unit-test the rest first. **No cutover this stage** — Johan chose to keep the old tool running in parallel, so we do NOT merge to main, delete `legacy/`, disable GitHub Pages, or delete the Worker. Those wait for a later explicit cutover.

**Goal:** Lock the editor behind a shared password (login → signed cookie), and let Johan reopen an existing review and save changes so the **same `/r/{id}` link updates** (revision rounds, the overwrite model) and resets to pending.

**Architecture:**
- **Auth** — `src/lib/auth.ts` signs a cookie = HMAC(`EDITOR_PASSWORD`) (Web Crypto, works in proxy + route runtimes). `src/proxy.ts` (Next 16's renamed middleware) does the *optimistic* redirect: unauthed requests to `/` and `/edit/*` go to `/login`. The **real enforcement** is an `isAuthed()` check inside the editor's mutating API routes (create, update, presign) → 401. Public routes (`/r/[id]`, the decision endpoint, `/login`, `/api/login`) are never gated.
- **Edit-in-place** — extract the editor UI into `<Editor initial? reviewId?>`. `/` renders create mode; a new RSC `/edit/[id]` loads the row and renders edit mode. Saving in edit mode `PUT`s to `/api/reviews/[id]`, which updates the row and resets `status → pending` — so Matthew's existing link shows the new set. The create success panel links to `/edit/{id}` so Johan can find it again.

**Tech Stack:** Next 16 Proxy (`proxy.ts`), Web Crypto HMAC, Zod, Drizzle update, Vitest.

**Reference:** bundled Next 16 docs `01-getting-started/16-proxy.md` (proxy convention; proxy is optimistic, enforce in the route). Design §7.2 (shared password), §7.4 (overwrite revision model). README §"Revision rounds" (same link updates — the behaviour to preserve).

## Env (set in `.env.local` + Vercel)

| Name | Notes |
|------|-------|
| `EDITOR_PASSWORD` | the shared password to use the editor; Johan picks it (Task 5). When unset, the editor is **locked** (fail-closed). |

---

## File structure after Stage 7

```
src/
├── proxy.ts                              optimistic gate for / and /edit/*
├── lib/auth.ts (+ auth.test.ts)          HMAC cookie sign/verify, checkPassword, isAuthed
├── app/
│   ├── login/page.tsx                    password form (client)
│   ├── api/login/route.ts                POST password → set cookie
│   ├── api/logout/route.ts               POST → clear cookie
│   ├── page.tsx                          → <Editor /> (create mode)
│   ├── edit/[id]/page.tsx                RSC: load row → <Editor initial reviewId> (edit mode)
│   └── api/reviews/[id]/route.ts         PUT update (gated) → reset to pending
├── components/Editor.tsx                 extracted editor (create + edit modes)
└── db/reviews.ts                         + updateReview()
```

---

## Task 1: Auth lib (`src/lib/auth.ts`) + tests

- [ ] **Step 1: `src/lib/auth.ts`**

```ts
export const SESSION_COOKIE = 'sa_session';
const PAYLOAD = 'sa-authed-v1';

async function hmacHex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** The cookie value proving the password was entered (changes if the password changes). */
export async function sessionToken(): Promise<string> {
  return hmacHex(PAYLOAD, process.env.EDITOR_PASSWORD ?? '');
}

/** Constant-time check of an entered password against EDITOR_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = process.env.EDITOR_PASSWORD;
  return pw ? timingSafeEqual(input, pw) : false;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** True when the request carries a valid session cookie. Fail-closed if EDITOR_PASSWORD unset. */
export async function isAuthed(req: Request): Promise<boolean> {
  if (!process.env.EDITOR_PASSWORD) return false;
  const token = parseCookie(req.headers.get('cookie'), SESSION_COOKIE);
  return token ? timingSafeEqual(token, await sessionToken()) : false;
}
```

- [ ] **Step 2: `src/lib/auth.test.ts`**

```ts
import { afterEach, describe, it, expect } from 'vitest';
import { checkPassword, isAuthed, sessionToken, SESSION_COOKIE } from '@/lib/auth';

const orig = process.env.EDITOR_PASSWORD;
afterEach(() => {
  process.env.EDITOR_PASSWORD = orig;
});

describe('auth', () => {
  it('checkPassword: constant-time match', () => {
    process.env.EDITOR_PASSWORD = 'hunter2';
    expect(checkPassword('hunter2')).toBe(true);
    expect(checkPassword('nope')).toBe(false);
  });
  it('checkPassword: false when no password configured', () => {
    delete process.env.EDITOR_PASSWORD;
    expect(checkPassword('anything')).toBe(false);
  });
  it('isAuthed: accepts a valid session cookie, rejects junk/none', async () => {
    process.env.EDITOR_PASSWORD = 'hunter2';
    const token = await sessionToken();
    const ok = new Request('https://x/', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    const bad = new Request('https://x/', { headers: { cookie: `${SESSION_COOKIE}=tampered` } });
    const none = new Request('https://x/');
    expect(await isAuthed(ok)).toBe(true);
    expect(await isAuthed(bad)).toBe(false);
    expect(await isAuthed(none)).toBe(false);
  });
  it('isAuthed: fail-closed when EDITOR_PASSWORD unset', async () => {
    process.env.EDITOR_PASSWORD = 'hunter2';
    const token = await sessionToken();
    delete process.env.EDITOR_PASSWORD;
    const req = new Request('https://x/', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect(await isAuthed(req)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests (red→green), commit.**

---

## Task 2: Login + logout + proxy gate

**Files:** `src/app/api/login/route.ts`, `src/app/api/logout/route.ts`, `src/app/login/page.tsx`, `src/proxy.ts`.

- [ ] **Step 1: `src/app/api/login/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPassword, sessionToken, SESSION_COOKIE } from '@/lib/auth';

const Body = z.object({ password: z.string() });

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  if (!checkPassword(parsed.data.password)) {
    return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
```

- [ ] **Step 2: `src/app/api/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
```

- [ ] **Step 3: `src/app/login/page.tsx`** — a minimal client form, styled with the editor module (dark): password input + Sign in; on submit POST `/api/login`; on ok, `window.location.assign(next || '/')`; on 401 show "Wrong password". Read `next` from `useSearchParams()`. (Use `s.page`/`s.wrap`/`s.bar`/`s.field`/`s.input`/`s.btn`/`s.btnGold`/`s.errorMsg` from `editor.module.css` so it matches the dark look.)

- [ ] **Step 4: `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  if (await isAuthed(request)) return NextResponse.next();
  const url = new URL('/login', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/', '/edit/:path*'] };
```

- [ ] **Step 5:** Build; commit. (Can't fully verify the redirect until `EDITOR_PASSWORD` is set in Task 5 — but build must pass and the proxy must compile.)

---

## Task 3: Enforce auth in the editor APIs + the update endpoint

**Files:** modify `src/app/api/reviews/route.ts`, `src/app/api/uploads/presign/route.ts`; add `updateReview()` to `src/db/reviews.ts`; create `src/app/api/reviews/[id]/route.ts` (PUT).

- [ ] **Step 1: Gate create + presign.** At the top of `POST` in `src/app/api/reviews/route.ts` and `src/app/api/uploads/presign/route.ts`, add:
```ts
import { isAuthed } from '@/lib/auth';
// ... first line of POST:
if (!(await isAuthed(request))) {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
```
(Do **not** add this to `/api/reviews/[id]/decision` — reviewers are unauthenticated.)

- [ ] **Step 2: `updateReview()` in `src/db/reviews.ts`**

```ts
/** Overwrite a review's content and reset it to pending (a new revision round). */
export async function updateReview(
  id: string,
  data: Omit<NewReview, 'id'>,
): Promise<Review | null> {
  const [row] = await getDb()
    .update(reviews)
    .set({
      campaign: data.campaign,
      account: data.account,
      handle: data.handle,
      asanaTaskGid: data.asanaTaskGid,
      platforms: data.platforms,
      status: 'pending',
      decisionNotes: null,
      decidedAt: null,
    })
    .where(eq(reviews.id, id))
    .returning();
  return row ?? null;
}
```

- [ ] **Step 3: `src/app/api/reviews/[id]/route.ts` (PUT, gated)**

```ts
import { NextResponse } from 'next/server';
import { CreateReviewInput } from '@/lib/review-input';
import { updateReview } from '@/db/reviews';
import { isAuthed } from '@/lib/auth';

export async function PUT(request: Request, ctx: RouteContext<'/api/reviews/[id]'>) {
  if (!(await isAuthed(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = CreateReviewInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const updated = await updateReview(id, parsed.data);
  if (!updated) return NextResponse.json({ error: 'review not found' }, { status: 404 });
  return NextResponse.json({ id: updated.id });
}
```

- [ ] **Step 4:** Build (`ƒ /api/reviews/[id]` PUT appears); commit.

---

## Task 4: Extract `<Editor>` (create + edit modes) + `/edit/[id]`

**Files:** create `src/components/Editor.tsx`; rewrite `src/app/page.tsx` to render it; create `src/app/edit/[id]/page.tsx`.

- [ ] **Step 1: `src/components/Editor.tsx`** — move the entire current `page.tsx` editor body here as `export function Editor({ initial, reviewId }: { initial?: EditorState; reviewId?: string })`. Changes vs the current page:
  - `const [state, dispatch] = useReducer(reducer, initial ?? initialState());`
  - The submit function: if `reviewId`, `PUT /api/reviews/${reviewId}` and on success set a "saved" state (the link is `/r/${reviewId}`, unchanged); else `POST /api/reviews` (create) as today.
  - Button label: `reviewId ? (busy ? 'Saving…' : 'Save changes') : (busy ? 'Generating…' : 'Generate review page')`.
  - Success panel:
    - create: as today (show `/r/{id}` link + Copy) **plus** an "Edit this review" link to `/edit/{id}`.
    - edit: heading "Saved — the existing link is updated", show the `/r/{reviewId}` link + Copy (no new link).
  - `import { type EditorState, initialState, reducer, PLATFORMS } from './editor-state';`

- [ ] **Step 2: `src/app/page.tsx`** → thin client wrapper:
```tsx
'use client';
import { Editor } from '@/components/Editor';
export default function NewReviewPage() {
  return <Editor />;
}
```

- [ ] **Step 3: `src/app/edit/[id]/page.tsx` (RSC, gated by proxy)**

```tsx
import { notFound } from 'next/navigation';
import { getReviewById } from '@/db/reviews';
import { Editor } from '@/components/Editor';
import type { EditorState } from '@/components/editor-state';

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getReviewById(id);
  if (!review) notFound();
  const initial: EditorState = {
    campaign: review.campaign,
    account: review.account,
    handle: review.handle,
    asanaTask: review.asanaTaskGid,
    platforms: review.platforms,
  };
  return <Editor initial={initial} reviewId={review.id} />;
}
```

- [ ] **Step 4:** Build (`/edit/[id]` dynamic route appears) + `npm test`; verify locally with the preview tools (create → success panel shows an "Edit this review" link; open `/edit/{id}` → editor pre-filled; change copy → Save → same `/r/{id}` shows the update; `markReviewDecided` earlier means status resets to pending on save). Commit.

---

## Task 5: `EDITOR_PASSWORD` ⚠️ INTERACTIVE + docs + deploy + verify

- [ ] **Step 1 (Johan): Pick a shared editor password.** Claude adds `EDITOR_PASSWORD` to `.env.local` + Vercel (piped `vercel env add`).
- [ ] **Step 2: Docs.** Add a new top-level `README.md` describing the **app** (log in → create/edit review → instant link → Asana). Keep the old static-tool README at `legacy/README-static.md`. Note the Worker is superseded (retire at cutover). (Do **not** remove legacy files — parallel run.)
- [ ] **Step 3: Deploy** `--prod`.
- [ ] **Step 4: Verify live:**
  - Logged out (incognito): visiting `/` redirects to `/login`; `POST /api/reviews` returns 401; **but** `/r/{id}` loads and the decision endpoint still works (reviewers unaffected).
  - Log in with the password → `/` loads; create a review; open `/edit/{id}`, change it, Save → the `/r/{id}` link shows the update and is back to "pending"; a fresh decision posts to Asana.
  - Screenshot the login + the gated editor (preview/Chrome tools).
- [ ] **Step 5 (Johan): Visual + flow check.** Push `migration`.

---

## Acceptance criteria (Stage 7 done when all true)

- [ ] Editor (`/`, `/edit/*`) requires the password: logged-out → redirect to `/login`; the create/update/presign APIs return 401 without the cookie. Login sets a signed httpOnly cookie; logout clears it.
- [ ] `/r/[id]` + the decision endpoint remain fully public (reviewers unaffected).
- [ ] Reopening `/edit/{id}`, changing, and saving updates the **same** `/r/{id}` and resets it to pending (revision round). Create success panel links to `/edit/{id}`.
- [ ] Fail-closed: with `EDITOR_PASSWORD` unset the editor is locked.
- [ ] Tests green; build passes; deployed. **Old tool left running in parallel — no cutover.**

## Self-review (against design §7 + Johan's choices)

- **Shared-password gate, reviewers public:** proxy (optimistic) + `isAuthed` enforcement in editor APIs; `/r/[id]` + decision ungated. ✓
- **Next 16 Proxy (not middleware):** `src/proxy.ts`, `export function proxy`, `config.matcher`. ✓
- **Edit-in-place / same link updates (overwrite):** `PUT /api/reviews/[id]` + `updateReview` resets to pending; `/edit/[id]` loads the row. ✓
- **No cutover (parallel run):** legacy/, main, Pages, Worker all untouched; only docs add the new README. ✓
- **Secrets:** `EDITOR_PASSWORD` in env only; never committed. (End-of-project: rotate all shared secrets — separate wrap-up.) ✓
- **Naming:** `isAuthed`, `sessionToken`, `checkPassword`, `SESSION_COOKIE`, `updateReview`, `Editor`, `CreateReviewInput` consistent. ✓
```
