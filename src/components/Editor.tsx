'use client';

import { useReducer, useState } from 'react';
import { reducer, initialState, PLATFORMS, type EditorState } from '@/components/editor-state';
import { PlatformCard } from '@/components/PlatformCard';
import { AVATAR } from '@/components/avatar';
import { parseTask } from '@/lib/asana';
import s from '@/components/editor.module.css';

type Result = { id: string; mode: 'created' | 'saved' };

export function Editor({ initial, reviewId }: { initial?: EditorState; reviewId?: string }) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => i ?? initialState());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const editing = Boolean(reviewId);
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

  const reviewUrl = result ? `${window.location.origin}/r/${result.id}` : '';

  async function submit() {
    setErr(null);
    if (!state.campaign.trim()) return setErr('Add a campaign name.');
    if (!gid) return setErr('Paste a valid Asana task link.');
    if (!Object.values(state.platforms).some((p) => p.on))
      return setErr('Turn on at least one platform.');

    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/reviews/${reviewId}` : '/api/reviews', {
        method: editing ? 'PUT' : 'POST',
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
      setResult({ id, mode: editing ? 'saved' : 'created' });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const anchorBtn = `${s.btn} ${s.btnGhost}`;
  const anchorStyle = { display: 'inline-block', textDecoration: 'none' } as const;

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.app}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.mark} src={AVATAR} alt="Magisterium AI logo" />
          <div>
            <h1>Social Approvals</h1>
            <div className={s.sub}>
              {editing
                ? 'Editing an existing review · saving updates the same link'
                : 'Longbeard Creative · Magisterium AI asset review builder'}
            </div>
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
              {editing
                ? 'Saving updates the existing review link — Matthew sees the new set at the same URL.'
                : 'The review link is created instantly when you generate — no file to upload.'}
            </div>
            <button
              className={`${s.btn} ${s.btnGhost}`}
              type="button"
              onClick={() => {
                if (editing) {
                  window.location.reload();
                } else {
                  dispatch({ type: 'reset' });
                  setResult(null);
                  setErr(null);
                }
              }}
            >
              {editing ? 'Revert' : 'Clear draft'}
            </button>
            <button className={`${s.btn} ${s.btnGold}`} type="button" onClick={submit} disabled={busy}>
              {editing
                ? busy
                  ? 'Saving…'
                  : 'Save changes'
                : busy
                  ? 'Generating…'
                  : 'Generate review page'}
            </button>
          </div>
          {err && !result && (
            <div className={s.errorMsg} style={{ marginTop: 10 }}>
              {err}
            </div>
          )}
        </section>

        {result && (
          <section className={s.done} aria-live="polite">
            <h2>{result.mode === 'created' ? 'Review created' : 'Saved — the link is updated'}</h2>
            <p>
              {result.mode === 'created'
                ? 'Paste this link into the Asana task and assign Matthew. It is live immediately — no upload, no wait.'
                : "Matthew's existing link now shows the updated set and is back to pending."}
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
              <a className={anchorBtn} style={anchorStyle} href={reviewUrl} target="_blank" rel="noopener noreferrer">
                Open review
              </a>
              {result.mode === 'created' && (
                <>
                  <a className={anchorBtn} style={anchorStyle} href={`/edit/${result.id}`}>
                    Edit this review
                  </a>
                  <button
                    className={`${s.btn} ${s.btnGhost}`}
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'reset' });
                      setResult(null);
                    }}
                  >
                    Create another
                  </button>
                </>
              )}
            </div>
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
          Self-contained editor · creates an instant review link · changes save to the same link
        </footer>
      </div>
    </div>
  );
}
