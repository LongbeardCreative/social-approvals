# Stage 2: R2 + Presigned Uploads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`). **Task 1 is interactive — Johan must set up Cloudflare R2 (accounts/credentials).** Do that first; the code tasks depend on its output (env vars).

**Goal:** Let the browser upload a normalized 1080×1350 JPEG straight to Cloudflare R2 via a presigned URL, and serve it back from a public R2 domain — proven end-to-end with a real image.

**Architecture:** The browser crops the image to 1080×1350 JPEG in a canvas, asks our Next.js route `POST /api/uploads/presign` for a short-lived presigned PUT URL, then uploads the bytes **directly to R2** (never through our server — Vercel caps request bodies at ~4.5 MB). Images are served from R2's public `pub-<hash>.r2.dev` domain. Presigning runs in the Node.js runtime using the S3-compatible AWS SDK.

**Tech Stack:** Next.js 16 route handler (Node runtime), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `zod` for input validation, Cloudflare R2 (S3-compatible), Vitest.

**Reference:** design doc §2 (CORS gotchas), §3 (architecture), §5 (image pipeline). Crop logic ported from `legacy/editor.html:703-733` (`processFile`). Deploy via CLI to personal scope (see memory `vercel-deploy-setup` / Stage 1) — **not** Git auto-deploy.

---

## Hard constraints (from design §2 — do not violate)

- **R2 CORS `AllowedHeaders` must be exactly `["content-type"]`** — NOT `["*"]`, which silently fails the browser preflight.
- `AllowedMethods` must include `PUT` (upload) and `GET` (serve). `AllowedOrigins`: the app domain + `http://localhost:3000` during dev.
- The presigned PUT is signed with `ContentType: image/jpeg`; the browser's PUT **must** send header `Content-Type: image/jpeg` to match the signature.
- Never route image bytes through a route handler/server action (4.5 MB cap). Browser → R2 directly.

## Environment variables (set in `.env.local` for dev, and on Vercel for prod)

| Name | Example | Notes |
|------|---------|-------|
| `R2_ACCOUNT_ID` | `a1b2c3…` | Cloudflare account ID → endpoint `https://<id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | `…` | from the R2 API token |
| `R2_SECRET_ACCESS_KEY` | `…` | **secret** — never commit/echo |
| `R2_BUCKET` | `social-approvals-assets` | bucket name |
| `R2_PUBLIC_BASE_URL` | `https://pub-<hash>.r2.dev` | bucket's public r2.dev domain (no trailing slash) |

`.env*` is already gitignored (Stage 1). Secrets live only in `.env.local` and Vercel's encrypted env store.

---

## File structure after Stage 2

```
src/
├── app/
│   ├── api/uploads/presign/route.ts   POST → { uploadUrl, publicUrl, key }
│   └── upload-test/page.tsx           TEMPORARY manual test page (removed in Stage 4)
├── lib/
│   ├── r2.ts                          S3 client + bucket/public-url constants
│   ├── r2.test.ts                     unit tests (key format, body schema)
│   ├── image.ts                       crop-to-1080×1350 JPEG (browser) + assess() (pure)
│   ├── image.test.ts                  unit tests for assess()
│   └── upload.ts                      client uploader: crop → presign → PUT
.env.local                            (gitignored) R2 creds for local dev
scripts/verify-r2.mjs                 E2E check: presign → PUT → public GET
```

---

## Task 1: Cloudflare R2 setup ⚠️ INTERACTIVE — needs Johan

Plain-language: we create the cheap image storage ("a bucket"), make it readable by the public, allow the browser to upload into it, and create a key so our app is allowed to write to it.

- [ ] **Step 1 (Johan): Create the bucket**

In the Cloudflare dashboard (dash.cloudflare.com — same account as the existing Worker): **R2** in the left sidebar → **Create bucket** → name it **`social-approvals-assets`** → location Automatic → Create. (R2 may ask you to confirm billing details even on the free tier — that's expected; the free tier covers our usage.)

- [ ] **Step 2 (Johan): Turn on public access (r2.dev domain)**

Open the bucket → **Settings** → **Public access** → enable **r2.dev subdomain** (Allow Access). Copy the public URL it shows — looks like `https://pub-<hash>.r2.dev`. This is `R2_PUBLIC_BASE_URL`.

- [ ] **Step 3 (Johan): Add the CORS policy**

Bucket → **Settings** → **CORS policy** → Edit → paste exactly (replace the domain when a custom one exists later):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://social-approvals.vercel.app"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"]
  }
]
```
⚠️ `AllowedHeaders` is `["content-type"]` exactly — `["*"]` silently breaks the upload preflight.

- [ ] **Step 4 (Johan): Create an R2 API token**

R2 → **Manage R2 API Tokens** (or **API** → Create Token) → **Create API token** → permissions **Object Read & Write** → scoped to the `social-approvals-assets` bucket → Create. Copy the **Access Key ID**, **Secret Access Key**, and note the **Account ID** (shown on the R2 overview / endpoint). Paste these three to Claude.

- [ ] **Step 5 (Claude): Write `.env.local`**

Create `.env.local` (gitignored) with the five values from Steps 1–4:

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=social-approvals-assets
R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
```

