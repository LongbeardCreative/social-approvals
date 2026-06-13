# Stage 6: Decision Endpoint (Asana) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`). **Task 3 is interactive** — Johan provides the Asana token. Build + unit-test Tasks 1–2 first (no token needed; fetch is stubbed).

**Goal:** Make the review page's **Approve / Revisions** buttons actually post to Asana: a Zod-validated `POST /api/reviews/[id]/decision` that looks up the task from the DB row, posts the comment + reassigns the task to Johan (ported from `worker.js`), and marks the row decided. The client's prefilled-mailto fallback (built Stage 5) stays as the safety net. The Cloudflare Worker is retired.

**Architecture:** The Asana logic is ported into `src/lib/asana.ts` as two testable pieces — `decisionComment()` (pure text builder) and `postDecisionToAsana()` (the two Asana fetches) — mirroring `worker.js`. The route handler orchestrates: validate body `{decision, feedback}`, look up the review by `id` (404 if missing), guard already-decided rows, build the review URL from the request origin, call `postDecisionToAsana()` with the env token, then `markReviewDecided()`. Same-origin (review page + endpoint share the domain) so **no CORS** needed; `ALLOWED_ORIGIN` is optional hardening. Env var names match the Worker for continuity: `ASANA_TOKEN`, `ASSIGNEE`, `REVIEWER`.

**Tech Stack:** Next 16 dynamic route handler (`RouteContext<'/api/reviews/[id]/decision'>`, async params), Zod, Drizzle update, Vitest (stubbed fetch + mocked db).

**Reference:** `legacy/worker.js` (the exact logic + failure handling), `legacy/worker.test.mjs` (behavioural specs to re-express). Design §6, §8 (never lose feedback; guard double-submit — client-side from Stage 5 + server already-decided guard here).

## Env (set in `.env.local` + Vercel production)

| Name | Notes |
|------|-------|
| `ASANA_TOKEN` | secret — the Review Bot's Asana personal access token (from the existing Cloudflare Worker, or regenerated) |
| `ASSIGNEE` | `johan@longbeard.com` — task reassigned here after a decision |
| `REVIEWER` | optional, defaults to `Matthew` — the name in the comment |
| `ALLOWED_ORIGIN` | optional — e.g. `https://social-approvals.vercel.app`; rejects POSTs from other origins |

---

## File structure after Stage 6

```
src/
├── lib/asana.ts              + decisionComment(), postDecisionToAsana(), asanaConfigured()
├── lib/asana.test.ts         + tests for the above (re-express worker.test.mjs specs)
├── db/reviews.ts             + markReviewDecided()
└── app/api/reviews/[id]/decision/route.ts   POST → Asana + mark row
    app/api/reviews/[id]/decision/route.test.ts   route tests (mocked db + fetch)
```

---

## Task 1: Port the Asana logic into `src/lib/asana.ts` (TDD)

**Files:** Modify `src/lib/asana.ts`; create tests in `src/lib/asana.test.ts` (append to the existing parseTask tests).

- [ ] **Step 1: Add to `src/lib/asana.ts`**

