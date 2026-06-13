# Stage 5: The Reviewer's Page (`/r/{id}`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`). No credential steps. Visual review at the end. **Match the legacy `REVIEW_TEMPLATE` look exactly** (memory: match-existing-designs-exactly).

**Goal:** A public, server-rendered page at `/r/{id}` that reads the review row and renders the mockups read-only — only enabled platforms, multi-post platforms as swipeable carousels (dots + counter), adaptive intro + Approve label — plus the Approve / Revisions decision UI, matching the original baked review page's dark design.

**Architecture:** `app/r/[id]/page.tsx` is an RSC: it `getReviewById(id)` (Stage 3), `notFound()` if missing, and renders header + intro + slots + decision + footer. Each enabled platform is a `.slot`; single-post → one `<Mockup>`, multi-post → a `<Carousel>` (client). The decision buttons are a `<Decision>` client component that POSTs to `/api/reviews/{id}/decision` (built in **Stage 6** — until then the fetch fails and the page shows the prefilled-mailto fallback, exactly like the legacy resilience path). The review chrome CSS is ported verbatim from `REVIEW_TEMPLATE` into a scoped CSS Module (dark, like the editor but its own module); `<Mockup>` + global `mockup.css` are reused for the white post cards.

**Tech Stack:** Next.js 16 dynamic RSC route (async `params`), `notFound()`, metadata `robots: noindex`, client components for carousel + decision, reused `<Mockup>`.

**Reference:** `legacy/editor.html` — `REVIEW_TEMPLATE` CSS (446-496), structure (500-528), carousel script (578-611), submit/mailto (540-577); `bake()` slot/carousel HTML + adaptive intro/label (810-842). Design §8 (preserve: enabled-only, carousels w/ dots+counter, adaptive copy, noindex, never-lose-feedback fallback).

## Scope / Not in scope

- **In:** the `/r/{id}` page (header/intro/slots/footer, noindex), `<Carousel>`, the Approve/Revisions `<Decision>` UI (with mailto fallback), adaptive intro/label.
- **Not in (noted):** the decision **endpoint** + Asana posting + marking the row decided (Stage 6 — the buttons fall back to mailto until then); already-decided display state (Stage 6); auth (n/a — this page is public by design).

---

## File structure after Stage 5

```
src/
├── app/r/[id]/page.tsx        RSC review page (reads row, renders everything)
├── components/
│   ├── review.module.css      REVIEW_TEMPLATE chrome CSS, ported (scoped, dark)
│   ├── Carousel.tsx           client: scroll-snap track + dots + prev/next + counter
│   └── Decision.tsx           client: Approve/Revisions UI + submit + mailto fallback
└── lib/review-copy.ts         adaptive reviewIntro() + approveLabel() (pure) + test
```

---

## Task 1: Adaptive copy util + review chrome CSS

**Files:** Create `src/lib/review-copy.ts`, `src/lib/review-copy.test.ts`, `src/components/review.module.css`.

- [ ] **Step 1: `src/lib/review-copy.ts` (ported from bake())**

```ts
export function approveLabel(total: number): string {
  return total === 1 ? 'Approve this post' : `Approve all ${total}`;
}

export function reviewIntro(opts: {
  total: number;
  platformCount: number;
  firstLabel: string;
  anyMulti: boolean;
}): string {
  const { total, platformCount, firstLabel, anyMulti } = opts;
  if (total === 1) {
    return `One post is below, shown as it will appear live on ${firstLabel}. Look it over, then decide at the bottom.`;
  }
  if (platformCount === 1) {
    return `${total} posts for ${firstLabel} are below, shown as they will appear live.${anyMulti ? ' Use the arrows (or swipe) to flip through them.' : ''} Then decide at the bottom.`;
  }
  return `${total} posts across ${platformCount} platforms are below, shown as they will appear live.${anyMulti ? ' Use the arrows (or swipe) where a platform has more than one.' : ''} Then decide at the bottom.`;
}
```

- [ ] **Step 2: `src/lib/review-copy.test.ts` (write first → red → green)**

