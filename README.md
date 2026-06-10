# Social Approvals

A one-page tool for Longbeard Creative: build social post mockups for Magisterium AI (X, Instagram, Facebook, LinkedIn), publish a share link, and collect a single Approve / Revisions decision — posted straight onto the Asana task, with the task assigned back to Johan automatically.

No backend you have to maintain, no paid services. The editor is one self-contained HTML file; every review it generates is another self-contained HTML file that doubles as a permanent record of what was approved. One tiny Cloudflare Worker (free) holds the Asana token, because a token can never live inside a public page.

## Files

- `editor.html` — the builder. Lives in this repo, opens in any browser.
- `worker.js` — the relay code you paste into a Cloudflare Worker (one time).
- `reviews/` — generated review pages land here, one per campaign. Created automatically on first commit.
- `sample-review.html` — a visual demo of what Matthew sees. Its buttons point at a placeholder relay, so clicking them demonstrates the failure fallback (a prefilled email) rather than posting to Asana. The real end-to-end test comes at the end of setup below.

## One-time setup

### A. Repo + Pages (~3 min — skip if already done)

1. Create a **public** repo named `social-approvals` under `longbeardcreative`.
2. Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)` → Save.
3. Upload `editor.html` to the repo root and commit. The editor is then live at
   `https://longbeardcreative.github.io/social-approvals/editor.html`

### B. The Review Bot account (~5 min, no new mailbox)

The bot is a second Asana account on a **plus-alias of your own email** — `johan+reviewbot@longbeard.com`. Mail to that address lands in your normal inbox, so there is nothing new to create or check.

1. Sanity check the alias first: email yourself at `johan+reviewbot@longbeard.com` and confirm it arrives (Google Workspace and Microsoft 365 both support this out of the box). If it bounces, ask your mail admin to enable plus-addressing or add a real alias — or fall back to any outside-domain address you already own.
2. Go to asana.com and **sign up with email + password** using the alias. ⚠️ Do **not** use "Continue with Google" — Google ignores the `+` part and would simply sign you into your own account. The verification email arrives in your inbox; confirm it, name the account **Review Bot**, and join the Longbeard organization when prompted. (A longbeard.com address joins as a *member*: on a paid Asana plan that occupies a seat; on the free plan it is just one of the ten.)
3. From **your own** account, add Review Bot to the team/project where review tasks live. If the bot can't see the task, Asana returns 403 and nothing posts — this is the #1 thing to get right.
4. **Logged in as the bot** (use an incognito/private window so your own session stays intact), open `https://app.asana.com/0/my-apps` → Personal access tokens → **Create new token**. Copy it for step C.

### C. The Cloudflare Worker (~5 min)

1. Create a free account at `dash.cloudflare.com`.
2. Workers & Pages → **Create** → Create Worker → Deploy the hello-world → **Edit code** → replace everything with the contents of `worker.js` → **Deploy**.
3. Worker → Settings → **Variables and Secrets**:
   - `ASANA_TOKEN` (type **Secret**) = the bot's token from step B3
   - `ASSIGNEE` (type Text) = `johan@longbeard.com` — must exactly match your Asana login email
   - `REVIEWER` (type Text, optional) — the name in the comment; defaults to **Matthew** if unset
4. Copy the worker's URL (looks like `https://social-approvals-relay.<account>.workers.dev`).
5. Open the editor → **Repo settings** → paste it into **Relay URL**. Saved in your browser; baked into every page you generate from then on.

### D. End-to-end test (~2 min)

Create a scratch task in the project, paste its link into the editor, generate a quick review, commit it, open the live link, and click **Approve all four**. Within a couple of seconds the scratch task should show a "✅ Approved by Matthew" comment from Review Bot and be assigned to you. Delete the scratch task; you're done.

## Per campaign

1. Create the Asana task as usual and copy its link.
2. Open the editor: paste the task link (the hint confirms the task ID), name the campaign, fill in copy + images. `copy → all` / `image → all` speed up identical posts; off-ratio images are auto-cropped to 4:5 and flagged.
3. Hit **Generate review page** — the file downloads, the share link lands on your clipboard, and a GitHub upload tab opens at `reviews/`.
4. Drag the file in, commit, paste the share link into the Asana task, assign Matthew.
5. Matthew clicks **Approve all four**, or **Revisions needed** + a Loom link or notes. Either way the bot comments “✅ Approved by Matthew” or “🔁 Revisions requested by Matthew” (plus his notes and the review link) and the task returns to you. If the relay is ever unreachable, the page falls back to a prefilled email so nothing is lost.

## Revision rounds

Re-use the same campaign name. Same name → same file name → committing overwrites → **the link Matthew already has now shows the updated set**, and his next click posts to the same task again. Use a new name only if you want the old round preserved.

## Hardening (optional, after the end-to-end test works)

In the Worker's variables add `ALLOWED_ORIGIN` = `https://longbeardcreative.github.io`. The relay then refuses browser calls from any other site. Leave it unset while testing locally.

## Troubleshooting

- **403 / "comment failed" in Asana** — the bot isn't a member of the project (or the task is private). Add Review Bot to the project.
- **Asana keeps opening *your* account while setting up the bot** — you used "Continue with Google"; the alias account needs email + password sign-in. (If your org enforces Google SSO in Asana, password accounts on your domain are blocked — use an outside-domain alias instead.)
- **Comment posts but the task doesn't come back to you** — `ASSIGNEE` doesn't match your Asana login email exactly.
- **"No task ID found"** in the editor — paste the full task URL from the browser address bar (or the bare numeric ID).
- **Buttons show the email fallback** — the relay URL is wrong/unreachable, or `ALLOWED_ORIGIN` is set and you're testing from a different origin (e.g. a local file). Check the Worker's live logs: Worker → Logs → Begin log stream, then click the button again.
- **GitHub tab didn't open** — popup blocker; use the button in the green success panel.
- **Link 404s right after committing** — Pages is still building; give it a minute.
- **Drafts** — autosaved per-browser via localStorage. **Clear draft** wipes the campaign (keeps repo + relay settings).

## Notes on privacy and trust

- The Asana token lives **only** inside the Worker as a secret — never in any page, never in the repo.
- Review pages are public-but-unlisted (`noindex`, unguessable-enough URLs). Anyone who has a review link could technically press its buttons — same trust model as a shared Loom. Review Bot only has access to the teams and projects you add it to.
- Nothing leaves the editor until you commit the generated file yourself.