```ts
const ASANA = 'https://app.asana.com/api/1.0';

export type Decision = 'Approved' | 'Revisions requested';

/** True only when the Asana env needed to post is present. */
export function asanaConfigured(): boolean {
  return Boolean(process.env.ASANA_TOKEN && process.env.ASSIGNEE);
}

/** The comment text, ported verbatim from worker.js. */
export function decisionComment(
  decision: Decision,
  reviewer: string,
  feedback: string,
  url: string,
): string {
  const link = url ? `\n\nReview page: ${url}` : '';
  return decision === 'Approved'
    ? `✅ Approved by ${reviewer}${link}`
    : `🔁 Revisions requested by ${reviewer}:\n\n${feedback || '(no notes left)'}${link}`;
}

export type DecisionResult =
  | { ok: true; warning?: string }
  | { ok: false; status: number; detail: string };

/** Post the decision comment + reassign the task (ported from worker.js). */
export async function postDecisionToAsana(opts: {
  task: string;
  decision: Decision;
  feedback: string;
  url: string;
  token: string;
  assignee: string;
  reviewer: string;
}): Promise<DecisionResult> {
  const text = decisionComment(opts.decision, opts.reviewer, opts.feedback, opts.url);
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  };

  // 1. Comment on the task
  const c = await fetch(`${ASANA}/tasks/${opts.task}/stories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: { text } }),
  });
  if (!c.ok) {
    const detail = await c.text().catch(() => '');
    return { ok: false, status: c.status, detail: detail.slice(0, 500) };
  }

  // 2. Reassign the task back
  const a = await fetch(`${ASANA}/tasks/${opts.task}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { assignee: opts.assignee } }),
  });
  if (!a.ok) {
    return { ok: true, warning: `comment posted, but reassign failed (${a.status})` };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Add tests to `src/lib/asana.test.ts`** (re-expressing worker.test.mjs)

```ts
import { afterEach, describe, it, expect, vi } from 'vitest';
import { decisionComment, postDecisionToAsana } from '@/lib/asana';

describe('decisionComment', () => {
  it('approved, with reviewer + link', () => {
    expect(decisionComment('Approved', 'Matthew', '', 'https://x/r/abc')).toBe(
      '✅ Approved by Matthew\n\nReview page: https://x/r/abc',
    );
  });
  it('revisions, with feedback', () => {
    const t = decisionComment('Revisions requested', 'Matthew', 'fix the FB headline', '');
    expect(t.startsWith('🔁 Revisions requested by Matthew:')).toBe(true);
    expect(t).toContain('fix the FB headline');
  });
  it('revisions, no notes → placeholder', () => {
    expect(decisionComment('Revisions requested', 'Fr. Gregory', '', '')).toBe(
      '🔁 Revisions requested by Fr. Gregory:\n\n(no notes left)',
    );
  });
});

describe('postDecisionToAsana', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function stub(plan: { ok: boolean; status: number; text?: string }[]) {
    const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const i = calls.length;
      calls.push({
        url: String(url),
        method: init.method as string,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string),
      });
      const r = plan[i] || { ok: true, status: 200 };
      return { ok: r.ok, status: r.status, text: async () => r.text ?? '' } as Response;
    }) as typeof fetch;
    return calls;
  }

  const base = {
    task: '1209888777666555',
    decision: 'Approved' as const,
    feedback: '',
    url: 'https://x/r/abc',
    token: 'tok',
    assignee: 'johan@longbeard.com',
    reviewer: 'Matthew',
  };

  it('happy path: comment POST + reassign PUT, bearer token, assignee', async () => {
    const calls = stub([{ ok: true, status: 200 }, { ok: true, status: 200 }]);
    const res = await postDecisionToAsana(base);
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://app.asana.com/api/1.0/tasks/1209888777666555/stories');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect((calls[0].body as { data: { text: string } }).data.text).toContain('✅ Approved by Matthew');
    expect(calls[1].method).toBe('PUT');
    expect((calls[1].body as { data: { assignee: string } }).data.assignee).toBe('johan@longbeard.com');
  });

  it('comment fails → ok:false + status, no reassign', async () => {
    const calls = stub([{ ok: false, status: 403, text: 'no access' }]);
    const res = await postDecisionToAsana(base);
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(calls).toHaveLength(1);
  });

  it('reassign fails → ok:true + warning', async () => {
    stub([{ ok: true, status: 200 }, { ok: false, status: 400, text: 'bad assignee' }]);
    const res = await postDecisionToAsana(base);
    expect(res.ok).toBe(true);
    expect((res as { warning?: string }).warning).toContain('reassign failed');
  });
});
```
Run `npm test` (red before Step 1, green after).

- [ ] **Step 3: Commit**

```bash
git add src/lib/asana.ts src/lib/asana.test.ts
git commit -m "feat: port Asana decision logic (comment + reassign) into lib

decisionComment() + postDecisionToAsana() ported verbatim from worker.js,
unit-tested (re-expressing worker.test.mjs: comment formats, 2 calls, bearer,
assignee, failure handling).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `markReviewDecided` + the decision route (+ route tests)

**Files:** Modify `src/db/reviews.ts`; create `src/app/api/reviews/[id]/decision/route.ts` + `route.test.ts`.