```ts
import { describe, it, expect } from 'vitest';
import { approveLabel, reviewIntro } from '@/lib/review-copy';

describe('approveLabel', () => {
  it('singular vs plural', () => {
    expect(approveLabel(1)).toBe('Approve this post');
    expect(approveLabel(5)).toBe('Approve all 5');
  });
});

describe('reviewIntro', () => {
  it('one post', () => {
    expect(reviewIntro({ total: 1, platformCount: 1, firstLabel: 'X', anyMulti: false })).toMatch(
      /^One post is below, shown as it will appear live on X\./,
    );
  });
  it('one platform, multiple posts, with swipe hint', () => {
    const t = reviewIntro({ total: 3, platformCount: 1, firstLabel: 'X', anyMulti: true });
    expect(t).toMatch(/^3 posts for X are below/);
    expect(t).toContain('flip through them');
  });
  it('multiple platforms with swipe hint', () => {
    const t = reviewIntro({ total: 5, platformCount: 3, firstLabel: 'X', anyMulti: true });
    expect(t).toContain('5 posts across 3 platforms');
    expect(t).toContain('Use the arrows (or swipe) where a platform has more than one.');
  });
});
```
Run `npm test`: red (no module) → after Step 1, green.

- [ ] **Step 3: `src/components/review.module.css` — port `REVIEW_TEMPLATE` CSS (legacy 446-496)**

Port verbatim, scoped under `.page`, with these mechanical adaptations (IDs → classes, since React uses state not DOM ids):
- root vars + `body{background...}` → put on `.page` (full-bleed dark + radial gradient + `min-height:100vh`); `.page *{box-sizing:border-box}`.
- element selectors stay scoped: `.page header`, `.page header img/h1/p`, `.page button`, `.page button:disabled`, `.page textarea`, `.page textarea:focus`.
- `.b-gold`→`.bGold`, `.b-line`→`.bLine`, `.b-ghost`→`.bGhost`; `#revbox`→`.revbox`; `#revbox .row`→`.row`; `#ok`→`.ok`; `#err`→`.err`; `#err a`→`.err a`.
- keep `.note`, `.decide`, `.decide h2`, `.decide .sub`, `.btns`, `.msg`, `.car`, `.car-track`→`.carTrack`, `.car-item`→`.carItem`, `.car-bar`→`.carBar`, `.car-btn`→`.carBtn`, `.car-dots`→`.carDots`, `.dot`, `.dot.on`, `.car-count`→`.carCount`. (Where the legacy used hyphenated class names, use camelCase module keys and apply them in the components.)
- `.wrap{max-width:620px;margin:0 auto;padding:34px 20px 70px}`, `.footer{...}` (legacy `footer`).
- omit the legacy `/*__MOCKUP_CSS__*/` line — `mockup.css` is already global.

