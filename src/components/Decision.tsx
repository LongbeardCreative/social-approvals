'use client';

import { useState, type ReactNode } from 'react';
import s from './review.module.css';
import type { DecisionScope, ScopeStatus } from '@/db/schema';

type DecisionKind = 'Approved' | 'Revisions requested';

const SCOPES: { id: DecisionScope; label: string }[] = [
  { id: 'copy', label: 'Copy' },
  { id: 'images', label: 'Images' },
  { id: 'everything', label: 'Everything' },
];

export function Decision({
  reviewId,
  campaign,
  total,
  copyStatus,
  imageStatus,
}: {
  reviewId: string;
  campaign: string;
  total: number;
  copyStatus: ScopeStatus;
  imageStatus: ScopeStatus;
}) {
  const [scope, setScope] = useState<DecisionScope>('everything');
  const [phase, setPhase] = useState<'buttons' | 'revise' | 'done'>('buttons');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errNode, setErrNode] = useState<ReactNode>(null);

  const goesToJenna = scope === 'copy';
  const recipient = goesToJenna ? 'Jenna' : 'Johan';
  const approveLabel =
    scope === 'copy' ? 'Approve copy' : scope === 'images' ? 'Approve images' : `Approve all ${total}`;

  function mailto(decision: DecisionKind, notes: string) {
    const addr = goesToJenna ? 'jenna@longbeard.com' : 'johan@longbeard.com';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const subject = encodeURIComponent(`${decision} (${scope}): ${campaign}`);
    const body = encodeURIComponent(
      `Decision: ${decision} | Scope: ${scope} | Feedback: ${notes || '-'} | Review page: ${url}`,
    );
    return `mailto:${addr}?subject=${subject}&body=${body}`;
  }

  function fail(decision: DecisionKind, notes: string) {
    setErrNode(
      <>
        The notification could not be sent from here (network blocked?).{' '}
        <a href={mailto(decision, notes)}>Email {recipient} directly</a> — the draft is prefilled with
        your decision.
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
        body: JSON.stringify({ scope, decision, feedback: notes.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean } | null;
      if (res.ok && j?.success) {
        setOkMsg(
          decision === 'Approved'
            ? `Approved — posted to the Asana task and sent to ${recipient}. Thank you.`
            : `Feedback sent — posted to the Asana task and sent to ${recipient}. Thank you.`,
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
      <div className={s.scopeRow} role="group" aria-label="What are you reviewing?">
        {SCOPES.map((sc) => (
          <button
            key={sc.id}
            type="button"
            className={`${s.scopeBtn} ${scope === sc.id ? s.scopeOn : ''}`}
            aria-pressed={scope === sc.id}
            onClick={() => setScope(sc.id)}
          >
            {sc.label}
          </button>
        ))}
      </div>
      <p className={s.routeHint}>
        Copy goes to Jenna · images come to Johan. (Copy {copyStatus}, images {imageStatus}.)
      </p>
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
