import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/db/reviews', () => ({
  getReviewById: vi.fn(),
  markReviewDecided: vi.fn(),
}));

import { getReviewById, markReviewDecided } from '@/db/reviews';
import { POST } from './route';

const ctx = { params: Promise.resolve({ id: 'abc123' }) };
const realFetch = globalThis.fetch;

function req(body: unknown) {
  return new Request('https://social-approvals.vercel.app/api/reviews/abc123/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const row = {
  id: 'abc123',
  campaign: 'C',
  account: 'A',
  handle: 'h',
  asanaTaskGid: '1209888777666555',
  platforms: {},
  status: 'pending',
  decisionNotes: null,
  decidedAt: null,
  createdAt: new Date(),
};

beforeEach(() => {
  process.env.ASANA_TOKEN = 'tok';
  process.env.ASSIGNEE = 'johan@longbeard.com';
  vi.mocked(getReviewById).mockReset();
  vi.mocked(markReviewDecided).mockReset();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('POST /api/reviews/[id]/decision', () => {
  it('400 on invalid decision', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    const res = await POST(req({ decision: 'Maybe' }), ctx);
    expect(res.status).toBe(400);
  });

  it('404 when the review is missing', async () => {
    vi.mocked(getReviewById).mockResolvedValue(null);
    const res = await POST(req({ decision: 'Approved' }), ctx);
    expect(res.status).toBe(404);
  });

  it('happy path: posts to Asana and marks the row decided', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => '' })) as typeof fetch;
    const res = await POST(req({ decision: 'Approved', feedback: '' }), ctx);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(vi.mocked(markReviewDecided)).toHaveBeenCalledWith('abc123', 'approved', '');
  });

  it('already-decided → returns without re-posting', async () => {
    vi.mocked(getReviewById).mockResolvedValue({ ...row, status: 'approved' } as never);
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, text: async () => '' };
    }) as typeof fetch;
    const res = await POST(req({ decision: 'Approved' }), ctx);
    const j = await res.json();
    expect(j.alreadyDecided).toBe(true);
    expect(called).toBe(false);
    expect(vi.mocked(markReviewDecided)).not.toHaveBeenCalled();
  });

  it('comment failure → 502, row not marked', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => 'no access',
    })) as typeof fetch;
    const res = await POST(req({ decision: 'Approved' }), ctx);
    expect(res.status).toBe(502);
    expect(vi.mocked(markReviewDecided)).not.toHaveBeenCalled();
  });
});