- [ ] **Step 6 (Claude): Confirm it's ignored**

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (i.e. it is ignored). If not, stop and add it to `.gitignore`.

---

## Task 2: R2 client + presign route (TDD for the pure parts)

**Files:** Create `src/lib/r2.ts`, `src/lib/r2.test.ts`, `src/app/api/uploads/presign/route.ts`.

- [ ] **Step 1: Install dependencies**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner zod
```

- [ ] **Step 2: Write `src/lib/r2.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';

export const R2_BUCKET = process.env.R2_BUCKET ?? '';
export const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

/** True only when every required R2 env var is present. */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      R2_BUCKET &&
      R2_PUBLIC_BASE_URL,
  );
}

/** Build the S3 client lazily so importing this module never throws when env is absent (tests/build). */
export function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

/** Object key for a normalized upload. Always a .jpg under uploads/. */
export function newObjectKey(): string {
  return `uploads/${crypto.randomUUID()}.jpg`;
}

import { z } from 'zod';
export const PresignBody = z.object({ contentType: z.literal('image/jpeg') });
```

- [ ] **Step 3: Write the failing test `src/lib/r2.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newObjectKey, PresignBody, R2_PUBLIC_BASE_URL } from '@/lib/r2';

describe('newObjectKey', () => {
  it('produces a unique uploads/<uuid>.jpg key', () => {
    const a = newObjectKey();
    const b = newObjectKey();
    expect(a).toMatch(/^uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b);
  });
});

describe('PresignBody', () => {
  it('accepts image/jpeg only', () => {
    expect(PresignBody.safeParse({ contentType: 'image/jpeg' }).success).toBe(true);
    expect(PresignBody.safeParse({ contentType: 'image/png' }).success).toBe(false);
    expect(PresignBody.safeParse({}).success).toBe(false);
  });
});

