import { describe, it, expect } from 'vitest';
import { rollupStatus, nextStatuses } from '@/lib/review-status';

describe('rollupStatus', () => {
  it('both approved → approved', () => {
    expect(rollupStatus('approved', 'approved')).toBe('approved');
  });
  it('either revisions → revisions', () => {
    expect(rollupStatus('approved', 'revisions')).toBe('revisions');
    expect(rollupStatus('revisions', 'pending')).toBe('revisions');
  });
  it('otherwise pending', () => {
    expect(rollupStatus('approved', 'pending')).toBe('pending');
    expect(rollupStatus('pending', 'pending')).toBe('pending');
  });
});

describe('nextStatuses', () => {
  const cur = { copyStatus: 'pending', imageStatus: 'pending' } as const;
  it('copy approve sets only copy', () => {
    expect(nextStatuses(cur, 'copy', 'Approved')).toEqual({
      copyStatus: 'approved',
      imageStatus: 'pending',
    });
  });
  it('images revisions sets only images', () => {
    expect(nextStatuses(cur, 'images', 'Revisions requested')).toEqual({
      copyStatus: 'pending',
      imageStatus: 'revisions',
    });
  });
  it('everything sets both', () => {
    expect(nextStatuses(cur, 'everything', 'Approved')).toEqual({
      copyStatus: 'approved',
      imageStatus: 'approved',
    });
  });
});
