import { afterEach, describe, it, expect } from 'vitest';
import { checkPassword, isAuthed, sessionToken, SESSION_COOKIE } from '@/lib/auth';

const orig = process.env.EDITOR_PASSWORD;
afterEach(() => {
  if (orig === undefined) delete process.env.EDITOR_PASSWORD;
  else process.env.EDITOR_PASSWORD = orig;
});

describe('checkPassword', () => {
  it('matches the configured password (and rejects others)', () => {
    process.env.EDITOR_PASSWORD = 'hunter2';
    expect(checkPassword('hunter2')).toBe(true);
    expect(checkPassword('nope')).toBe(false);
  });
  it('is false when no password is configured', () => {
    delete process.env.EDITOR_PASSWORD;
    expect(checkPassword('anything')).toBe(false);
  });
});

describe('isAuthed', () => {
  it('accepts a valid session cookie, rejects tampered / missing', async () => {
    process.env.EDITOR_PASSWORD = 'hunter2';
    const token = await sessionToken();
    const ok = new Request('https://x/', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    const bad = new Request('https://x/', { headers: { cookie: `${SESSION_COOKIE}=tampered` } });
    const none = new Request('https://x/');
    expect(await isAuthed(ok)).toBe(true);
    expect(await isAuthed(bad)).toBe(false);
    expect(await isAuthed(none)).toBe(false);
  });
  it('fails closed when EDITOR_PASSWORD is unset', async () => {
    process.env.EDITOR_PASSWORD = 'hunter2';
    const token = await sessionToken();
    delete process.env.EDITOR_PASSWORD;
    const req = new Request('https://x/', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect(await isAuthed(req)).toBe(false);
  });
});
