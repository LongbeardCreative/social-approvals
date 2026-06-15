'use client';

import { useEffect, useState } from 'react';
import s from '@/components/editor.module.css';
import type { GateStatus } from '@/lib/asana';

type Pair = { copy: GateStatus; images: GateStatus };
type BadgeState = 'loading' | 'unavailable' | Pair;

function Item({ label, value }: { label: string; value: GateStatus }) {
  const cls = value === 'approved' ? `${s.statusItem} ${s.approved}` : `${s.statusItem} ${s.pending}`;
  return (
    <span className={cls}>
      {label} {value === 'approved' ? 'approved' : 'pending'}
    </span>
  );
}

export function StatusBadge({ state }: { state: BadgeState }) {
  if (state === 'loading') return <div className={s.statusRow}>Checking Asana…</div>;
  if (state === 'unavailable') return <div className={s.statusRow}>Asana status unavailable</div>;
  return (
    <div className={s.statusRow}>
      <Item label="Copy" value={state.copy} />
      <Item label="Images" value={state.images} />
    </div>
  );
}

export function AsanaStatus({ gid }: { gid: string }) {
  const [state, setState] = useState<BadgeState>('loading');

  useEffect(() => {
    if (!gid) return;
    let live = true;
    setState('loading');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/asana/status?gid=${encodeURIComponent(gid)}`);
        const j = (await res.json()) as { ok?: boolean; copy?: GateStatus; images?: GateStatus };
        if (!live) return;
        setState(j.ok && j.copy && j.images ? { copy: j.copy, images: j.images } : 'unavailable');
      } catch {
        if (live) setState('unavailable');
      }
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [gid]);

  return <StatusBadge state={state} />;
}
