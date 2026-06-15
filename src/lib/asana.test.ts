import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  COPY_GATE,
  gateStatusFrom,
  parseTask,
  postDecisionToAsana,
  readGateStatus,
  scopedDecisionComment,
} from '@/lib/asana';

describe('parseTask', () => {
  it('returns a bare numeric id', () => {
    expect(parseTask('1209888777666555')).toBe('1209888777666555');
  });
  it('extracts from a /task/ URL', () => {
    expect(
      parseTask(
        'https://app.asana.com/1/15793206/project/1205550001112223/task/1209888777666555?focus=true',
      ),
    ).toBe('1209888777666555');
  });
  it('falls back to the last long run of digits', () => {
    expect(parseTask('https://app.asana.com/0/1200000000000000/1209888777666555')).toBe(
      '1209888777666555',
    );
  });
  it('returns empty for junk', () => {
    expect(parseTask('not a task')).toBe('');
  });
  it('returns empty for empty input', () => {
    expect(parseTask('')).toBe('');
  });
});

describe('scopedDecisionComment', () => {
  it('scoped approve', () => {
    expect(scopedDecisionComment('copy', 'Approved', 'Matthew', '', 'https://x/r/abc')).toBe(
      '✅ Copy approved by Matthew\n\nReview page: https://x/r/abc',
    );
  });
  it('everything approve', () => {
    expect(scopedDecisionComment('everything', 'Approved', 'Matthew', '', '')).toBe(
      '✅ Copy + images approved by Matthew',
    );
  });
  it('scoped revisions with feedback', () => {
    const t = scopedDecisionComment('images', 'Revisions requested', 'Matthew', 'fix it', '');
    expect(t.startsWith('🔁 Images — revisions requested by Matthew:')).toBe(true);
    expect(t).toContain('fix it');
  });
});

describe('postDecisionToAsana', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  type Planned = { ok: boolean; status: number; text?: string };
  type Call = { url: string; method?: string; headers: Record<string, string>; body: unknown };

  function stub(plan: Planned[]) {
    const calls: Call[] = [];
    globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
      const i = calls.length;
      calls.push({
        url: String(url),
        method: init.method,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string),
      });
      const r = plan[i] || { ok: true, status: 200 };
      return { ok: r.ok, status: r.status, text: async () => r.text ?? '' } as Response;
    }) as typeof fetch;
    return calls;
  }

  const base = {
    task: '1209888777666555',
    scope: 'everything' as const,
    decision: 'Approved' as const,
    feedback: '',
    url: 'https://x/r/abc',
    token: 'tok',
    assignee: 'johan@longbeard.com',
    reviewer: 'Matthew',
  };

  it('happy path: comment POST + reassign PUT, bearer token, assignee', async () => {
    const calls = stub([
      { ok: true, status: 200 },
      { ok: true, status: 200 },
    ]);
    const res = await postDecisionToAsana(base);
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://app.asana.com/api/1.0/tasks/1209888777666555/stories');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect((calls[0].body as { data: { text: string } }).data.text).toContain(
      '✅ Copy + images approved by Matthew',
    );
    expect(calls[1].method).toBe('PUT');
    expect((calls[1].body as { data: { assignee: string } }).data.assignee).toBe('johan@longbeard.com');
  });

  it('comment fails → ok:false + status, no reassign', async () => {
    const calls = stub([{ ok: false, status: 403, text: 'no access' }]);
    const res = await postDecisionToAsana(base);
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(calls).toHaveLength(1);
  });

  it('reassign fails → ok:true + warning', async () => {
    stub([
      { ok: true, status: 200 },
      { ok: false, status: 400, text: 'bad assignee' },
    ]);
    const res = await postDecisionToAsana(base);
    expect(res.ok).toBe(true);
    expect((res as { warning?: string }).warning).toContain('reassign failed');
  });

  it('approve with gates: ticks the matching gate subtask', async () => {
    const hits: string[] = [];
    globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
      const u = String(url);
      hits.push(`${init?.method || 'GET'} ${u}`);
      if (u.includes('/subtasks')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ gid: '111', name: '3. Matthew Approves Copy', completed: false }],
          }),
          text: async () => '',
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
    }) as typeof fetch;
    const res = await postDecisionToAsana({ ...base, scope: 'copy', gates: [COPY_GATE] });
    expect(res.ok).toBe(true);
    expect(hits).toContain('PUT https://app.asana.com/api/1.0/tasks/111');
  });
});

describe('gateStatusFrom', () => {
  it('maps the gate subtasks to copy/images status', () => {
    const subs = [
      { name: '2. Draft Copy in Workbook (All Languages)', completed: true },
      { name: '3. Matthew Approves Copy', completed: true },
      { name: '6. Matthew Approves Creative', completed: false },
    ];
    expect(gateStatusFrom(subs)).toEqual({ copy: 'approved', images: 'pending' });
  });

  it('is case- and number-insensitive', () => {
    expect(gateStatusFrom([{ name: 'matthew APPROVES copy', completed: true }])).toEqual({
      copy: 'approved',
      images: 'pending',
    });
  });

  it('missing gates → both pending', () => {
    expect(gateStatusFrom([])).toEqual({ copy: 'pending', images: 'pending' });
  });
});

describe('readGateStatus', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fetches subtasks and returns gate status', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { name: '3. Matthew Approves Copy', completed: true },
          { name: '6. Matthew Approves Creative', completed: false },
        ],
      }),
    })) as typeof fetch;
    expect(await readGateStatus('1209888777666555', 'tok')).toEqual({
      ok: true,
      copy: 'approved',
      images: 'pending',
    });
  });

  it('ok:false when the request fails', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })) as typeof fetch;
    expect(await readGateStatus('1209888777666555', 'tok')).toEqual({ ok: false });
  });
});
