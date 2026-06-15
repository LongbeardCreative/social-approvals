import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ isAuthed: vi.fn() }));

import { isAuthed } from '@/lib/auth';
import { GET } from './route';

const realFetch = globalThis.fetch;

function req(query: string) {
  return new Request('https://social-approvals.vercel.app/api/asana/status' + query);
}

beforeEach(() => {
  process.env.ASANA_TOKEN = 'tok';
  vi.mocked(isAuthed).mockReset();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GET /api/asana/status', () => {
  it('401 when not authed', async () => {
    vi.mocked(isAuthed).mockResolvedValue(false);
    const res = await GET(req('?gid=1209888777666555'));
    expect(res.status).toBe(401);
  });

  it('400 when gid is missing/invalid', async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    expect((await GET(req(''))).status).toBe(400);
    expect((await GET(req('?gid=nope'))).status).toBe(400);
  });

  it('returns gate status for a valid task', async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { name: '3. Matthew Approves Copy', completed: true },
          { name: '6. Matthew Approves Creative', completed: true },
        ],
      }),
    })) as typeof fetch;
    const j = await (await GET(req('?gid=1209888777666555'))).json();
    expect(j).toEqual({ ok: true, copy: 'approved', images: 'approved' });
  });
});