- [ ] **Step 1: Add `markReviewDecided` to `src/db/reviews.ts`**

```ts
import type { ReviewStatus } from './schema';
// ... existing imports/exports ...

export async function markReviewDecided(
  id: string,
  status: Extract<ReviewStatus, 'approved' | 'revisions'>,
  decisionNotes: string,
): Promise<void> {
  await getDb()
    .update(reviews)
    .set({ status, decisionNotes, decidedAt: new Date() })
    .where(eq(reviews.id, id));
}
```

- [ ] **Step 2: `src/app/api/reviews/[id]/decision/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReviewById, markReviewDecided } from '@/db/reviews';
import { postDecisionToAsana } from '@/lib/asana';

const Body = z.object({
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
  const assignee = process.env.ASSIGNEE;
  const reviewer = process.env.REVIEWER || 'Matthew';
  if (!token || !assignee) {
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

  const review = await getReviewById(id);
  if (!review) {
    return NextResponse.json({ success: false, error: 'review not found' }, { status: 404 });
  }
  if (review.status === 'approved' || review.status === 'revisions') {
    return NextResponse.json({ success: true, alreadyDecided: true });
  }

  const feedback = parsed.data.feedback.trim().slice(0, 8000);
  const url = `${new URL(request.url).origin}/r/${id}`;
  const result = await postDecisionToAsana({
    task: review.asanaTaskGid,
    decision: parsed.data.decision,
    feedback,
    url,
    token,
    assignee,
    reviewer,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: `asana comment failed (${result.status})`, detail: result.detail },
      { status: 502 },
    );
  }

  await markReviewDecided(id, parsed.data.decision === 'Approved' ? 'approved' : 'revisions', feedback);
  return NextResponse.json(result.warning ? { success: true, warning: result.warning } : { success: true });
}
```

- [ ] **Step 3: `route.test.ts` (mock db + stub fetch)**

```ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/db/reviews', () => ({
  getReviewById: vi.fn(),
  markReviewDecided: vi.fn(),
}));
import { getReviewById, markReviewDecided } from '@/db/reviews';
import { POST } from './route';

const ctx = { params: Promise.resolve({ id: 'abc123' }) };
const realFetch = globalThis.fetch;

function req(body: unknown) {
  return new Request('https://social-approvals.vercel.app/api/reviews/abc123/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.ASANA_TOKEN = 'tok';
  process.env.ASSIGNEE = 'johan@longbeard.com';
  vi.mocked(getReviewById).mockReset();
  vi.mocked(markReviewDecided).mockReset();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const row = {
  id: 'abc123',
  campaign: 'C',
  account: 'A',
  handle: 'h',
  asanaTaskGid: '1209888777666555',
  platforms: {},
  status: 'pending',
  decisionNotes: null,
  decidedAt: null,
  createdAt: new Date(),
};

describe('POST decision', () => {
  it('400 on invalid decision', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    const res = await POST(req({ decision: 'Maybe' }), ctx);
    expect(res.status).toBe(400);
  });
  it('404 when review missing', async () => {
    vi.mocked(getReviewById).mockResolvedValue(null);
    const res = await POST(req({ decision: 'Approved' }), ctx);
    expect(res.status).toBe(404);
  });
  it('happy path: posts to Asana + marks decided', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => '' })) as typeof fetch;
    const res = await POST(req({ decision: 'Approved', feedback: '' }), ctx);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(vi.mocked(markReviewDecided)).toHaveBeenCalledWith('abc123', 'approved', '');
  });
  it('already-decided → no re-post', async () => {
    vi.mocked(getReviewById).mockResolvedValue({ ...row, status: 'approved' } as never);
    let called = false;
    globalThis.fetch = (async () => { called = true; return { ok: true, status: 200, text: async () => '' }; }) as typeof fetch;
    const res = await POST(req({ decision: 'Approved' }), ctx);
    const j = await res.json();
    expect(j.alreadyDecided).toBe(true);
    expect(called).toBe(false);
  });
  it('comment failure → 502', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    globalThis.fetch = (async () => ({ ok: false, status: 403, text: async () => 'no access' })) as typeof fetch;
    const res = await POST(req({ decision: 'Approved' }), ctx);
    expect(res.status).toBe(502);
    expect(vi.mocked(markReviewDecided)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Build + test + commit**

`npm run build` (route `ƒ /api/reviews/[id]/decision` appears) + `npm test` green. Commit:
```bash
git add -A
git commit -m "feat: decision endpoint POST /api/reviews/[id]/decision

