# Editor Asana Status Badge — Implementation Plan (Feature #1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user pastes an Asana task link in the editor, show two markers — Copy and Images — each *approved* or *pending*, read from that task's gate subtasks.

**Architecture:** Pure gate-matching helpers + a subtask-fetch wrapper in `lib/asana.ts`; a gated `GET /api/asana/status` route that returns the status as JSON; a small client component in the editor that fetches when a valid task id is present and renders the two markers using the existing editor CSS variables.

**Tech Stack:** Next.js 16 App Router (route handler, no dynamic params), React 19 client component, Vitest 4 + @testing-library/react (jsdom), the existing `ASANA_TOKEN`.

**Spec:** `docs/superpowers/specs/2026-06-15-asana-status-and-decision-routing-design.md` (Feature #1).

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/asana.ts` | gate constants, pure `gateStatusFrom`, `getSubtasks`, `readGateStatus` | modify |
| `src/lib/asana.test.ts` | tests for the above | modify |
| `src/app/api/asana/status/route.ts` | gated GET endpoint → `{ ok, copy, images }` | create |
| `src/app/api/asana/status/route.test.ts` | endpoint tests | create |
| `src/components/AsanaStatus.tsx` | presentational `StatusBadge` + fetching `AsanaStatus` container | create |
| `src/components/AsanaStatus.test.tsx` | `StatusBadge` render tests | create |
| `src/components/Editor.tsx` | render `<AsanaStatus>` under the Asana link field | modify (~line 120) |
| `src/components/editor.module.css` | badge styles using existing `--mut/--gold/--bad` vars | modify |

---

## Task 1: Gate constants + pure status matching

**Files:**
- Modify: `src/lib/asana.ts`
- Test: `src/lib/asana.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/lib/asana.test.ts`:

```ts
import { gateStatusFrom } from '@/lib/asana';

describe('gateStatusFrom', () => {
  it('maps the gate subtasks to copy/images status', () => {
    const subs = [
      { name: '2. Draft Copy in Workbook (All Languages)', completed: true },
      { name: '3. Matthew Approves Copy', completed: true },
      { name: '6. Matthew Approves Creative', completed: false },
    ];
    expect(gateStatusFrom(subs)).toEqual({ copy: 'approved', images: 'pending' });
  });

  it('is case- and number-insensitive', () => {
    expect(gateStatusFrom([{ name: 'matthew APPROVES copy', completed: true }])).toEqual({
      copy: 'approved',
      images: 'pending',
    });
  });

  it('missing gates → both pending', () => {
    expect(gateStatusFrom([])).toEqual({ copy: 'pending', images: 'pending' });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/asana.test.ts`
Expected: FAIL — `gateStatusFrom is not a function` / not exported.

- [ ] **Step 3: Implement** — add to `src/lib/asana.ts` (after the `parseTask` export, near the `ASANA` const):

```ts
export type SubtaskLite = { name: string; completed: boolean };
export type GateStatus = 'approved' | 'pending';

/** Name fragments that identify the two approval-gate subtasks (matched case-insensitively). */
export const COPY_GATE = 'approves copy';
export const CREATIVE_GATE = 'approves creative';

function gateApproved(subtasks: SubtaskLite[], fragment: string): boolean {
  const f = fragment.toLowerCase();
  return subtasks.some((s) => (s.name || '').toLowerCase().includes(f) && s.completed);
}

/** Pure: turn a subtask list into copy/images approval status. */
export function gateStatusFrom(subtasks: SubtaskLite[]): { copy: GateStatus; images: GateStatus } {
  return {
    copy: gateApproved(subtasks, COPY_GATE) ? 'approved' : 'pending',
    images: gateApproved(subtasks, CREATIVE_GATE) ? 'approved' : 'pending',
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/asana.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asana.ts src/lib/asana.test.ts
git commit -m "feat: pure gate-status matching for Asana subtasks"
```

---

## Task 2: Subtask fetch + `readGateStatus`

**Files:**
- Modify: `src/lib/asana.ts`
- Test: `src/lib/asana.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/lib/asana.test.ts`:

```ts
import { readGateStatus } from '@/lib/asana';

describe('readGateStatus', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fetches subtasks and returns gate status', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { name: '3. Matthew Approves Copy', completed: true },
          { name: '6. Matthew Approves Creative', completed: false },
        ],
      }),
    })) as typeof fetch;
    expect(await readGateStatus('1209888777666555', 'tok')).toEqual({
      ok: true,
      copy: 'approved',
      images: 'pending',
    });
  });

  it('ok:false when the request fails', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as typeof fetch;
    expect(await readGateStatus('1209888777666555', 'tok')).toEqual({ ok: false });
  });
});
```

(`afterEach` is already imported at the top of this file from the existing `postDecisionToAsana` tests — confirm the top-level import line reads `import { afterEach, describe, it, expect, vi } from 'vitest';` and add `afterEach` if missing.)

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/asana.test.ts`
Expected: FAIL — `readGateStatus is not a function`.