(The exact values are in legacy 446-496; copy them 1:1 — colors, sizes, the carousel rules, etc.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: review-page adaptive copy util + ported chrome CSS

reviewIntro()/approveLabel() ported from bake() (unit-tested); review.module.css
ports REVIEW_TEMPLATE's dark theme + carousel styles verbatim (scoped).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Carousel + the `/r/[id]` page (render mockups read-only)

**Files:** Create `src/components/Carousel.tsx`, `src/app/r/[id]/page.tsx`.

- [ ] **Step 1: `src/components/Carousel.tsx` (port the legacy carousel script)**

```tsx
'use client';

import { useRef, useState } from 'react';
import { Mockup, type Platform } from './Mockup';
import type { Post } from '@/db/schema';
import s from './review.module.css';

const GAP = 14; // matches .car-track gap

export function Carousel({
  platform,
  account,
  handle,
  posts,
}: {
  platform: Platform;
  account: string;
  handle: string;
  posts: Post[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const n = posts.length;

  function currentIndex() {
    const t = trackRef.current;
    if (!t || !t.clientWidth) return 0;
    return Math.max(0, Math.min(n - 1, Math.round(t.scrollLeft / (t.clientWidth + GAP))));
  }
  function go(delta: number) {
    const t = trackRef.current;
    if (!t) return;
    const target = Math.max(0, Math.min(n - 1, i + delta));
    t.scrollTo({ left: target * (t.clientWidth + GAP), behavior: 'smooth' });
  }

  return (
    <div className={s.car}>
      <div className={s.carTrack} ref={trackRef} onScroll={() => setI(currentIndex())}>
        {posts.map((po, k) => (
          <div className={s.carItem} key={k}>
            <Mockup platform={platform} account={account} handle={handle} post={po} />
          </div>
        ))}
      </div>
      <div className={s.carBar}>
        <button
          className={s.carBtn}
          type="button"
          aria-label="Previous post"
          disabled={i === 0}
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <div className={s.carDots}>
          {posts.map((_, k) => (
            <span key={k} className={`${s.dot}${k === i ? ' ' + s.on : ''}`} />
          ))}
        </div>
        <button
          className={s.carBtn}
          type="button"
          aria-label="Next post"
          disabled={i === n - 1}
          onClick={() => go(1)}
        >
          ›
        </button>
        <span className={s.carCount}>
          {i + 1} / {n}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/r/[id]/page.tsx` (RSC)**

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getReviewById } from '@/db/reviews';
import { PLATFORMS, type PlatformId } from '@/components/editor-state';
import { AVATAR } from '@/components/avatar';
import { Mockup } from '@/components/Mockup';
import { Carousel } from '@/components/Carousel';
import { Decision } from '@/components/Decision';
import { reviewIntro, approveLabel } from '@/lib/review-copy';
import s from '@/components/review.module.css';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getReviewById(id);
  if (!review) notFound();

  const enabled = PLATFORMS.filter((p) => review.platforms[p.id]?.on);
  if (enabled.length === 0) notFound();

  const total = enabled.reduce((sum, p) => sum + review.platforms[p.id].posts.length, 0);
  const anyMulti = enabled.some((p) => review.platforms[p.id].posts.length > 1);
  const intro = reviewIntro({
    total,
    platformCount: enabled.length,
    firstLabel: enabled[0].label,
    anyMulti,
  });
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(review.createdAt);

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AVATAR} alt="Magisterium AI logo" />
          <div>
            <h1>{review.campaign}</h1>
            <p>Social asset review · {dateStr} · {review.account}</p>
          </div>
        </header>

        <p className={s.note}>{intro}</p>

        <main>
          {enabled.map((p) => {
            const ps = review.platforms[p.id];
            const tag =
              ps.posts.length > 1 ? (
                <span className="slot-tag">
                  {p.label} <em>· {ps.posts.length} posts</em>
                </span>
              ) : (
                <span className="slot-tag">{p.label}</span>
              );
            return (
              <div className="slot" key={p.id}>
                <div className="slot-tag">{tag}</div>
                {ps.posts.length === 1 ? (
                  <Mockup
                    platform={p.id as PlatformId}
                    account={review.account}
                    handle={review.handle}
                    post={ps.posts[0]}
                  />
                ) : (
                  <Carousel
                    platform={p.id as PlatformId}
                    account={review.account}
                    handle={review.handle}
                    posts={ps.posts}
                  />
                )}
              </div>
            );
          })}
        </main>

        <section className={s.decide}>
          <h2>Your decision</h2>
          <p className={s.sub}>
            One decision covers the whole set. It is posted straight to the Asana task, and the task
            returns to Johan automatically.
          </p>
          <Decision reviewId={review.id} campaign={review.campaign} approveLabel={approveLabel(total)} />
        </section>

        <footer className={s.footer}>
          Prepared with Longbeard Creative · decisions post to the Asana task automatically
        </footer>
      </div>
    </div>
  );
}
```
**Note:** the `.slot-tag` rendering above double-wraps — fix when implementing to a single `<div className="slot-tag">{p.label}{ps.posts.length>1 && <em> · {n} posts</em>}</div>` (matches legacy `slot-tag` markup; `.slot`/`.slot-tag` come from the global `mockup.css`).

- [ ] **Step 3: Verify build** (`/r/[id]` shows as a dynamic `ƒ` route). Commit:
```bash
git add -A && git commit -m "feat: /r/[id] review page (RSC) + Carousel client component

Reads the row, renders enabled platforms read-only (single mockup or swipeable
carousel with dots+counter), adaptive intro, noindex. Carousel ported from the
legacy scroll-snap script.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The `<Decision>` UI (Approve / Revisions + mailto fallback)

**Files:** Create `src/components/Decision.tsx`.

