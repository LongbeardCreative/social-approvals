import { describe, it, expect } from 'vitest';
import { newReviewId } from '@/db/reviews';

describe('newReviewId', () => {
  it('returns a 12-char url-safe slug, unique each call', () => {
    const a = newReviewId();
    const b = newReviewId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(a).not.toBe(b);
  });
});
