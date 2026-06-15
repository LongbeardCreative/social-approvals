# Social Approvals — Asana Status Badge + Copy/Images Decision Routing (Design)

**Status:** Draft for Johan's review, 2026-06-15.
**Branch:** to be created off `migration` when implementation starts (e.g. `feat/asana-status-routing`).
**Builds on:** the completed migration (`migration` branch). No change to the workbook auto-fill — that is a
separate, deferred round (see Non-goals).

---

## Plain-English summary (for Johan)

Two changes to the tool you already have:

1. **A status line in the editor.** When you paste an Asana task link, the app peeks at that task's
   checklist (its subtasks) and shows you two little markers — **Copy** and **Images** — each either
   *approved* or *pending*. So at a glance you know "copy's signed off, images aren't yet" without
   opening Asana. It reads this using the same "Review Bot" Asana login the app already uses; nothing new
   to set up.

2. **The review page can decide on copy and images separately, and send each to the right person.**
   Today Matthew clicks one "Approve all / Revisions" and it always comes back to you. After this change,
   Matthew first picks **Copy**, **Images**, or **Everything**, then approves or asks for revisions. The
   app then routes it:
   - **Copy** decisions go to **Jenna** (the task is handed to her in Asana).
   - **Images** decisions come to **you**, exactly like today.
   - **Everything** comes to you, with **Jenna notified** in the comment.
   - And when Matthew *approves* copy or images on the page, the app also ticks the matching
     "Matthew Approves…" box in Asana for him — so your new status line updates by itself.

Everything else (how you build mockups, the share link, revision rounds) stays the same.

---

## Settled decisions (from the brainstorm)

