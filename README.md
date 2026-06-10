# Social Approvals

A one-page tool for Longbeard Creative: build social post mockups for Magisterium AI (X, Instagram, Facebook, LinkedIn), publish a share link, and collect a single Approve / Revisions decision by email.

No backend, no accounts, no credentials. The editor is a self-contained HTML file; every review it generates is another self-contained HTML file that doubles as a permanent record of exactly what was approved.

## Files

- `editor.html` — the builder. Open it, fill in copy and images, hit **Generate review page**.
- `reviews/` — generated review pages land here, one per campaign. Created automatically on your first commit.
- `sample-review.html` — a demo of what your reviewer sees. Open it in a browser and click **Approve all four** to test the email loop end to end (it sends a real email to johan@longbeard.com).

## One-time setup (~5 minutes)

1. Create a new **public** repository named `social-approvals` under `longbeardcreative`.
2. In the repo: Settings → Pages → Source: **Deploy from a branch** → branch `main`, folder `/ (root)` → Save.
3. Upload `editor.html` (and this README) to the repo root and commit.

That's it. The editor now lives at:

```
https://longbeardcreative.github.io/social-approvals/editor.html
```

If you ever use a different account or repo name, open **Repo settings** inside the editor and change the two fields there — the share links and the GitHub upload shortcut are built from them.

## Per campaign

1. Open the editor. Name the campaign — the name becomes the file name and the share link.
2. Fill in copy and drop an image (1080 × 1350) into each platform card. `copy → all` and `image → all` speed up identical posts. Off-ratio images are auto-cropped to 4:5 and flagged.
3. Hit **Generate review page**. Three things happen at once: the baked file downloads, the share link is copied to your clipboard, and a GitHub upload tab opens at the `reviews/` folder.
4. Drag the downloaded file into that tab and commit.
5. About a minute later the link is live. Send it.

## Revision rounds

Re-use the same campaign name. Same name → same file name → committing overwrites the old file → **the same link your reviewer already has now shows the updated set.** No new URL to send. (Use a new name if you'd rather keep the old round viewable.)

## What the reviewer sees

The four mockups exactly as rendered in your live preview, then one decision for the whole set: **Approve all four**, or **Revisions needed** with a box for a Loom link or written notes. Either choice emails johan@longbeard.com automatically (via Web3Forms) with the decision, the feedback, a timestamp, and a link back to the review page. If the send ever fails, the page falls back to a prefilled email draft so feedback can't be lost.

## Troubleshooting

- **No email arrived** — check spam for the first one. Mark it "not spam" and the rest arrive normally.
- **The GitHub tab didn't open** — popup blocker. Use the **Open GitHub upload page** button in the green success panel instead.
- **The link 404s right after committing** — GitHub Pages is still building. Give it a minute; the very first deploy of a repo can take a few.
- **Clipboard didn't copy** — browsers require https for clipboard access, so it always works from the hosted editor; if you're running the file locally, copy the link from the success panel instead.
- **Drafts** — your work autosaves in the browser via localStorage. **Clear draft** wipes it. Drafts don't follow you across browsers or machines.

## Notes on privacy

- Nothing leaves the editor until you commit the generated file to GitHub yourself.
- Review pages carry `noindex` and live at unguessable-enough URLs, but the repo is public — don't put anything in a review you couldn't show outside the team.
- The Web3Forms access key visible in the source can only do one thing: send email *to* Johan. The address itself never appears in page source.
