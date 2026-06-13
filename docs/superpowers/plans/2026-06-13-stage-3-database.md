# Stage 3: Data Layer (Neon + Drizzle) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`). **Task 1 is interactive — Johan provisions Neon and provides the connection string.** Do it first; everything else needs `DATABASE_URL`.

**Goal:** Stand up the `reviews` table in a Neon Postgres database with Drizzle ORM + versioned migrations, plus typed create/read helpers, proven by an insert→read→delete round-trip against the real DB.

**Architecture:** Neon serverless Postgres accessed via the HTTP driver (`@neondatabase/serverless`) through Drizzle's `neon-http` adapter — ideal for Vercel serverless (each query is a fetch; no connection pool to manage). Schema and migrations live in the repo; the DB client is built lazily so importing it never throws when `DATABASE_URL` is absent (tests/build). Provisioned directly on Neon (not the Vercel integration) for simplicity; `DATABASE_URL` is a secret env var in `.env.local` (dev) and Vercel (prod) — the **same** Neon DB backs both.

**Tech Stack:** Neon Postgres, `drizzle-orm` (neon-http), `@neondatabase/serverless`, `nanoid` (review id), `drizzle-kit` + `dotenv` + `tsx` (dev), Vitest.

**Reference:** design doc §4 (data model — overwrite variant). Platforms JSON mirrors the editor's `p` object (`{on, cur, posts:[{copy,img,note}]}`), but `img` is now an R2 URL string.

## Environment

| Name | Example | Notes |
|------|---------|-------|
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require` | Neon **pooled** connection string. Secret. `.env.local` + Vercel prod. |

---

## File structure after Stage 3

```
src/db/
├── schema.ts         reviews table + Platforms/Review types
├── index.ts          lazy Drizzle client (getDb())
└── reviews.ts        newReviewId(), createReview(), getReviewById()
drizzle/
├── 0000_*.sql        generated migration (the CREATE TABLE)
└── meta/             drizzle migration metadata
drizzle.config.ts     drizzle-kit config (loads .env.local via dotenv)
scripts/verify-db.ts  insert -> read -> delete round-trip check
```

---

## Task 1: Provision Neon ⚠️ INTERACTIVE — needs Johan

Plain-language: we create the small database that remembers each review. Sign up, make a database, copy its "connection string" (one secret line that tells our app where the DB is and how to log in).

- [ ] **Step 1 (Johan): Create a Neon database**

Go to **[neon.tech](https://neon.tech)** → **Sign up** (Continue with GitHub is easiest) → it creates a first project automatically (or click **New Project**). Name it `social-approvals`, accept the default region/Postgres version. Free tier is fine.

- [ ] **Step 2 (Johan): Copy the connection string**

On the project dashboard there's a **Connection string** box (it'll show a **Pooled connection** toggle — leave pooling ON). Copy the whole string — it looks like `postgresql://…@ep-…-pooler.…aws.neon.tech/neondb?sslmode=require`. Paste it to Claude. *(This is a secret — handled like the others: `.env.local` + Vercel only, never committed.)*

- [ ] **Step 3 (Claude): Add `DATABASE_URL` to `.env.local`**

Append to `.env.local`:
```
DATABASE_URL=postgresql://…(the pasted string)…
```

- [ ] **Step 4 (Claude): Add `DATABASE_URL` to Vercel (production)**

```bash
set -a; . ./.env.local; set +a
printf '%s' "$DATABASE_URL" | npx vercel@latest env add DATABASE_URL production --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"
```
Verify: `npx vercel@latest env ls production --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"` lists `DATABASE_URL`.

---

## Task 2: Install deps, schema, client, drizzle config

**Files:** Create `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`.

- [ ] **Step 1: Install**

```bash
npm install drizzle-orm @neondatabase/serverless nanoid
npm install -D drizzle-kit dotenv tsx
```

- [ ] **Step 2: `src/db/schema.ts`**

```ts
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

/** One post within a platform (img is an R2 URL once uploaded). */
export type Post = { copy: string; img: string | null; note: string };
export type PlatformState = { on: boolean; cur: number; posts: Post[] };
/** Keyed by platform id: 'x' | 'ig' | 'fb' | 'li'. */
export type Platforms = Record<string, PlatformState>;

export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'revisions';

export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(), // nanoid slug — the public /r/{id}
  campaign: text('campaign').notNull(),
  account: text('account').notNull(),
  handle: text('handle').notNull(),
  asanaTaskGid: text('asana_task_gid').notNull(),
  platforms: jsonb('platforms').$type<Platforms>().notNull(),
  status: text('status').$type<ReviewStatus>().notNull().default('pending'),
  decisionNotes: text('decision_notes'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
```

- [ ] **Step 3: `src/db/index.ts`**

```ts
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

let _db: NeonHttpDatabase<typeof schema> | null = null;

/** Lazily build the Drizzle client so importing this module never throws when DATABASE_URL is absent. */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}
```

- [ ] **Step 4: `drizzle.config.ts`**