- [ ] **Step 3: Implement** — add to `src/lib/asana.ts` (after `gateStatusFrom`):

```ts
/** Fetch a task's subtasks (name + completed only). Throws on a non-OK response. */
export async function getSubtasks(task: string, token: string): Promise<SubtaskLite[]> {
  const r = await fetch(`${ASANA}/tasks/${task}/subtasks?opt_fields=name,completed`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`subtasks ${r.status}`);
  const j = (await r.json()) as { data?: SubtaskLite[] };
  return j.data ?? [];
}

export type GateStatusResult = { ok: true; copy: GateStatus; images: GateStatus } | { ok: false };

/** Read a task's gate status; never throws — returns { ok: false } if it can't be read. */
export async function readGateStatus(task: string, token: string): Promise<GateStatusResult> {
  try {
    return { ok: true, ...gateStatusFrom(await getSubtasks(task, token)) };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/asana.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asana.ts src/lib/asana.test.ts
git commit -m "feat: readGateStatus fetches Asana subtasks and reports gate status"
```

---

## Task 3: Gated `GET /api/asana/status` endpoint

**Files:**
- Create: `src/app/api/asana/status/route.ts`
- Test: `src/app/api/asana/status/route.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/app/api/asana/status/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ isAuthed: vi.fn() }));

import { isAuthed } from '@/lib/auth';
import { GET } from './route';

const realFetch = globalThis.fetch;

function req(query: string) {
  return new Request('https://social-approvals.vercel.app/api/asana/status' + query);
}

beforeEach(() => {
  process.env.ASANA_TOKEN = 'tok';
  vi.mocked(isAuthed).mockReset();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GET /api/asana/status', () => {
  it('401 when not authed', async () => {
    vi.mocked(isAuthed).mockResolvedValue(false);
    const res = await GET(req('?gid=1209888777666555'));
    expect(res.status).toBe(401);
  });

  it('400 when gid is missing/invalid', async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    expect((await GET(req(''))).status).toBe(400);
    expect((await GET(req('?gid=nope'))).status).toBe(400);
  });

  it('returns gate status for a valid task', async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { name: '3. Matthew Approves Copy', completed: true },
          { name: '6. Matthew Approves Creative', completed: true },
        ],
      }),
    })) as typeof fetch;
    const j = await (await GET(req('?gid=1209888777666555'))).json();
    expect(j).toEqual({ ok: true, copy: 'approved', images: 'approved' });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run "src/app/api/asana/status/route.test.ts"`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 3: Implement** — create `src/app/api/asana/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { parseTask, readGateStatus } from '@/lib/asana';

export async function GET(request: Request) {
  if (!(await isAuthed(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const gid = parseTask(new URL(request.url).searchParams.get('gid') || '');
  if (!gid) {
    return NextResponse.json({ ok: false, error: 'no task id' }, { status: 400 });
  }
  const token = process.env.ASANA_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'asana not configured' }, { status: 500 });
  }
  return NextResponse.json(await readGateStatus(gid, token));
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run "src/app/api/asana/status/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/asana/status/route.ts" "src/app/api/asana/status/route.test.ts"
git commit -m "feat: gated GET /api/asana/status endpoint"
```

---

## Task 4: `StatusBadge` presentational component

**Files:**
- Create: `src/components/AsanaStatus.tsx`
- Test: `src/components/AsanaStatus.test.tsx`

- [ ] **Step 1: Write the failing test** — create `src/components/AsanaStatus.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './AsanaStatus';

describe('StatusBadge', () => {
  it('shows a loading hint', () => {
    render(<StatusBadge state="loading" />);
    expect(screen.getByText(/checking asana/i)).toBeTruthy();
  });

  it('shows unavailable', () => {
    render(<StatusBadge state="unavailable" />);
    expect(screen.getByText(/status unavailable/i)).toBeTruthy();
  });

  it('shows copy approved + images pending', () => {
    render(<StatusBadge state={{ copy: 'approved', images: 'pending' }} />);
    expect(screen.getByText('Copy approved')).toBeTruthy();
    expect(screen.getByText('Images pending')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/components/AsanaStatus.test.tsx`
Expected: FAIL — cannot find `./AsanaStatus`.

- [ ] **Step 3: Implement the presentational component** — create `src/components/AsanaStatus.tsx` (container added in Task 5):

```tsx
'use client';

import { useEffect, useState } from 'react';
import s from '@/components/editor.module.css';
import type { GateStatus } from '@/lib/asana';

type Pair = { copy: GateStatus; images: GateStatus };
type BadgeState = 'loading' | 'unavailable' | Pair;

function Item({ label, value }: { label: string; value: GateStatus }) {
  const cls = value === 'approved' ? `${s.statusItem} ${s.approved}` : `${s.statusItem} ${s.pending}`;
  return (
    <span className={cls}>
      {label} {value === 'approved' ? 'approved' : 'pending'}
    </span>
  );
}

export function StatusBadge({ state }: { state: BadgeState }) {
  if (state === 'loading') return <div className={s.statusRow}>Checking Asana…</div>;
  if (state === 'unavailable')
    return <div className={s.statusRow}>Asana status unavailable</div>;
  return (
    <div className={s.statusRow}>
      <Item label="Copy" value={state.copy} />
      <Item label="Images" value={state.images} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/components/AsanaStatus.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AsanaStatus.tsx src/components/AsanaStatus.test.tsx
git commit -m "feat: StatusBadge presentational component for Asana gate status"
```

