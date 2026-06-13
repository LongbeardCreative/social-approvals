import { describe, it, expect } from 'vitest';
import { newObjectKey, PresignBody, R2_PUBLIC_BASE_URL } from '@/lib/r2';

describe('newObjectKey', () => {
  it('produces a unique uploads/<uuid>.jpg key', () => {
    const a = newObjectKey();
    const b = newObjectKey();
    expect(a).toMatch(/^uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b);
  });
});

describe('PresignBody', () => {
  it('accepts image/jpeg only', () => {
    expect(PresignBody.safeParse({ contentType: 'image/jpeg' }).success).toBe(true);
    expect(PresignBody.safeParse({ contentType: 'image/png' }).success).toBe(false);
    expect(PresignBody.safeParse({}).success).toBe(false);
  });
});

describe('R2_PUBLIC_BASE_URL', () => {
  it('never has a trailing slash', () => {
    expect(R2_PUBLIC_BASE_URL.endsWith('/')).toBe(false);
  });
});