```ts
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Confirm drizzle-kit is happy with the config**

Run: `npx drizzle-kit --version` then `npx drizzle-kit generate --help | head -5`
Expected: prints versions/help (confirms the installed drizzle-kit accepts the `generate` command; if the CLI surface differs, adjust Task 3 commands).

- [ ] **Step 6: Verify build still passes**

Run: `npm run build`
Expected: passes (no route imports the DB yet; lazy client means no DATABASE_URL needed at build).

---

## Task 3: Generate + run the migration

**Files:** Creates `drizzle/0000_*.sql` and `drizzle/meta/*`.

- [ ] **Step 1: Generate the migration SQL from the schema**

Run: `npx drizzle-kit generate`
Expected: creates `drizzle/0000_<name>.sql` containing `CREATE TABLE "reviews" (...)`. Open it and confirm the columns match `schema.ts` (id text PK, jsonb platforms, timestamps, etc.).

- [ ] **Step 2: Apply the migration to the Neon DB**

Run: `npx drizzle-kit migrate`
Expected: prints applied migration; no errors. (Uses `DATABASE_URL` via dotenv in `drizzle.config.ts`.)

- [ ] **Step 3: Commit (schema + client + migration)**

```bash
git add -A
git commit -m "feat: reviews schema + Drizzle/Neon client + initial migration

reviews table (overwrite model, design §4): nanoid id, jsonb platforms,
status default 'pending', timestamps. Lazy neon-http client. Migration applied.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Data-access helpers + DB round-trip verification

**Files:** Create `src/db/reviews.ts`, `scripts/verify-db.ts`.

- [ ] **Step 1: `src/db/reviews.ts`**

```ts
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { reviews, type NewReview, type Review } from './schema';

/** Unguessable-enough public slug for /r/{id}. */
export function newReviewId(): string {
  return nanoid(12);
}

export async function createReview(
  data: Omit<NewReview, 'id'> & { id?: string },
): Promise<Review> {
  const id = data.id ?? newReviewId();
  const [row] = await getDb()
    .insert(reviews)
    .values({ ...data, id })
    .returning();
  return row;
}

export async function getReviewById(id: string): Promise<Review | null> {
  const [row] = await getDb().select().from(reviews).where(eq(reviews.id, id)).limit(1);
  return row ?? null;
}
```

- [ ] **Step 2: `scripts/verify-db.ts`**

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { createReview, getReviewById } from '../src/db/reviews';
import { getDb } from '../src/db/index';
import { reviews } from '../src/db/schema';

async function main() {
  const platforms = {
    x: { on: true, cur: 0, posts: [{ copy: 'hello', img: null, note: '' }] },
  };

  const created = await createReview({
    campaign: 'DB verify',
    account: 'Magisterium AI',
    handle: 'magisteriumai',
    asanaTaskGid: '1209888777666555',
    platforms,
  });
  console.log('1/3 inserted:', created.id, '| status:', created.status, '| createdAt:', created.createdAt);
  if (created.status !== 'pending') throw new Error('default status should be pending');

  const got = await getReviewById(created.id);
  if (!got || got.campaign !== 'DB verify' || got.platforms.x.posts[0].copy !== 'hello') {
    throw new Error('read-back mismatch');
  }
  console.log('2/3 read back OK');

  await getDb().delete(reviews).where(eq(reviews.id, created.id));
  const gone = await getReviewById(created.id);
  if (gone) throw new Error('row not deleted');
  console.log('3/3 deleted OK\n\n✅ DB round-trip verified');
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
```

- [ ] **Step 3: Run the round-trip check**

Run: `npx tsx scripts/verify-db.ts`
Expected: prints "1/3 inserted … pending", "2/3 read back OK", "3/3 deleted OK", "✅ DB round-trip verified". This proves the table, types (jsonb round-trips the nested posts), defaults, and the create/read/delete helpers all work against the real Neon DB.

- [ ] **Step 4: Unit test the pure bit (`newReviewId`)**

Create `src/db/reviews.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newReviewId } from '@/db/reviews';

describe('newReviewId', () => {
  it('returns a 12-char url-safe slug, unique each call', () => {
    const a = newReviewId();
    const b = newReviewId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(a).not.toBe(b);
  });
});
```
Run: `npm test` → expected GREEN (this + all prior tests). *(Note: importing `@/db/reviews` pulls in `getDb`, but it's lazy, so the unit test never touches the DB.)*

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: review data-access helpers + DB round-trip verification

createReview/getReviewById (typed), newReviewId (nanoid, unit-tested),
scripts/verify-db.ts asserts insert->read->delete against Neon.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Deploy smoke check

- [ ] **Step 1: Deploy to production**

```bash
npx vercel@latest deploy --prod --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"
```
Expected: READY. (No DB-using route yet, so this just confirms the new deps + DB code build & deploy cleanly with `DATABASE_URL` present.)

- [ ] **Step 2: Confirm the live site still serves**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://social-approvals.vercel.app/
```
Expected: `200`.

---

## Acceptance criteria (Stage 3 done when all true)

- [ ] `reviews` table exists in Neon with the design §4 columns; migration SQL committed under `drizzle/`.
- [ ] `npx tsx scripts/verify-db.ts` passes (insert→read→delete, jsonb round-trips, default status `pending`).
- [ ] `npm test` green (adds `newReviewId` test); `npm run build` passes; deploy READY; live site 200.
- [ ] `DATABASE_URL` set in `.env.local` (gitignored) + Vercel production; not committed.
- [ ] `main` + live static tool still untouched.

## Self-review (against spec §4)

- **Columns:** id, campaign, account, handle, asanaTaskGid, platforms(jsonb), status, decisionNotes, decidedAt, createdAt — all in `schema.ts`. ✓ (`createdBy` intentionally omitted — shared-password model, design §4.)
- **Overwrite model:** no history table; a new round will mutate the row + reset status (the mutation helper lands in Stage 6 with the decision endpoint). ✓
- **id = nanoid:** `newReviewId()` (12 chars), unit-tested. ✓
- **platforms shape:** mirrors editor `p` object with `img` as URL string — `Platforms` type. ✓
- **Serverless-safe client:** neon-http + lazy init (no import-time throw, no pool). ✓
- **Placeholder scan:** every step has exact code/commands; the connection string is the only fill-in (from Task 1). ✓
- **Naming consistency:** `getDb`, `reviews`, `createReview`, `getReviewById`, `newReviewId`, `Platforms`, `Review`, `NewReview` used identically across files. ✓
```
