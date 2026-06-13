/**
 * Social Approvals → Asana relay (Cloudflare Worker)
 * ---------------------------------------------------
 * Receives {task, decision, feedback, url, campaign} from a review page,
 * posts a comment on that Asana task as the Review Bot, and assigns the
 * task back to Johan.
 *
 * Secrets / variables to set in the Worker (Settings → Variables and Secrets):
 *   ASANA_TOKEN     (secret)  Personal access token created while logged in AS the bot account
 *   ASSIGNEE        (text)    johan@longbeard.com   ← who the task is assigned back to
 *   REVIEWER        (text)    optional, defaults to "Matthew" — the name in the comment
 *                             ("✅ Approved by Matthew" / "🔁 Revisions requested by Matthew")
 *   ALLOWED_ORIGIN  (text)    optional hardening: https://longbeardcreative.github.io
 *                             (leave unset while testing — unset allows any origin)
 */

const ASANA = 'https://app.asana.com/api/1.0';

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ success: false, error: 'POST only' }, 405, cors);

    if (env.ALLOWED_ORIGIN) {
      const origin = request.headers.get('Origin') || '';
      if (origin && origin !== env.ALLOWED_ORIGIN)
        return json({ success: false, error: 'origin not allowed' }, 403, cors);
    }

    let b;
    try { b = await request.json(); }
    catch { return json({ success: false, error: 'invalid JSON' }, 400, cors); }

    const task = String(b.task || '').replace(/\D/g, '');
    if (task.length < 8) return json({ success: false, error: 'missing or invalid task id' }, 400, cors);

    const decision = b.decision;
    if (decision !== 'Approved' && decision !== 'Revisions requested')
      return json({ success: false, error: 'invalid decision' }, 400, cors);

    const feedback = String(b.feedback || '').trim().slice(0, 8000);
    let url = String(b.url || '').trim().slice(0, 500);
    if (!url.startsWith('https://')) url = '';

    const reviewer = env.REVIEWER || 'Matthew';
    const text = decision === 'Approved'
      ? '✅ Approved by ' + reviewer + (url ? '\n\nReview page: ' + url : '')
      : '🔁 Revisions requested by ' + reviewer + ':\n\n' + (feedback || '(no notes left)') + (url ? '\n\nReview page: ' + url : '');

    const headers = {
      'Authorization': 'Bearer ' + env.ASANA_TOKEN,
      'Content-Type': 'application/json'
    };

    // 1. Comment on the task
    const c = await fetch(ASANA + '/tasks/' + task + '/stories', {
      method: 'POST', headers, body: JSON.stringify({ data: { text } })
    });
    if (!c.ok) {
      const detail = await c.text().catch(() => '');
      return json({ success: false, error: 'asana comment failed (' + c.status + ')', detail: detail.slice(0, 500) }, 502, cors);
    }

    // 2. Assign the task back
    const a = await fetch(ASANA + '/tasks/' + task, {
      method: 'PUT', headers, body: JSON.stringify({ data: { assignee: env.ASSIGNEE } })
    });
    if (!a.ok) {
      // Comment is already on the task, so don't fail the whole loop — flag it instead.
      const detail = await a.text().catch(() => '');
      console.error('reassign failed', a.status, detail.slice(0, 300));
      return json({ success: true, warning: 'comment posted, but reassign failed (' + a.status + ')' }, 200, cors);
    }

    return json({ success: true }, 200, cors);
  }
};
