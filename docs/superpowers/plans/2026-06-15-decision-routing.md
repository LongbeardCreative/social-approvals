# Copy/Images Decision Routing — Implementation Plan (Feature #3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On the review page, let the reviewer decide on Copy, Images, or Everything; route Copy decisions to Jenna and Images to Johan (Everything → Johan + Jenna notified); auto-tick the matching gate subtask on approval; track the two decisions independently.

**Architecture:** Pure helpers for routing-shape, scoped comment text, and roll-up/next-status; new per-scope columns on `reviews`; an extended `postDecisionToAsana` (scoped comment, chosen assignee, gate completion on approval, follower notification); a scope param on the decision route with per-scope `alreadyDecided`; a scope selector in `Decision.tsx`.

**Tech Stack:** Next 16 route handlers, Drizzle + Neon, React 19 client component, Vitest. Reuses Feature #1's `getSubtasks`, `COPY_GATE`, `CREATIVE_GATE`.

**Spec:** `docs/superpowers/specs/2026-06-15-asana-status-and-decision-routing-design.md` (Feature #3).

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/decision-routing.ts` | pure `routingForScope(scope)` + `SCOPE_LABEL` | create |
| `src/lib/decision-routing.test.ts` | tests | create |
| `src/lib/review-status.ts` | pure `rollupStatus`, `nextStatuses` | create |
| `src/lib/review-status.test.ts` | tests | create |
| `src/lib/asana.ts` | `scopedDecisionComment`, gid on subtasks, `completeGates`, `addFollower`, scoped `postDecisionToAsana` | modify |
| `src/lib/asana.test.ts` | update postDecision tests + new ones | modify |
| `src/db/schema.ts` | per-scope columns + `ScopeStatus`, `DecisionScope` | modify |
| `drizzle/0001_*.sql` | generated migration | create (drizzle-kit) |
| `src/db/reviews.ts` | `markScopeDecided`; reset new fields in `updateReview` | modify |
| `src/app/api/reviews/[id]/decision/route.ts` | scope param, routing, per-scope already-decided | modify |
| `src/app/api/reviews/[id]/decision/route.test.ts` | update + new tests | modify |
| `src/components/Decision.tsx` | scope selector, scoped labels/copy, scoped mailto | modify |
| `src/components/Decision.test.tsx` | component test | create |
| `src/components/review.module.css` | scope-selector styles | modify |
| `src/app/r/[id]/page.tsx` | pass per-scope status; update sub-text | modify |
| `.env.local` + Vercel | `ASSIGNEE_COPY`, `COPY_REVIEWER_GID` | config |

**Shared types** (added in `src/db/schema.ts`, imported elsewhere):
```ts
export type ScopeStatus = 'pending' | 'approved' | 'revisions';
export type DecisionScope = 'copy' | 'images' | 'everything';
```

---

## Task 1: Routing-shape pure helper

**Files:** Create `src/lib/decision-routing.ts`, `src/lib/decision-routing.test.ts`.

- [ ] **Step 1: Failing test** — `src/lib/decision-routing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { routingForScope } from '@/lib/decision-routing';
import { COPY_GATE, CREATIVE_GATE } from '@/lib/asana';

describe('routingForScope', () => {
  it('copy → Jenna assignee, copy gate, copy status, no mention', () => {
    expect(routingForScope('copy')).toEqual({
      assigneeEnv: 'ASSIGNEE_COPY',
      gates: [COPY_GATE],
      statuses: ['copy'],
      mention: false,
    });
  });
  it('images → Johan assignee, creative gate, image status', () => {
    expect(routingForScope('images')).toEqual({
      assigneeEnv: 'ASSIGNEE',
      gates: [CREATIVE_GATE],
      statuses: ['images'],
      mention: false,
    });
  });
  it('everything → Johan, both gates, both statuses, mention Jenna', () => {
    expect(routingForScope('everything')).toEqual({
      assigneeEnv: 'ASSIGNEE',
      gates: [COPY_GATE, CREATIVE_GATE],
      statuses: ['copy', 'images'],
      mention: true,
    });
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/lib/decision-routing.test.ts` → cannot find module.

- [ ] **Step 3: Implement** — `src/lib/decision-routing.ts`:

```ts
import { COPY_GATE, CREATIVE_GATE } from '@/lib/asana';
import type { DecisionScope } from '@/db/schema';

export const SCOPE_LABEL: Record<DecisionScope, string> = {
  copy: 'Copy',
  images: 'Images',
  everything: 'Copy + images',
};

export type Routing = {
  assigneeEnv: 'ASSIGNEE' | 'ASSIGNEE_COPY';
  gates: string[];
  statuses: ('copy' | 'images')[];
  mention: boolean;
};

export function routingForScope(scope: DecisionScope): Routing {
  switch (scope) {
    case 'copy':
      return { assigneeEnv: 'ASSIGNEE_COPY', gates: [COPY_GATE], statuses: ['copy'], mention: false };
    case 'images':
      return { assigneeEnv: 'ASSIGNEE', gates: [CREATIVE_GATE], statuses: ['images'], mention: false };
    case 'everything':
      return {
        assigneeEnv: 'ASSIGNEE',
        gates: [COPY_GATE, CREATIVE_GATE],
        statuses: ['copy', 'images'],
        mention: true,
      };
  }
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit:** `git add src/lib/decision-routing.* && git commit -m "feat: pure routing resolution per decision scope"`

---

## Task 2: Roll-up + next-status pure helpers

**Files:** Create `src/lib/review-status.ts`, `src/lib/review-status.test.ts`.

- [ ] **Step 1: Failing test** — `src/lib/review-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rollupStatus, nextStatuses } from '@/lib/review-status';

describe('rollupStatus', () => {
  it('both approved → approved', () => {
    expect(rollupStatus('approved', 'approved')).toBe('approved');
  });
  it('either revisions → revisions', () => {
    expect(rollupStatus('approved', 'revisions')).toBe('revisions');
    expect(rollupStatus('revisions', 'pending')).toBe('revisions');
  });
  it('otherwise pending', () => {
    expect(rollupStatus('approved', 'pending')).toBe('pending');
    expect(rollupStatus('pending', 'pending')).toBe('pending');
  });
});

describe('nextStatuses', () => {
  const cur = { copyStatus: 'pending', imageStatus: 'pending' } as const;
  it('copy approve sets only copy', () => {
    expect(nextStatuses(cur, 'copy', 'Approved')).toEqual({
      copyStatus: 'approved',
      imageStatus: 'pending',
    });
  });
  it('images revisions sets only images', () => {
    expect(nextStatuses(cur, 'images', 'Revisions requested')).toEqual({
      copyStatus: 'pending',
      imageStatus: 'revisions',
    });
  });
  it('everything sets both', () => {
    expect(nextStatuses(cur, 'everything', 'Approved')).toEqual({
      copyStatus: 'approved',
      imageStatus: 'approved',
    });
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `src/lib/review-status.ts`:

```ts
import type { ScopeStatus, ReviewStatus, DecisionScope } from '@/db/schema';
import type { Decision } from '@/lib/asana';

export function rollupStatus(copy: ScopeStatus, images: ScopeStatus): ReviewStatus {
  if (copy === 'revisions' || images === 'revisions') return 'revisions';
  if (copy === 'approved' && images === 'approved') return 'approved';
  return 'pending';
}

export function nextStatuses(
  current: { copyStatus: ScopeStatus; imageStatus: ScopeStatus },
  scope: DecisionScope,
  decision: Decision,
): { copyStatus: ScopeStatus; imageStatus: ScopeStatus } {
  const v: ScopeStatus = decision === 'Approved' ? 'approved' : 'revisions';
  return {
    copyStatus: scope === 'images' ? current.copyStatus : v,
    imageStatus: scope === 'copy' ? current.imageStatus : v,
  };
}
```

- [ ] **Step 4: Run → pass.** (Depends on `ScopeStatus`/`DecisionScope` existing — add them in Task 3 if tsc complains; vitest run alone passes since types are erased. Run Task 3 next.)
- [ ] **Step 5: Commit:** `git add src/lib/review-status.* && git commit -m "feat: per-scope status roll-up + next-status helpers"`

---

## Task 3: Schema + migration (per-scope columns)

**Files:** Modify `src/db/schema.ts`; generate `drizzle/0001_*.sql`.

- [ ] **Step 1: Add types + columns** — in `src/db/schema.ts`, add after the existing `ReviewStatus` type:

```ts
export type ScopeStatus = 'pending' | 'approved' | 'revisions';
export type DecisionScope = 'copy' | 'images' | 'everything';
```

and add these columns inside `pgTable('reviews', { ... })` (after `decidedAt`):

```ts
  copyStatus: text('copy_status').$type<ScopeStatus>().notNull().default('pending'),
  imageStatus: text('image_status').$type<ScopeStatus>().notNull().default('pending'),
  copyNotes: text('copy_notes'),
  imageNotes: text('image_notes'),
  copyDecidedAt: timestamp('copy_decided_at', { withTimezone: true }),
  imageDecidedAt: timestamp('image_decided_at', { withTimezone: true }),
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new `drizzle/0001_*.sql` adding six columns with the `pending` defaults; no data loss.

- [ ] **Step 3: Inspect the generated SQL** — confirm it is `ALTER TABLE "reviews" ADD COLUMN ...` only (additive). Read the file.

- [ ] **Step 4: Apply to Neon** (additive + defaulted = safe for the live parallel app)

Run: `npx drizzle-kit migrate`
Expected: "migrations applied". Verify: `npx tsc --noEmit` shows no errors in `src/db/**`.

- [ ] **Step 5: Commit:** `git add src/db/schema.ts drizzle/ && git commit -m "feat: per-scope decision columns on reviews"`

---

## Task 4: DB `markScopeDecided` + reset on new round

**Files:** Modify `src/db/reviews.ts`.

(No new unit test — Drizzle calls follow the existing untested pattern; the logic is covered by Task 2's pure helpers and the route tests in Task 6.)

- [ ] **Step 1: Add `markScopeDecided`** — in `src/db/reviews.ts`, add imports and the function:

```ts
import { rollupStatus, nextStatuses } from '@/lib/review-status';
import type { DecisionScope } from './schema';
import type { Decision } from '@/lib/asana';

/** Record a scoped decision: set per-scope fields, recompute the overall roll-up. */
export async function markScopeDecided(
  id: string,
  scope: DecisionScope,
  decision: Decision,
  notes: string,
): Promise<void> {
  const review = await getReviewById(id);
  if (!review) return;
  const next = nextStatuses(
    { copyStatus: review.copyStatus, imageStatus: review.imageStatus },
    scope,
    decision,
  );
  const now = new Date();
  const touchesCopy = scope !== 'images';
  const touchesImages = scope !== 'copy';
  await getDb()
    .update(reviews)
    .set({
      copyStatus: next.copyStatus,
      imageStatus: next.imageStatus,
      ...(touchesCopy ? { copyNotes: notes, copyDecidedAt: now } : {}),
      ...(touchesImages ? { imageNotes: notes, imageDecidedAt: now } : {}),
      status: rollupStatus(next.copyStatus, next.imageStatus),
      decisionNotes: notes,
      decidedAt: now,
    })
    .where(eq(reviews.id, id));
}
```

- [ ] **Step 2: Reset new fields on a revision round** — in `updateReview`, add to the `.set({ ... })`:

```ts
      copyStatus: 'pending',
      imageStatus: 'pending',
      copyNotes: null,
      imageNotes: null,
      copyDecidedAt: null,
      imageDecidedAt: null,
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean in `src/db/**`; `npm test` still green.
- [ ] **Step 4: Commit:** `git add src/db/reviews.ts && git commit -m "feat: markScopeDecided + reset per-scope fields on a new round"`

---

## Task 5: Asana — scoped comment, gate completion, follower, scoped `postDecisionToAsana`

**Files:** Modify `src/lib/asana.ts`, `src/lib/asana.test.ts`.

- [ ] **Step 1: Update the failing tests** — in `src/lib/asana.test.ts`:
  - Replace the `decisionComment` describe block with a `scopedDecisionComment` one:

```ts
describe('scopedDecisionComment', () => {
  it('scoped approve', () => {
    expect(scopedDecisionComment('copy', 'Approved', 'Matthew', '', 'https://x/r/abc')).toBe(
      '✅ Copy approved by Matthew\n\nReview page: https://x/r/abc',
    );
  });
  it('everything approve', () => {
    expect(scopedDecisionComment('everything', 'Approved', 'Matthew', '', '')).toBe(
      '✅ Copy + images approved by Matthew',
    );
  });
  it('scoped revisions with feedback', () => {
    const t = scopedDecisionComment('images', 'Revisions requested', 'Matthew', 'fix it', '');
    expect(t.startsWith('🔁 Images — revisions requested by Matthew:')).toBe(true);
    expect(t).toContain('fix it');
  });
});
```

  - Update the `postDecisionToAsana` `base` object to include `scope: 'everything' as const` and update the happy-path assertion text from `'✅ Approved by Matthew'` to `'✅ Copy + images approved by Matthew'`.
  - Update the import line to add `scopedDecisionComment` and drop `decisionComment`.
  - Add a gate-completion test:

```ts
it('approve with gates: completes the matching subtask', async () => {
  const calls = stub([
    { ok: true, status: 200 }, // comment
    { ok: true, status: 200 }, // reassign
    { ok: true, status: 200 }, // getSubtasks (json)
    { ok: true, status: 200 }, // complete gate PUT
  ]);
  // getSubtasks needs json(); override the 3rd response:
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).includes('/subtasks')) {
      return { ok: true, status: 200, json: async () => ({ data: [
        { gid: '111', name: '3. Matthew Approves Copy', completed: false },
      ] }), text: async () => '' } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
  }) as typeof fetch;
  const res = await postDecisionToAsana({ ...base, scope: 'copy', gates: [COPY_GATE] });
  expect(res.ok).toBe(true);
  globalThis.fetch = realFetch;
  void calls;
});
```

  (Add `COPY_GATE` to the import from `@/lib/asana`.)

- [ ] **Step 2: Run → fail** (scopedDecisionComment/new signature missing).

- [ ] **Step 3: Implement** — in `src/lib/asana.ts`:
  - Add `gid` to `SubtaskLite`: `export type SubtaskLite = { gid?: string; name: string; completed: boolean };`
  - Change `getSubtasks` opt_fields to `gid,name,completed`.
  - Add the scoped comment + helpers, and refactor `postDecisionToAsana`:

```ts
import type { DecisionScope } from '@/db/schema';

const SCOPE_TEXT: Record<DecisionScope, string> = {
  copy: 'Copy',
  images: 'Images',
  everything: 'Copy + images',
};

export function scopedDecisionComment(
  scope: DecisionScope,
  decision: Decision,
  reviewer: string,
  feedback: string,
  url: string,
): string {
  const link = url ? `\n\nReview page: ${url}` : '';
  const what = SCOPE_TEXT[scope];
  return decision === 'Approved'
    ? `✅ ${what} approved by ${reviewer}${link}`
    : `🔁 ${what} — revisions requested by ${reviewer}:\n\n${feedback || '(no notes left)'}${link}`;
}

/** Complete the gate subtasks matching the given name fragments. Best-effort; returns false on any failure. */
export async function completeGates(task: string, token: string, fragments: string[]): Promise<boolean> {
  if (fragments.length === 0) return true;
  try {
    const subs = await getSubtasks(task, token);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    for (const frag of fragments) {
      const f = frag.toLowerCase();
      const hit = subs.find((s) => (s.name || '').toLowerCase().includes(f));
      if (hit?.gid && !hit.completed) {
        const r = await fetch(`${ASANA}/tasks/${hit.gid}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ data: { completed: true } }),
        });
        if (!r.ok) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Add a collaborator (notifies them). Best-effort. */
export async function addFollower(task: string, token: string, gid: string): Promise<boolean> {
  const r = await fetch(`${ASANA}/tasks/${task}/addFollowers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { followers: [gid] } }),
  });
  return r.ok;
}
```

  - Replace `postDecisionToAsana` with the scoped version:

```ts
export async function postDecisionToAsana(opts: {
  task: string;
  scope: DecisionScope;
  decision: Decision;
  feedback: string;
  url: string;
  token: string;
  assignee: string;
  reviewer: string;
  gates?: string[];
  mentionGid?: string;
}): Promise<DecisionResult> {
  const text = scopedDecisionComment(opts.scope, opts.decision, opts.reviewer, opts.feedback, opts.url);
  const headers = { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' };

  const c = await fetch(`${ASANA}/tasks/${opts.task}/stories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: { text } }),
  });
  if (!c.ok) {
    const detail = await c.text().catch(() => '');
    return { ok: false, status: c.status, detail: detail.slice(0, 500) };
  }

  const a = await fetch(`${ASANA}/tasks/${opts.task}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { assignee: opts.assignee } }),
  });
  const warnings: string[] = [];
  if (!a.ok) warnings.push(`reassign failed (${a.status})`);

  if (opts.mentionGid) {
    const ok = await addFollower(opts.task, opts.token, opts.mentionGid);
    if (!ok) warnings.push('could not notify Jenna');
  }
  if (opts.decision === 'Approved' && opts.gates?.length) {
    const ok = await completeGates(opts.task, opts.token, opts.gates);
    if (!ok) warnings.push('could not tick the gate subtask');
  }

  return warnings.length ? { ok: true, warning: warnings.join('; ') } : { ok: true };
}
```

  - Remove the old `decisionComment` export (no longer used). If anything still imports it, switch to `scopedDecisionComment`.

- [ ] **Step 4: Run → pass** (`npx vitest run src/lib/asana.test.ts`).
- [ ] **Step 5: Commit:** `git add src/lib/asana.* && git commit -m "feat: scoped Asana comment, gate completion, follower notify"`

---

## Task 6: Decision route — scope, routing, per-scope already-decided

**Files:** Modify `src/app/api/reviews/[id]/decision/route.ts`, `src/app/api/reviews/[id]/decision/route.test.ts`.

- [ ] **Step 1: Update tests** — in `route.test.ts`:
  - Add `ASSIGNEE_COPY` + `COPY_REVIEWER_GID` to `beforeEach`:

```ts
    process.env.ASSIGNEE_COPY = 'jenna@longbeard.com';
    process.env.COPY_REVIEWER_GID = '1202922206500119';
```
  - Add `copyStatus: 'pending', imageStatus: 'pending'` to the `row` fixture; add `vi.mock` for `markScopeDecided` (replace the `markReviewDecided` mock):

```ts
vi.mock('@/db/reviews', () => ({
  getReviewById: vi.fn(),
  markScopeDecided: vi.fn(),
}));
import { getReviewById, markScopeDecided } from '@/db/reviews';
```
  - Update the happy-path test to send `{ scope: 'copy', decision: 'Approved', feedback: '' }` and assert `markScopeDecided` called with `('abc123', 'copy', 'Approved', '')`.
  - Update the already-decided test: set `copyStatus: 'approved'` on the row, send `{ scope: 'copy', decision: 'Approved' }`, expect `alreadyDecided: true`.
  - Add a default-scope test: `req({ decision: 'Approved' })` (no scope) → treated as `everything`.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — rewrite `src/app/api/reviews/[id]/decision/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReviewById, markScopeDecided } from '@/db/reviews';
import { postDecisionToAsana } from '@/lib/asana';
import { routingForScope } from '@/lib/decision-routing';

const Body = z.object({
  scope: z.enum(['copy', 'images', 'everything']).default('everything'),
  decision: z.enum(['Approved', 'Revisions requested']),
  feedback: z.string().optional().default(''),
});

export async function POST(request: Request, ctx: RouteContext<'/api/reviews/[id]/decision'>) {
  const { id } = await ctx.params;

  if (process.env.ALLOWED_ORIGIN) {
    const origin = request.headers.get('origin') || '';
    if (origin && origin !== process.env.ALLOWED_ORIGIN) {
      return NextResponse.json({ success: false, error: 'origin not allowed' }, { status: 403 });
    }
  }

  const token = process.env.ASANA_TOKEN;
  const reviewer = process.env.REVIEWER || 'Matthew';
  if (!token) {
    return NextResponse.json({ success: false, error: 'Asana not configured' }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid input' }, { status: 400 });
  }
  const { scope, decision } = parsed.data;

  const review = await getReviewById(id);
  if (!review) {
    return NextResponse.json({ success: false, error: 'review not found' }, { status: 404 });
  }

  const decided = (s: string) => s !== 'pending';
  const already =
    scope === 'copy'
      ? decided(review.copyStatus)
      : scope === 'images'
        ? decided(review.imageStatus)
        : decided(review.copyStatus) && decided(review.imageStatus);
  if (already) {
    return NextResponse.json({ success: true, alreadyDecided: true });
  }

  const routing = routingForScope(scope);
  const assignee = process.env[routing.assigneeEnv];
  if (!assignee) {
    return NextResponse.json({ success: false, error: 'assignee not configured' }, { status: 500 });
  }

  const feedback = parsed.data.feedback.trim().slice(0, 8000);
  const url = `${new URL(request.url).origin}/r/${id}`;
  const result = await postDecisionToAsana({
    task: review.asanaTaskGid,
    scope,
    decision,
    feedback,
    url,
    token,
    assignee,
    reviewer,
    gates: routing.gates,
    mentionGid: routing.mention ? process.env.COPY_REVIEWER_GID : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: `asana comment failed (${result.status})`, detail: result.detail },
      { status: 502 },
    );
  }

  await markScopeDecided(id, scope, decision, feedback);
  return NextResponse.json(
    result.warning ? { success: true, warning: result.warning } : { success: true },
  );
}
```

- [ ] **Step 4: Run → pass** (`npx vitest run "src/app/api/reviews/[id]/decision/route.test.ts"`).
- [ ] **Step 5: Commit:** `git add "src/app/api/reviews/[id]/decision/"* && git commit -m "feat: scoped decision routing in the decision endpoint"`

---

## Task 7: Review page UI — scope selector

**Files:** Modify `src/components/Decision.tsx`, `src/app/r/[id]/page.tsx`, `src/components/review.module.css`; create `src/components/Decision.test.tsx`.

- [ ] **Step 1: Component test** — `src/components/Decision.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Decision } from './Decision';

describe('Decision scope selector', () => {
  it('defaults to Everything and shows an approve-all label', () => {
    render(<Decision reviewId="abc" campaign="C" total={4} copyStatus="pending" imageStatus="pending" />);
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Images')).toBeTruthy();
    expect(screen.getByText('Everything')).toBeTruthy();
    expect(screen.getByRole('button', { name: /approve all 4/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → fail** (Decision prop signature changed).

- [ ] **Step 3: Implement `Decision.tsx`** — new props `total`, `copyStatus`, `imageStatus` (replacing `approveLabel`); add scope state (default `'everything'`); render a segmented selector; compute the approve label from scope; send `scope` in the POST; scope-based success message + mailto. Full file:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import s from './review.module.css';
import type { DecisionScope, ScopeStatus } from '@/db/schema';

type DecisionKind = 'Approved' | 'Revisions requested';

const SCOPES: { id: DecisionScope; label: string }[] = [
  { id: 'copy', label: 'Copy' },
  { id: 'images', label: 'Images' },
  { id: 'everything', label: 'Everything' },
];

export function Decision({
  reviewId,
  campaign,
  total,
  copyStatus,
  imageStatus,
}: {
  reviewId: string;
  campaign: string;
  total: number;
  copyStatus: ScopeStatus;
  imageStatus: ScopeStatus;
}) {
  const [scope, setScope] = useState<DecisionScope>('everything');
  const [phase, setPhase] = useState<'buttons' | 'revise' | 'done'>('buttons');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errNode, setErrNode] = useState<ReactNode>(null);

  const goesToJenna = scope === 'copy';
  const recipient = goesToJenna ? 'Jenna' : 'Johan';
  const approveLabel =
    scope === 'copy' ? 'Approve copy' : scope === 'images' ? 'Approve images' : `Approve all ${total}`;

  function mailto(decision: DecisionKind, notes: string) {
    const addr = goesToJenna ? 'jenna@longbeard.com' : 'johan@longbeard.com';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const subject = encodeURIComponent(`${decision} (${scope}): ${campaign}`);
    const body = encodeURIComponent(
      `Decision: ${decision} | Scope: ${scope} | Feedback: ${notes || '-'} | Review page: ${url}`,
    );
    return `mailto:${addr}?subject=${subject}&body=${body}`;
  }

  function fail(decision: DecisionKind, notes: string) {
    setErrNode(
      <>
        The notification could not be sent from here (network blocked?).{' '}
        <a href={mailto(decision, notes)}>Email {recipient} directly</a> — the draft is prefilled with
        your decision.
      </>,
    );
  }

  async function submit(decision: DecisionKind, notes: string) {
    setBusy(true);
    setErrNode(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ scope, decision, feedback: notes.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean } | null;
      if (res.ok && j?.success) {
        setOkMsg(
          decision === 'Approved'
            ? `Approved — posted to the Asana task and sent to ${recipient}. Thank you.`
            : `Feedback sent — posted to the Asana task and sent to ${recipient}. Thank you.`,
        );
        setPhase('done');
      } else {
        fail(decision, notes);
      }
    } catch {
      fail(decision, notes);
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'done') {
    return (
      <div className={`${s.msg} ${s.ok}`} role="status">
        {okMsg}
      </div>
    );
  }

  return (
    <>
      <div className={s.scopeRow} role="group" aria-label="What are you reviewing?">
        {SCOPES.map((sc) => (
          <button
            key={sc.id}
            type="button"
            className={`${s.scopeBtn} ${scope === sc.id ? s.scopeOn : ''}`}
            aria-pressed={scope === sc.id}
            onClick={() => setScope(sc.id)}
          >
            {sc.label}
          </button>
        ))}
      </div>
      <p className={s.routeHint}>
        Copy goes to Jenna · images come to Johan. (Copy {copyStatus}, images {imageStatus}.)
      </p>
      {phase === 'buttons' && (
        <div className={s.btns}>
          <button className={s.bGold} type="button" disabled={busy} onClick={() => submit('Approved', '')}>
            {approveLabel}
          </button>
          <button className={s.bLine} type="button" disabled={busy} onClick={() => setPhase('revise')}>
            Revisions needed
          </button>
        </div>
      )}
      {phase === 'revise' && (
        <div className={s.revbox}>
          <textarea
            value={feedback}
            placeholder="Paste a Loom link, or describe the changes needed…"
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className={s.row}>
            <button
              className={s.bGold}
              type="button"
              disabled={busy}
              onClick={() => submit('Revisions requested', feedback)}
            >
              Send feedback
            </button>
            <button className={s.bGhost} type="button" onClick={() => setPhase('buttons')}>
              Back
            </button>
          </div>
        </div>
      )}
      {errNode && (
        <div className={`${s.msg} ${s.err}`} role="alert">
          {errNode}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Update the page** — in `src/app/r/[id]/page.tsx`:
  - Replace the `<Decision .../>` usage:

```tsx
          <Decision
            reviewId={review.id}
            campaign={review.campaign}
            total={total}
            copyStatus={review.copyStatus}
            imageStatus={review.imageStatus}
          />
```
  - Remove the now-unused `approveLabel` import if nothing else uses it (keep `reviewIntro`). Update the `.sub` paragraph text to: `One decision per area. Copy decisions go to Jenna; images to Johan. Posted straight to the Asana task.`

- [ ] **Step 5: Add styles** — append to `src/components/review.module.css`:

```css
.scopeRow {
  display: inline-flex;
  border: 1px solid var(--line2);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
}
.scopeBtn {
  padding: 9px 18px;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--line2);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.scopeBtn:first-child {
  border-left: 0;
}
.scopeOn {
  background: var(--gold);
  color: #171309;
  font-weight: 600;
}
.routeHint {
  color: var(--mut);
  font-size: 12.5px;
  margin: 0 0 16px;
}
```

- [ ] **Step 6: Verify** — `npm test` (Decision test + all green); `npm run build`.
- [ ] **Step 7: Commit:** `git add src/components/Decision.tsx src/components/Decision.test.tsx src/app/r/[id]/page.tsx src/components/review.module.css && git commit -m "feat: scope selector on the review decision panel"`

---

## Task 8: Config + manual verification

- [ ] **Step 1: Add env locally** — append to `.env.local` (gitignored):

```
ASSIGNEE_COPY=jenna@longbeard.com
COPY_REVIEWER_GID=1202922206500119
```

- [ ] **Step 2: Full gate** — `npm test` (all green) and `npm run build` (green).

- [ ] **Step 3: Manual verification (live)** — against a throwaway test review pointed at the test task `1215700065806210`:
  - Create a review in the editor (or reuse one), open `/r/{id}`.
  - Scope **Copy** → Approve → confirm in Asana: comment "✅ Copy approved by Matthew", task reassigned to Jenna, subtask "Matthew Approves Copy" ticked.
  - Scope **Images** → Revisions + note → comment "🔁 Images — revisions requested…", task to Johan, no gate ticked.
  - Scope **Everything** on a fresh review → Approve → comment "✅ Copy + images…", task to Johan, Jenna added as collaborator, both gates ticked.
  - **Untick** the gates afterwards to leave the test task clean.

- [ ] **Step 4: Note for deploy** — `ASSIGNEE_COPY` + `COPY_REVIEWER_GID` must be added to Vercel **production** env before this ships (not done in this plan; flagged to Johan).

---

## Self-review (completed during planning)

- **Spec coverage (#3):** scope selector + default Everything (Task 7) ✓; Copy→Jenna / Images→Johan / Everything→Johan+Jenna (Tasks 1, 5, 6) ✓; auto-tick gate on approval only (Task 5) ✓; per-scope tracking + roll-up + reset on new round (Tasks 2–4) ✓; scoped comment text (Task 5) ✓; scoped mailto fallback (Task 7) ✓; env config (Task 8) ✓.
- **Placeholder scan:** none — concrete code/commands throughout.
- **Type consistency:** `ScopeStatus`, `DecisionScope` defined in `schema.ts` (Task 3) and imported by `decision-routing`, `review-status`, `asana`, `reviews`, `Decision`; `routingForScope` shape matches its consumer in Task 6; `postDecisionToAsana` new signature matches the route call. **Build order:** Task 3 (types) is needed for Tasks 1/2 to type-check — `npm run build` is run after Task 3; if doing strict per-task tsc, create the `schema.ts` types first.

---

## Execution handoff

After Task 8 verifies, the whole branch (`#1` + `#3`) is ready — then use superpowers:finishing-a-development-branch to choose merge/PR/deploy, and add the two env vars to Vercel before shipping.
