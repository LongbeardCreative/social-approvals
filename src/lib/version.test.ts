import { describe, it, expect } from 'vitest';
import { APP_NAME } from '@/lib/version';

describe('app metadata', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('Social Approvals');
  });
});
