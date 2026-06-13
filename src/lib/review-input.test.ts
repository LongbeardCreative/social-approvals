import { describe, it, expect } from 'vitest';
import { CreateReviewInput } from '@/lib/review-input';

const base = {
  campaign: 'Pentecost',
  account: 'Magisterium AI',
  handle: 'magisteriumai',
  asanaTaskGid: '1209888777666555',
  platforms: { x: { on: true, cur: 0, posts: [{ copy: 'hi', img: null, note: '' }] } },
};

describe('CreateReviewInput', () => {
  it('accepts a valid payload', () => {
    expect(CreateReviewInput.safeParse(base).success).toBe(true);
  });
  it('accepts an https image URL', () => {
    expect(
      CreateReviewInput.safeParse({
        ...base,
        platforms: {
          x: { on: true, cur: 0, posts: [{ copy: '', img: 'https://pub.r2.dev/x.jpg', note: '' }] },
        },
      }).success,
    ).toBe(true);
  });
  it('rejects an empty campaign', () => {
    expect(CreateReviewInput.safeParse({ ...base, campaign: '  ' }).success).toBe(false);
  });
  it('rejects a bad task gid', () => {
    expect(CreateReviewInput.safeParse({ ...base, asanaTaskGid: '123' }).success).toBe(false);
  });
  it('rejects when no platform is enabled', () => {
    expect(
      CreateReviewInput.safeParse({
        ...base,
        platforms: { x: { on: false, cur: 0, posts: [{ copy: '', img: null, note: '' }] } },
      }).success,
    ).toBe(false);
  });
  it('rejects a non-https image', () => {
    expect(
      CreateReviewInput.safeParse({
        ...base,
        platforms: { x: { on: true, cur: 0, posts: [{ copy: '', img: 'not-a-url', note: '' }] } },
      }).success,
    ).toBe(false);
  });
});