---

## Task 5: `AsanaStatus` fetching container

**Files:**
- Modify: `src/components/AsanaStatus.tsx`

(No unit test — fetch-on-mount is covered by the manual verification in Task 7. Keep the container thin.)

- [ ] **Step 1: Add the container** — append to `src/components/AsanaStatus.tsx`:

```tsx
export function AsanaStatus({ gid }: { gid: string }) {
  const [state, setState] = useState<BadgeState>('loading');

  useEffect(() => {
    if (!gid) return;
    let live = true;
    setState('loading');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/asana/status?gid=${encodeURIComponent(gid)}`);
        const j = (await res.json()) as { ok?: boolean; copy?: GateStatus; images?: GateStatus };
        if (!live) return;
        setState(j.ok && j.copy && j.images ? { copy: j.copy, images: j.images } : 'unavailable');
      } catch {
        if (live) setState('unavailable');
      }
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [gid]);

  return <StatusBadge state={state} />;
}
```

- [ ] **Step 2: Verify it type-checks and existing tests still pass**

Run: `npx vitest run src/components/AsanaStatus.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AsanaStatus.tsx
git commit -m "feat: AsanaStatus container fetches gate status (debounced)"
```

---

## Task 6: Wire the badge into the editor + styles

**Files:**
- Modify: `src/components/Editor.tsx` (~line 120, after the Asana hint `<div>`)
- Modify: `src/components/editor.module.css`

- [ ] **Step 1: Add the import** — at the top of `src/components/Editor.tsx`, with the other component imports:

```tsx
import { AsanaStatus } from '@/components/AsanaStatus';
```

- [ ] **Step 2: Render it under the Asana hint** — in `src/components/Editor.tsx`, replace the hint line:

```tsx
              <div className={asanaHintCls}>{asanaHintText}</div>
```

with:

```tsx
              <div className={asanaHintCls}>{asanaHintText}</div>
              {gid && <AsanaStatus gid={gid} />}
```

- [ ] **Step 3: Add badge styles** — append to `src/components/editor.module.css`:

```css
.statusRow {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--mut);
}
.statusItem {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.statusItem.approved {
  color: var(--gold);
}
.statusItem.approved::before {
  content: '✓';
}
.statusItem.pending {
  color: var(--mut);
}
.statusItem.pending::before {
  content: '◷';
}
```

- [ ] **Step 4: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor.tsx src/components/editor.module.css
git commit -m "feat: show the Asana copy/images status badge in the editor"
```

---

## Task 7: Manual verification (live Asana)

Uses the live test task **"Test - Duplicate of Social Post - Template (Hermes)"** (gid `1215700065806210`).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (requires `.env.local` with `ASANA_TOKEN` + `EDITOR_PASSWORD`). Open http://localhost:3000, log in.

- [ ] **Step 2: Paste the task link** into the "Asana task link" field:
`https://app.asana.com/1/40216414006749/project/1215413165495983/task/1215700065806210`
Expected: after ~0.5s the badge shows **Copy pending · Images pending** (all gates currently unticked).

- [ ] **Step 3: Tick a gate in Asana** — in Asana, complete subtask **"3. Matthew Approves Copy"** on that task. Re-paste/re-type the link (or reload) so the badge refetches.
Expected: badge shows **Copy approved · Images pending**.

- [ ] **Step 4: Untick it again** in Asana to leave the test task clean.

- [ ] **Step 5: Confirm graceful failure** — paste a bogus id like `999999999999` → badge shows **Asana status unavailable** (no crash).

---

## Self-review (completed during planning)

- **Spec coverage (Feature #1):** badge under the Asana field (Task 6) ✓; reads gate subtasks via the existing token (Tasks 2–3) ✓; "Matthew Approves Copy"/"Matthew Approves Creative" gates, number/case-insensitive (Task 1) ✓; "Images" label (Task 4) ✓; gated endpoint (Task 3) ✓; "status unavailable" fallback (Tasks 4–5, verified Task 7) ✓; never blocks the editor (badge is additive) ✓.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `SubtaskLite`, `GateStatus`, `GateStatusResult`, `gateStatusFrom`, `getSubtasks`, `readGateStatus`, `StatusBadge`, `AsanaStatus` used identically across tasks.

---

## Execution handoff

Plan 1 is independent and shippable on its own. After it's built and verified (Task 7), Plan 2 (decision routing, Feature #3) will be written — it reuses `getSubtasks` and the gate constants from this plan.