| # | Question | Decision |
|---|----------|----------|
| 1 | Build order | Status badge (#1) + routing (#3) **now**; workbook auto-fill (#2) deferred to its own round. |
| 2 | How "approved" is detected | A **specific gate subtask being ticked** (one clear milestone each), not a range of steps. |
| 3 | Copy gate | Subtask **"Matthew Approves Copy"** completed. (Confirmed on the live template task.) |
| 4 | Images gate | Subtask **"Matthew Approves Creative"** completed. (Confirmed on the live template task.) |
| 5 | Review-page decision UI | **Pick a scope** (Copy / Images / Everything), then Approve / Revisions. Closest to today's page. |
| 6 | "Everything" routing | Task back to **Johan**, single comment covering both, **Jenna @-mentioned**. |
| 7 | Auto-tick on approval | **Yes** — approving copy/images on the page ticks the matching gate subtask in Asana. Never on revisions. |
| 8 | Copy reviewer | **Jenna Schulze**, `jenna@longbeard.com` — confirmed already a member of the Asana workspace. |
| 9 | Default scope on review page | **Everything** — one-click approve-all, closest to today; Matthew narrows to Copy/Images for a partial sign-off. |
| 10 | Badge label for the creative gate | **"Images"** (Johan's word), even though the Asana subtask is "…Creative". |

## Scope / non-goals

**In scope:** the editor status badge; scoped (copy/images/everything) decisions on the review page;
routing each decision to the right assignee; auto-ticking the gate subtask on approval; tracking the two
decisions independently.

**Non-goals (this round):** workbook copy auto-fill (#2); per-user accounts; immutable revision history;
changing how mockups are built or how images are uploaded.

---

## Feature 1 — Editor status badge

### Behaviour
- Appears in the editor's campaign-setup bar, **directly under the "Asana task link" field**, next to the
  existing "task detected" hint.
- Shows two markers: **Copy — approved/pending** and **Images — approved/pending**.
- Fetches when a valid task id is present in the field (reuses `parseTask`), debounced (~500 ms) so it
  doesn't fire on every keystroke. A small "refresh" affordance re-checks on demand.
- If the task can't be read (deleted, no access) or has none of the gate subtasks, it shows a quiet
  **"status unavailable"** rather than guessing — it never blocks creating/saving a review.

### Endpoint
- New **gated** route `GET /api/asana/status?gid=<taskGid>` (editor-only; guarded by `isAuthed()` like the
  other editor APIs). Returns `{ ok: true, copy: 'approved'|'pending', images: 'approved'|'pending' }`,
  or `{ ok: false }` when the task/subtasks can't be read.
- Implemented with the existing `ASANA_TOKEN` (read scope already confirmed working).

### Matching rule
- List the task's subtasks (`GET /tasks/{gid}/subtasks?opt_fields=name,completed`).
- **Copy** = the subtask whose name contains `"approves copy"` (case-insensitive) is `completed`.
- **Images** = the subtask whose name contains `"approves creative"` (case-insensitive) is `completed`.
- Matching ignores the leading number ("3. Matthew Approves Copy") and case, so renumbering/reordering
  the template won't break it. The two fragments live as named constants in `lib/asana.ts`.

---

## Feature 2 — Scoped decision routing

### Review-page UI (`Decision.tsx` + `review-copy.ts`)
- A **scope selector** (segmented control): **Copy · Images · Everything**.
- Then the existing two actions: an **Approve** button (label adapts: "Approve copy" / "Approve images" /
  "Approve all N") and **Revisions needed** (which reveals the feedback textarea, as today).
- The panel sub-text explains routing: *"Copy goes to Jenna; images come to Johan."*
- The page (RSC) reflects current per-scope state on load: an already-decided scope shows as
  decided (e.g. "Copy — approved ✓") while the other stays actionable. The same link stays live across
  visits and revision rounds.
- **Default selected scope:** **Everything** (one-click approve-all, closest to today's single decision;
  Matthew narrows to Copy/Images for a partial sign-off).
- The success message names where it went ("…posted to Asana and sent to Jenna").
- The email fallback (when the network blocks the POST) targets the routed person:
  `jenna@longbeard.com` for copy, `johan@longbeard.com` for images/everything.

### Routing rules

| Scope | Asana assignee | Also notified | Gate ticked **on approval** |
|-------|----------------|---------------|------------------------------|
| Copy | Jenna (`ASSIGNEE_COPY`) | — | "Matthew Approves Copy" |
| Images | Johan (`ASSIGNEE`) | — | "Matthew Approves Creative" |
| Everything | Johan (`ASSIGNEE`) | Jenna (@-mention) | both gates |

- **Revisions requested:** posts the feedback as the comment, routes by the same rule, and **never** ticks
  a gate.
- **Comment text** names the scope, e.g. `✅ Copy approved by Matthew`, `🔁 Images — revisions requested
  by Matthew: …`, `✅ Copy + images approved by Matthew`.

### Decision endpoint (`POST /api/reviews/[id]/decision`) — changes
- Body gains `scope: 'copy' | 'images' | 'everything'` (plus existing `decision`, `feedback`).
- Resolves, from the scope: the assignee, the gate subtask(s), the comment text, which status field(s) to
  update, and whether to mention Jenna.
- Order of operations (per scope): post comment → reassign to the routed person → **if approved**, find &
  complete the gate subtask(s) → **if everything**, @-mention/notify Jenna. Subtask-ticking and the
  mention are **best-effort**: if they fail, the decision still succeeds with a warning (same pattern as
  today's reassign-failure warning), because the comment is the thing that must not be lost.
- **`alreadyDecided` becomes per-scope:** a scope that's already decided (and not reset by a new revision
  round) is not re-posted; the other scope stays open. "Everything" is blocked only when both are decided.

### Asana integration (`lib/asana.ts`) — new/extended helpers
- `getSubtasks(task, token)` — list subtasks (shared by the status endpoint and gate-ticking).
- `readGateStatus(task, token)` → `{ copy, images }` for the badge.
- `completeGate(task, token, fragment)` — find the gate subtask by name fragment and PUT `completed: true`.
- `addMention(task, token, gid)` — notify Jenna on "everything" (Asana `html_text` mention with
  `data-asana-gid`, and/or add as follower).
- `postDecisionToAsana(...)` extended to take the resolved `assignee`, the gate fragment(s) to complete
  (on approval), and an optional mention gid.

---

## Data model (`reviews` table)

Add per-scope decision tracking (Drizzle migration via `drizzle-kit generate`):

| Column | Type | Notes |
|--------|------|-------|
| `copy_status` | text | `'pending' \| 'approved' \| 'revisions'`, default `'pending'` |
| `image_status` | text | same enum, default `'pending'` |
| `copy_notes` | text (nullable) | feedback from a copy-revisions decision |
| `image_notes` | text (nullable) | feedback from an images-revisions decision |
| `copy_decided_at` | timestamptz (nullable) | |
| `image_decided_at` | timestamptz (nullable) | |

- The existing `status` / `decisionNotes` / `decidedAt` columns are kept as an **overall roll-up**,
  maintained whenever a scope decision is recorded: `approved` only when both sides are approved;
  `revisions` if either side is in revisions; otherwise `pending`. This keeps anything reading `status`
  working.
- **A new revision round** (`updateReview`, edit-in-place) resets both `copy_status` and `image_status`
  to `'pending'` and clears the per-scope notes/timestamps, alongside the existing reset.
- **Existing rows** get the new columns by default (`pending`); the handful of test reviews are
  inconsequential.
- `db/reviews.ts` gains a `markScopeDecided(id, scope, decision, notes)` helper and the roll-up logic.

## Configuration (env — values go in `.env.local` + Vercel, not the repo)

| Var | Status | Value / meaning |
|-----|--------|-----------------|
| `ASANA_TOKEN` | existing | Review Bot token (read confirmed). |
| `ASSIGNEE` | existing | `johan@longbeard.com` — images + everything. |
| `REVIEWER` | existing | `Matthew` — name used in comments. |
| `ASSIGNEE_COPY` | **new** | `jenna@longbeard.com` — copy decisions. |
| `COPY_REVIEWER_GID` | **new** | Jenna's Asana user id (for the "everything" @-mention). Provided in chat; store in env only. |

Gate name fragments (`"approves copy"`, `"approves creative"`) are code constants, not env.

## Testing (Vitest, extending the current suite)

- **Unit — gate matching:** `"3. Matthew Approves Copy"` → copy gate; `"Matthew Approves Creative"` →
  images gate; case/number-insensitive; missing gate → not-approved, no throw.
- **Unit — routing resolution:** each scope → correct assignee, gate(s), comment text, status field(s).
- **Unit — roll-up status:** both approved → `approved`; either revisions → `revisions`; else `pending`.
- **Component — `Decision`:** scope selector switches the Approve label and the routing sub-text; revise
  flow still works.
- **Route — decision:** per-scope happy paths (Asana mocked); per-scope `alreadyDecided`; best-effort
  gate-tick failure still returns success-with-warning.
- **Route — status endpoint:** returns the right copy/images states; `ok:false` when unreadable; gated.
- Existing tests stay green.

## Verification (manual, before calling it done)

- Use the live test task **"Test - Duplicate of Social Post - Template (Hermes)"** (gid in chat).
- In the editor: paste its link → badge shows Copy/Images = pending. Tick "Matthew Approves Copy" in
  Asana, refresh → Copy = approved.
- On a test review: Approve **Copy** → confirms comment + task reassigned to Jenna + "Approves Copy"
  ticked; Approve **Images** → comment + task to Johan + "Approves Creative" ticked; **Everything** →
  comment + to Johan + Jenna mentioned + both ticked. Revisions on each → comment with feedback, correct
  routing, no gate ticked.
