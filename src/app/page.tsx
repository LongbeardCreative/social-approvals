'use client';

import { useReducer, useState } from 'react';
import { reducer, initialState, PLATFORMS } from '@/components/editor-state';
import { PlatformCard } from '@/components/PlatformCard';
import { parseTask } from '@/lib/asana';
import s from '@/components/editor.module.css';

export default function EditorPage() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const gid = parseTask(state.asanaTask);
  const asanaHint = !state.asanaTask.trim()
    ? { cls: s.hint, text: 'Create the Asana task first, then paste its link here.' }
    : gid
      ? { cls: `${s.hint} ${s.ok}`, text: `✓ Task ${gid} detected — the decision will post there.` }
      : { cls: `${s.hint} ${s.bad}`, text: 'No task ID found — paste the full Asana task URL.' };

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
      <header className={s.header}>
        <h1>
          Social <span className={s.gold}>Approvals</span>
        </h1>
      </header>

      <div className={s.wrap}>
        <section className={s.bar}>
          <div className={s.field}>
            <label>Campaign</label>
            <input
              className={s.input}
              value={state.campaign}
              placeholder="e.g. Pentecost launch — June"
              onChange={(e) => dispatch({ type: 'field', key: 'campaign', value: e.target.value })}
            />
          </div>
          <div className={s.field}>
            <label>Asana task link</label>
            <input
              className={s.input}
              value={state.asanaTask}
              placeholder="https://app.asana.com/…"
              onChange={(e) => dispatch({ type: 'field', key: 'asanaTask', value: e.target.value })}
            />
          </div>
          <div className={s.field}>
            <label>Account</label>
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
            <div className={asanaHint.cls}>{asanaHint.text}</div>
          </div>
        </section>

        <main className={s.grid}>
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

        {!createdId && (
          <div className={s.createRow}>
            <button className={`${s.btn} ${s.btnGold}`} type="button" onClick={create} disabled={busy}>
              {busy ? 'Creating…' : 'Create review'}
            </button>
            {err && <span className={s.errorMsg}>{err}</span>}
          </div>
        )}

        {createdId && (
          <div className={s.success}>
            <h2>Review created ✓</h2>
            <p className={s.hint}>Paste this link into the Asana task and assign Matthew.</p>
            <div className={s.linkBox}>
              <span className={s.linkUrl}>{reviewUrl}</span>
              <button
                className={`${s.btn} ${s.btnGold}`}
                type="button"
                onClick={() => navigator.clipboard?.writeText(reviewUrl)}
              >
                Copy link
              </button>
              <button className={s.btn} type="button" onClick={() => setCreatedId(null)}>
                Create another
              </button>
            </div>
            <p className={s.hint} style={{ marginTop: 10 }}>
              Note: that link opens the reviewer page, which is built in the next stage.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
