'use client';

import { useReducer, useState } from 'react';
import { reducer, initialState, PLATFORMS } from '@/components/editor-state';
import { PlatformCard } from '@/components/PlatformCard';
import { AVATAR } from '@/components/avatar';
import { parseTask } from '@/lib/asana';
import s from '@/components/editor.module.css';

export default function EditorPage() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const gid = parseTask(state.asanaTask);
  const asanaHintCls = !state.asanaTask.trim()
    ? s.hint
    : gid
      ? `${s.hint} ${s.ok}`
      : `${s.hint} ${s.bad}`;
  const asanaHintText = !state.asanaTask.trim()
    ? 'Create the Asana task first, then paste its link here — the decision gets posted to that task.'
    : gid
      ? `✓ Task ${gid} detected — the decision will be commented there and the task assigned back to you.`
      : 'No task ID found in that — paste the full task URL from Asana (or the bare numeric ID).';

  const reviewUrl = createdId ? `${window.location.origin}/r/${createdId}` : '';

  async function create() {
    setErr(null);
    if (!state.campaign.trim()) return setErr('Add a campaign name.');
    if (!gid) return setErr('Paste a valid Asana task link.');
    if (!Object.values(state.platforms).some((p) => p.on))
      return setErr('Turn on at least one platform.');

    setBusy(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign: state.campaign,
          account: state.account,
          handle: state.handle,
          asanaTaskGid: gid,
          platforms: state.platforms,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Failed (${res.status})`);
      }
      const { id } = (await res.json()) as { id: string };
      setCreatedId(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.app}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.mark} src={AVATAR} alt="Magisterium AI logo" />
          <div>
            <h1>Social Approvals</h1>
            <div className={s.sub}>Longbeard Creative · Magisterium AI asset review builder</div>
          </div>
        </header>

        <section className={s.bar} aria-label="Campaign setup">
          <div className={s.barGrid}>
            <div className={s.field}>
              <label>Campaign name</label>
              <input
                className={s.input}
                value={state.campaign}
                placeholder="e.g. Pentecost launch — June"
                onChange={(e) => dispatch({ type: 'field', key: 'campaign', value: e.target.value })}
              />
            </div>
            <div className={s.field}>
              <label>Account name</label>
              <input
                className={s.input}
                value={state.account}
                onChange={(e) => dispatch({ type: 'field', key: 'account', value: e.target.value })}
              />
            </div>
            <div className={s.field}>
              <label>Handle</label>
              <input
                className={s.input}
                value={state.handle}
                onChange={(e) => dispatch({ type: 'field', key: 'handle', value: e.target.value })}
              />
            </div>
            <div className={`${s.field} ${s.span}`}>
              <label>Asana task link</label>
              <input
                className={s.input}
                value={state.asanaTask}
                placeholder="https://app.asana.com/… — paste the task this review belongs to"
                onChange={(e) => dispatch({ type: 'field', key: 'asanaTask', value: e.target.value })}
              />
              <div className={asanaHintCls}>{asanaHintText}</div>
            </div>
          </div>
          <div className={s.barfoot}>
            <div className={s.urlprev}>
              The review link is created instantly when you generate — no file to upload.
            </div>
            <button
              className={`${s.btn} ${s.btnGhost}`}
              type="button"
              onClick={() => {
                dispatch({ type: 'reset' });
                setCreatedId(null);
                setErr(null);
              }}
            >
              Clear draft
            </button>
            <button className={`${s.btn} ${s.btnGold}`} type="button" onClick={create} disabled={busy}>
              {busy ? 'Generating…' : 'Generate review page'}
            </button>
          </div>
          {err && !createdId && (
            <div className={s.errorMsg} style={{ marginTop: 10 }}>
              {err}
            </div>
          )}
        </section>

        {createdId && (
          <section className={s.done} aria-live="polite">
            <h2>Review created</h2>
            <p>
              Paste this link into the Asana task and assign Matthew. It is live immediately — no
              upload, no wait.
            </p>
            <div className={s.linkrow}>
              <input className={s.input} readOnly value={reviewUrl} aria-label="Share link" />
              <button
                className={`${s.btn} ${s.btnGhost}`}
                type="button"
                onClick={() => navigator.clipboard?.writeText(reviewUrl)}
              >
                Copy link
              </button>
            </div>
            <div className={s.acts}>
              <button
                className={`${s.btn} ${s.btnGhost}`}
                type="button"
                onClick={() => setCreatedId(null)}
              >
                Create another
              </button>
            </div>
            <p className={s.miniNote}>
              Note: that link opens the reviewer&apos;s page, which is built in the next stage.
            </p>
          </section>
        )}

        <main className={s.cardsGrid}>
          {PLATFORMS.map(({ id, label }) => (
            <PlatformCard
              key={id}
              id={id}
              label={label}
              pstate={state.platforms[id]}
              account={state.account}
              handle={state.handle}
              dispatch={dispatch}
            />
          ))}
        </main>

        <footer className={s.footer}>
          Self-contained editor · creates an instant review link · nothing leaves this page until you
          generate
        </footer>
      </div>
    </div>
  );
}
