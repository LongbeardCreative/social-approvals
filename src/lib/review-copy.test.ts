import { describe, it, expect } from 'vitest';
import { approveLabel, reviewIntro } from '@/lib/review-copy';

describe('approveLabel', () => {
  it('singular vs plural', () => {
    expect(approveLabel(1)).toBe('Approve this post');
    expect(approveLabel(5)).toBe('Approve all 5');
  });
});

describe('reviewIntro', () => {
  it('one post', () => {
    expect(reviewIntro({ total: 1, platformCount: 1, firstLabel: 'X', anyMulti: false })).toBe(
      'One post is below, shown as it will appear live on X. Look it over, then decide at the bottom.',
    );
  });
  it('one platform, multiple posts, with swipe hint', () => {
    const t = reviewIntro({ total: 3, platformCount: 1, firstLabel: 'X', anyMulti: true });
    expect(t).toMatch(/^3 posts for X are below/);
    expect(t).toContain('flip through them');
  });
  it('multiple platforms with swipe hint', () => {
    const t = reviewIntro({ total: 5, platformCount: 3, firstLabel: 'X', anyMulti: true });
    expect(t).toContain('5 posts across 3 platforms');
    expect(t).toContain('Use the arrows (or swipe) where a platform has more than one.');
  });
  it('multiple posts, no carousel → no swipe hint', () => {
    const t = reviewIntro({ total: 2, platformCount: 2, firstLabel: 'X', anyMulti: false });
    expect(t).not.toContain('swipe');
  });
});
