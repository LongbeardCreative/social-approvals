import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/db/reviews', () => ({
  getReviewById: vi.fn(),
  markScopeDecided: vi.fn(),
}));

import { getReviewById, markScopeDecided } from '@/db/reviews';
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
  copyStatus: 'pending',
  imageStatus: 'pending',
  copyNotes: null,
  imageNotes: null,
  copyDecidedAt: null,
  imageDecidedAt: null,
  createdAt: new Date(),
};

/** All Asana calls succeed; subtask lookups return an empty list. */
function okFetch() {
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ data: [] }),
  })) as typeof fetch;
}

beforeEach(() => {
  process.env.ASANA_TOKEN = 'tok';
  process.env.ASSIGNEE = 'johan@longbeard.com';
  process.env.ASSIGNEE_COPY = 'jenna@longbeard.com';
  process.env.COPY_REVIEWER_GID = '1202922206500119';
  vi.mocked(getReviewById).mockReset();
  vi.mocked(markScopeDecided).mockReset();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('POST /api/reviews/[id]/decision', () => {
  it('400 on invalid decision', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    const res = await POST(req({ scope: 'copy', decision: 'Maybe' }), ctx);
    expect(res.status).toBe(400);
  });

  it('404 when the review is missing', async () => {
    vi.mocked(getReviewById).mockResolvedValue(null);
    const res = await POST(req({ scope: 'copy', decision: 'Approved' }), ctx);
    expect(res.status).toBe(404);
  });

  it('copy approve: posts to Asana and marks the copy scope decided', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    okFetch();
    const res = await POST(req({ scope: 'copy', decision: 'Approved', feedback: '' }), ctx);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(vi.mocked(markScopeDecided)).toHaveBeenCalledWith('abc123', 'copy', 'Approved', '');
  });

  it('defaults to the everything scope when none is given', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    okFetch();
    const res = await POST(req({ decision: 'Approved' }), ctx);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(vi.mocked(markScopeDecided)).toHaveBeenCalledWith('abc123', 'everything', 'Approved', '');
  });

  it('already-decided scope → returns without re-posting', async () => {
    vi.mocked(getReviewById).mockResolvedValue({ ...row, copyStatus: 'approved' } as never);
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, text: async () => '', json: async () => ({ data: [] }) };
    }) as typeof fetch;
    const res = await POST(req({ scope: 'copy', decision: 'Approved' }), ctx);
    const j = await res.json();
    expect(j.alreadyDecided).toBe(true);
    expect(called).toBe(false);
    expect(vi.mocked(markScopeDecided)).not.toHaveBeenCalled();
  });

  it('comment failure → 502, scope not marked', async () => {
    vi.mocked(getReviewById).mockResolvedValue(row as never);
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => 'no access',
      json: async () => ({}),
    })) as typeof fetch;
    const res = await POST(req({ scope: 'images', decision: 'Approved' }), ctx);
    expect(res.status).toBe(502);
    expect(vi.mocked(markScopeDecided)).not.toHaveBeenCalled();
  });
});