describe('R2_PUBLIC_BASE_URL', () => {
  it('has no trailing slash', () => {
    expect(R2_PUBLIC_BASE_URL.endsWith('/')).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it FAILS**

Run: `npm test`
Expected: FAIL — `@/lib/r2` exists after Step 2, so this should actually PASS. If Step 2 was done, run it to confirm GREEN; if you wrote the test before `r2.ts`, it fails on missing module. (Either order is fine; the gate is: test green after `r2.ts` exists.)

- [ ] **Step 5: Run the test to verify it PASSES**

Run: `npm test`
Expected: PASS — all `r2` tests green (plus the existing version test).

- [ ] **Step 6: Write `src/app/api/uploads/presign/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, r2Configured, newObjectKey, PresignBody, R2_BUCKET, R2_PUBLIC_BASE_URL } from '@/lib/r2';

export async function POST(request: Request) {
  if (!r2Configured()) {
    return NextResponse.json({ error: 'R2 is not configured' }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = PresignBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const key = newObjectKey();
  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: parsed.data.contentType }),
    { expiresIn: 600 },
  );

  return NextResponse.json({ uploadUrl, publicUrl: `${R2_PUBLIC_BASE_URL}/${key}`, key });
}
```

- [ ] **Step 7: Verify it builds**

Run: `npm run build`
Expected: build passes; route list now includes `ƒ /api/uploads/presign` (ƒ = dynamic/server function).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: R2 client + presigned upload route

POST /api/uploads/presign validates {contentType:'image/jpeg'} with Zod,
returns a short-lived presigned PUT URL + the eventual public URL. S3 client
built lazily (region auto, R2 endpoint). Node runtime.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Client image pipeline + uploader (TDD for assess())

**Files:** Create `src/lib/image.ts`, `src/lib/image.test.ts`, `src/lib/upload.ts`.

- [ ] **Step 1: Write the failing test `src/lib/image.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { assess } from '@/lib/image';

describe('assess', () => {
  it('flags a 4:5 image at full size as ok', () => {
    expect(assess(1080, 1350)).toBe('ok');
    expect(assess(2160, 2700)).toBe('ok'); // 4:5, larger
  });
  it('flags an off-ratio image as cropped', () => {
    expect(assess(1080, 1080)).toBe('cropped'); // square
    expect(assess(1920, 1080)).toBe('cropped'); // landscape
  });
  it('flags an on-ratio but too-small image as upscaled', () => {
    expect(assess(540, 675)).toBe('upscaled'); // 4:5 but < 1080 wide
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/image`.

- [ ] **Step 3: Write `src/lib/image.ts`**

```ts
export const TARGET_W = 1080;
export const TARGET_H = 1350;

export type ImageAssessment = 'ok' | 'cropped' | 'upscaled';

/** Pure: classify a source image by its natural dimensions (ported from legacy processFile). */
export function assess(naturalW: number, naturalH: number): ImageAssessment {
  const ratio = naturalW / naturalH;
  const target = TARGET_W / TARGET_H;
  if (Math.abs(ratio - target) > 0.012) return 'cropped';
  if (naturalW < TARGET_W) return 'upscaled';
  return 'ok';
}

/**
 * Browser-only: cover-fit + center-crop a file to a 1080×1350 JPEG blob (q0.85),
 * on a white background. Mirrors legacy/editor.html processFile().
 */
export async function cropToJpegBlob(
  file: File,
): Promise<{ blob: Blob; assessment: ImageAssessment }> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TARGET_W, TARGET_H);
    const s = Math.max(TARGET_W / bitmap.width, TARGET_H / bitmap.height);
    const w = bitmap.width * s;
    const h = bitmap.height * s;
    ctx.drawImage(bitmap, (TARGET_W - w) / 2, (TARGET_H - h) / 2, w, h);
    const assessment = assess(bitmap.width, bitmap.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
    );
    return { blob, assessment };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `npm test`
Expected: PASS — `assess` tests green. (`cropToJpegBlob` is browser-only and is verified via the test page in Task 4, not here.)

- [ ] **Step 5: Write `src/lib/upload.ts`**

```ts
import { cropToJpegBlob, type ImageAssessment } from '@/lib/image';

/** Browser-only: crop a file, get a presigned URL, PUT it to R2, return the public URL. */
export async function uploadImage(
  file: File,
): Promise<{ publicUrl: string; assessment: ImageAssessment }> {
  const { blob, assessment } = await cropToJpegBlob(file);

  const presignRes = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/jpeg' }),
  });
  if (!presignRes.ok) throw new Error(`Could not get upload URL (${presignRes.status})`);
  const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string };

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  return { publicUrl, assessment };
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: client image pipeline (crop to 1080x1350 JPEG) + uploader

assess() ported + unit-tested; cropToJpegBlob mirrors legacy processFile
(cover-fit, white bg, q0.85). uploadImage: crop -> presign -> direct PUT to R2.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Test page + end-to-end verification

**Files:** Create `src/app/upload-test/page.tsx`, `scripts/verify-r2.mjs`.

- [ ] **Step 1: Write the temporary test page `src/app/upload-test/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { uploadImage } from '@/lib/upload';

export default function UploadTest() {
  const [status, setStatus] = useState<string>('Pick an image to upload.');
  const [url, setUrl] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('Cropping + uploading…');
    setUrl(null);
    try {
      const { publicUrl, assessment } = await uploadImage(file);
      setStatus(`Done (${assessment}).`);
      setUrl(publicUrl);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Upload test (temporary)</h1>
      <input type="file" accept="image/*" onChange={onChange} />
      <p>{status}</p>
      {url && (
        <>
          <p>
            Public URL: <a href={url}>{url}</a>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="uploaded" style={{ width: 216, height: 270, objectFit: 'cover' }} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the automated E2E check `scripts/verify-r2.mjs`**

This requests a presigned URL from the running dev server, PUTs a tiny real JPEG, then fetches the public URL and asserts it serves an image.

```js
// Usage: node scripts/verify-r2.mjs  (requires `npm run dev` running on :3000 with .env.local)
const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

// Minimal valid 1x1 JPEG.
const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwD/2Q==';
const bytes = Buffer.from(JPEG_B64, 'base64');

const presign = await fetch(`${ORIGIN}/api/uploads/presign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contentType: 'image/jpeg' }),
});
if (!presign.ok) throw new Error(`presign failed: ${presign.status} ${await presign.text()}`);
const { uploadUrl, publicUrl } = await presign.json();
console.log('presigned OK; key url:', publicUrl);

const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: bytes });
if (!put.ok) throw new Error(`PUT to R2 failed: ${put.status} ${await put.text()}`);
console.log('PUT to R2 OK');

// public read may take a moment to propagate; retry a few times
let ok = false;
for (let i = 0; i < 10; i++) {
  const get = await fetch(publicUrl);
  if (get.ok && (get.headers.get('content-type') || '').includes('image')) {
    ok = true;
    console.log('public GET OK; content-type:', get.headers.get('content-type'));
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ok) throw new Error('public GET did not return an image');
console.log('\n✅ R2 round-trip verified:', publicUrl);
```

- [ ] **Step 3: Run the automated E2E check**

Start the dev server (background) and run the script:
```bash
npm run dev > /tmp/sa-dev.log 2>&1 &
# wait for ready, then:
node scripts/verify-r2.mjs
# then stop the dev server
```
Expected: prints "presigned OK", "PUT to R2 OK", "public GET OK", and "✅ R2 round-trip verified". If CORS/preflight errors appear in the browser later, re-check Task 1 Step 3 (`AllowedHeaders` must be `["content-type"]`).

- [ ] **Step 4: Browser check of the cropper (visual)**

With the dev server running, open `http://localhost:3000/upload-test`, choose a non-4:5 photo. Expect: status shows "Done (cropped)", and the rendered image is a centered 4:5 crop served from the `pub-<hash>.r2.dev` URL. (Claude can drive this via the browser tools, or Johan can eyeball it.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: upload-test page + scripted R2 round-trip verification

Temporary /upload-test page exercises crop->presign->PUT in a real browser;
scripts/verify-r2.mjs asserts the server-side presign + R2 public round-trip.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Deploy + verify on Vercel

- [ ] **Step 1: Set the R2 env vars on Vercel (production)**

For each of the five vars, pipe the value in (so it isn't echoed in a prompt). Example:
```bash
T="$(cat /tmp/sa-vercel-token)"
printf '%s' 'social-approvals-assets' | npx vercel@latest env add R2_BUCKET production --scope johan-3548s-projects --token="$T"
# …repeat for R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL
```
(Add to `preview` too if preview deploys are used later.)

- [ ] **Step 2: Deploy to production**

```bash
npx vercel@latest deploy --prod --scope johan-3548s-projects --token="$(cat /tmp/sa-vercel-token)"
```
Expected: READY; production alias stays `https://social-approvals.vercel.app`.

- [ ] **Step 3: Verify the live presign route**

```bash
ORIGIN=https://social-approvals.vercel.app node scripts/verify-r2.mjs
```
Expected: same "✅ R2 round-trip verified" against the live deployment. (Confirms env vars + R2 work in production.)

- [ ] **Step 4: Note** — the production CORS origin `https://social-approvals.vercel.app` is already in the Task 1 Step 3 policy, so browser uploads from the live site work.

---

## Acceptance criteria (Stage 2 done when all true)

- [ ] `POST /api/uploads/presign` returns a working presigned PUT URL + public URL; rejects non-`image/jpeg` with 400; returns 500 when R2 env is absent.
- [ ] `scripts/verify-r2.mjs` passes locally AND against the live deployment (presign → PUT → public image GET).
- [ ] The `/upload-test` page crops a real photo to 1080×1350 and shows it served from the r2.dev URL.
- [ ] `npm test` green (r2 + image + version); `npm run build` passes.
- [ ] No secrets committed (`.env.local` ignored; R2 secret only in `.env.local` + Vercel).
- [ ] `main` + live static tool still untouched.

## Self-review (against spec §2/§3/§5)

- **Presigned direct-to-R2 (4.5 MB cap):** uploader PUTs blob straight to R2 — Task 3 Step 5. ✓
- **CORS `["content-type"]` exactly:** Task 1 Step 3 + warning. ✓
- **Node runtime presign, region auto, R2 endpoint:** Task 2 Step 2. ✓
- **Zod-validate public POST:** `PresignBody` + safeParse — Task 2. ✓
- **Image pipeline reuse (1080×1350, q0.85, flagging):** ported in `image.ts` from legacy processFile; `assess()` unit-tested — Task 3. ✓
- **Public r2.dev serving:** `R2_PUBLIC_BASE_URL` + Task 1 Step 2. ✓
- **Placeholder scan:** every code/command step is complete; the `pub-<hash>` / `<id>` are real values filled from Task 1. No TODOs. ✓
- **Naming consistency:** `r2Configured`, `r2Client`, `newObjectKey`, `PresignBody`, `assess`, `cropToJpegBlob`, `uploadImage` used identically across tasks. ✓
```
