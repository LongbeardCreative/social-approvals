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
          <button
            className={s.bGold}
            type="button"
            disabled={busy}
            onClick={() => submit('Approved', '')}
          >
            {approveLabel}
          </button>
          <button
            className={s.bLine}
            type="button"
            disabled={busy}
            onClick={() => setPhase('revise')}
          >
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