Validates {decision,feedback}, looks up the task from the row, posts to Asana
(comment + reassign) and marks the row decided; 404/already-decided guards;
502 on comment failure (client falls back to mailto). markReviewDecided added.
Route tests with mocked db + stubbed fetch.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Asana env ⚠️ INTERACTIVE — needs Johan

- [ ] **Step 1 (Johan): Provide the Asana values.** From the existing Cloudflare Worker (Worker → Settings → Variables and Secrets) copy:
  - `ASANA_TOKEN` (the Review Bot's token), `ASSIGNEE` (`johan@longbeard.com`), `REVIEWER` (if customized).
  If the Review Bot / Asana setup was never finished, say so — we'll build-and-ship the endpoint (unit-tested) and complete the live Asana wiring when the bot is ready; the mailto fallback covers the gap meanwhile.
- [ ] **Step 2 (Claude): Add to `.env.local`** (`ASANA_TOKEN`, `ASSIGNEE`, `REVIEWER`).
- [ ] **Step 3 (Claude): Add to Vercel production** (piped `vercel env add`, same pattern as R2/DB). Confirm with `vercel env ls production`.

---

## Task 4: Live end-to-end + retire the Worker + deploy

- [ ] **Step 1: Deploy** `npx vercel@latest deploy --prod --scope johan-3548s-projects --token=...`.
- [ ] **Step 2: Live test (if token provided).** In Asana, create a scratch task in the Review Bot's project; create a review in the editor pointing at it; open `/r/{id}`; click **Approve all N**. Within seconds the scratch task should show "✅ Approved by Matthew" + the review link and be reassigned to Johan; the page shows the green success message. Confirm the DB row `status` flipped to `approved` (quick Neon SELECT). Then try a Revisions decision with notes on another scratch review. Delete the scratch tasks.
- [ ] **Step 3: Retire the Worker.** The review page now posts same-origin to our route — the Cloudflare Worker is no longer called. Note for Johan: he can delete the `social-approvals-relay` Worker in Cloudflare whenever (no rush; `legacy/worker.js` stays as reference). Update `README`/docs in the Stage 7 polish.
- [ ] **Step 4 (Johan): Confirm** an approve + a revisions both land in Asana correctly. Push `migration`.

---

## Acceptance criteria (Stage 6 done when all true)

- [ ] `POST /api/reviews/[id]/decision` validates input; 404 unknown id; already-decided returns without re-posting; 502 if the Asana comment fails (client → mailto fallback); marks the row `approved`/`revisions` with notes + `decidedAt` on success.
- [ ] Live: an Approve posts "✅ Approved by Matthew" + link and reassigns to Johan; a Revisions posts "🔁 Revisions requested by Matthew:" + notes. (Pending Johan's token; otherwise unit-tested + shipped, fallback active.)
- [ ] Worker no longer used (review page posts same-origin). Tests green; build passes; deployed.

## Self-review (against spec §6/§8 + worker.js)

- **Comment + reassign ported verbatim:** `postDecisionToAsana` mirrors worker.js (same endpoints, payloads, failure handling). ✓
- **Env names preserved:** `ASANA_TOKEN`/`ASSIGNEE`/`REVIEWER`. ✓
- **Never lose feedback:** 502/500/network → client mailto fallback (Stage 5). ✓
- **Guard double-submit:** client busy/sent (Stage 5) + server already-decided guard. ✓
- **Mark row decided:** `markReviewDecided` (status + notes + decidedAt). ✓
- **Task from the row, not the client:** route reads `review.asanaTaskGid`. ✓
- **Retire Worker:** no longer called; logic in-app. ✓
- **Naming:** `getReviewById`, `markReviewDecided`, `postDecisionToAsana`, `decisionComment`, `asanaConfigured` consistent. ✓
```
