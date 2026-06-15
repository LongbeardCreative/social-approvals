'use client';

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
