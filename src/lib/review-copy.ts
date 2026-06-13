// Adaptive review copy, ported from legacy bake() (editor.html:834-842).

export function approveLabel(total: number): string {
  return total === 1 ? 'Approve this post' : `Approve all ${total}`;
}

export function reviewIntro(opts: {
  total: number;
  platformCount: number;
  firstLabel: string;
  anyMulti: boolean;
}): string {
  const { total, platformCount, firstLabel, anyMulti } = opts;
  if (total === 1) {
    return `One post is below, shown as it will appear live on ${firstLabel}. Look it over, then decide at the bottom.`;
  }
  if (platformCount === 1) {
    return `${total} posts for ${firstLabel} are below, shown as they will appear live.${anyMulti ? ' Use the arrows (or swipe) to flip through them.' : ''} Then decide at the bottom.`;
  }
  return `${total} posts across ${platformCount} platforms are below, shown as they will appear live.${anyMulti ? ' Use the arrows (or swipe) where a platform has more than one.' : ''} Then decide at the bottom.`;
}
