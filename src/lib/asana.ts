/** Extract an Asana task gid from a pasted URL or bare id (ported from legacy parseTask). */
export function parseTask(input: string): string {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^\d{8,}$/.test(s)) return s;
  const m = s.match(/\/task\/(\d{8,})/);
  if (m) return m[1];
  const runs = s.split('?')[0].match(/\d{10,}/g);
  return runs ? runs[runs.length - 1] : '';
}

const ASANA = 'https://app.asana.com/api/1.0';

export type Decision = 'Approved' | 'Revisions requested';

export type SubtaskLite = { name: string; completed: boolean };
export type GateStatus = 'approved' | 'pending';

/** Name fragments that identify the two approval-gate subtasks (matched case-insensitively). */
export const COPY_GATE = 'approves copy';
export const CREATIVE_GATE = 'approves creative';

function gateApproved(subtasks: SubtaskLite[], fragment: string): boolean {
  const f = fragment.toLowerCase();
  return subtasks.some((s) => (s.name || '').toLowerCase().includes(f) && s.completed);
}

/** Pure: turn a subtask list into copy/images approval status. */
export function gateStatusFrom(subtasks: SubtaskLite[]): { copy: GateStatus; images: GateStatus } {
  return {
    copy: gateApproved(subtasks, COPY_GATE) ? 'approved' : 'pending',
    images: gateApproved(subtasks, CREATIVE_GATE) ? 'approved' : 'pending',
  };
}

/** Fetch a task's subtasks (name + completed only). Throws on a non-OK response. */
export async function getSubtasks(task: string, token: string): Promise<SubtaskLite[]> {
  const r = await fetch(`${ASANA}/tasks/${task}/subtasks?opt_fields=name,completed`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`subtasks ${r.status}`);
  const j = (await r.json()) as { data?: SubtaskLite[] };
  return j.data ?? [];
}

export type GateStatusResult = { ok: true; copy: GateStatus; images: GateStatus } | { ok: false };

/** Read a task's gate status; never throws — returns { ok: false } if it can't be read. */
export async function readGateStatus(task: string, token: string): Promise<GateStatusResult> {
  try {
    return { ok: true, ...gateStatusFrom(await getSubtasks(task, token)) };
  } catch {
    return { ok: false };
  }
}

/** True only when the Asana env needed to post is present. */
export function asanaConfigured(): boolean {
  return Boolean(process.env.ASANA_TOKEN && process.env.ASSIGNEE);
}

/** The comment text, ported verbatim from worker.js. */
export function decisionComment(
  decision: Decision,
  reviewer: string,
  feedback: string,
  url: string,
): string {
  const link = url ? `\n\nReview page: ${url}` : '';
  return decision === 'Approved'
    ? `✅ Approved by ${reviewer}${link}`
    : `🔁 Revisions requested by ${reviewer}:\n\n${feedback || '(no notes left)'}${link}`;
}

export type DecisionResult =
  | { ok: true; warning?: string }
  | { ok: false; status: number; detail: string };

/** Post the decision comment + reassign the task (ported from worker.js). */
export async function postDecisionToAsana(opts: {
  task: string;
  decision: Decision;
  feedback: string;
  url: string;
  token: string;
  assignee: string;
  reviewer: string;
}): Promise<DecisionResult> {
  const text = decisionComment(opts.decision, opts.reviewer, opts.feedback, opts.url);
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  };

  // 1. Comment on the task
  const c = await fetch(`${ASANA}/tasks/${opts.task}/stories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: { text } }),
  });
  if (!c.ok) {
    const detail = await c.text().catch(() => '');
    return { ok: false, status: c.status, detail: detail.slice(0, 500) };
  }

  // 2. Reassign the task back
  const a = await fetch(`${ASANA}/tasks/${opts.task}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { assignee: opts.assignee } }),
  });
  if (!a.ok) {
    return { ok: true, warning: `comment posted, but reassign failed (${a.status})` };
  }

  return { ok: true };
}