- [ ] **Step 1: `src/components/Decision.tsx`**

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import s from './review.module.css';

type DecisionKind = 'Approved' | 'Revisions requested';

export function Decision({
  reviewId,
  campaign,
  approveLabel,
}: {
  reviewId: string;
  campaign: string;
  approveLabel: string;
}) {
  const [phase, setPhase] = useState<'buttons' | 'revise' | 'done'>('buttons');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errNode, setErrNode] = useState<ReactNode>(null);

  function mailto(decision: DecisionKind, notes: string) {
    const addr = 'johan@longbeard.com';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const subject = encodeURIComponent(`${decision}: ${campaign}`);
    const body = encodeURIComponent(
      `Decision: ${decision} | Feedback: ${notes || '-'} | Review page: ${url}`,
    );
    return `mailto:${addr}?subject=${subject}&body=${body}`;
  }

  function fail(decision: DecisionKind, notes: string) {
    setErrNode(
      <>
        The notification could not be sent from here (network blocked?).{' '}
        <a href={mailto(decision, notes)}>Email Johan directly</a> — the draft is prefilled with your
        decision.
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
        body: JSON.stringify({ decision, feedback: notes.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean } | null;
      if (res.ok && j?.success) {
        setOkMsg(
          decision === 'Approved'
            ? 'Approved — posted to the Asana task and sent back to Johan. Thank you.'
            : 'Feedback sent — posted to the Asana task and sent back to Johan. Thank you.',
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

- [ ] **Step 2: Verify build + commit**

`npm run build` + `npm test` green. Then:
```bash
git add -A && git commit -m "feat: Decision UI (Approve/Revisions) with mailto fallback

Ports the review page's decision flow: Approve / Revisions needed -> feedback
box -> Send, posting to /api/reviews/{id}/decision (built in Stage 6). Until
then the fetch fails gracefully to a prefilled mailto, never losing feedback.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Deploy + end-to-end verify (with Johan's eyes)

- [ ] **Step 1: Deploy** `npx vercel@latest deploy --prod --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"`.
- [ ] **Step 2: Create a real review** via the live editor (a couple of platforms, one with 2+ posts to show the carousel, an image), copy the `/r/{id}` link.
- [ ] **Step 3: Open the link** — verify: only enabled platforms show; the multi-post platform is a swipeable carousel with working dots/arrows/counter; single-post platforms have no carousel chrome; the intro + Approve label adapt; it matches the legacy dark review look. Screenshot it (preview tools).
- [ ] **Step 4 (Johan): Visual review** — confirm Matthew's view looks right. (The Approve/Revisions buttons will fall back to a mailto until Stage 6 wires Asana — expected.)
- [ ] **Step 5:** push `migration`.

---

## Acceptance criteria (Stage 5 done when all true)

- [ ] `/r/{id}` server-renders from the row; unknown id → 404; no enabled platforms → 404.
- [ ] Only enabled platforms render; multi-post → carousel (dots + prev/next + "n / m"); single-post → no carousel chrome.
- [ ] Adaptive intro + Approve label match the legacy strings; page carries `noindex`.
- [ ] Decision UI present (Approve / Revisions → feedback → Send); on submit failure shows the prefilled-mailto fallback (Asana wiring lands Stage 6).
- [ ] Matches the legacy dark review design (screenshot-confirmed). Tests green; build passes; deployed.

## Self-review (against spec §8)

- **Read-only mockups from the row, enabled only:** page maps `enabled`. ✓
- **Carousels w/ dots + counter; single = no chrome:** `<Carousel>` vs bare `<Mockup>`. ✓
- **Adaptive intro/label:** `review-copy.ts`, unit-tested vs legacy strings. ✓
- **noindex:** `metadata.robots`. ✓
- **Never lose feedback:** mailto fallback in `<Decision>`. ✓
- **Match the look:** `review.module.css` ported verbatim from `REVIEW_TEMPLATE`; reuses `mockup.css`/`<Mockup>`. ✓
- **Deferred:** decision endpoint + Asana + decided-state (Stage 6). ✓
- **Naming:** `getReviewById`, `PLATFORMS`, `Mockup`, `Carousel`, `Decision`, `reviewIntro`, `approveLabel` consistent. ✓
```
