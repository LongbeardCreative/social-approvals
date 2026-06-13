import fs from 'fs';
fs.copyFileSync('/home/claude/worker.js', '/home/claude/._worker.mjs');
const worker = (await import('/home/claude/._worker.mjs')).default;

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const ENV = { ASANA_TOKEN: 'test-token-abc', ASSIGNEE: 'johan@longbeard.com' };
const GID = '1209888777666555';
const realFetch = globalThis.fetch;
let calls;
function stubFetch(plan) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const i = calls.length;
    calls.push({ url, method: opts.method, headers: opts.headers, body: JSON.parse(opts.body) });
    const r = (plan && plan[i]) || { ok: true, status: 200 };
    return { ok: r.ok, status: r.status, text: async () => r.text || '', json: async () => ({}) };
  };
}
const req = (body, init = {}) => new Request('https://relay.test/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  body: JSON.stringify(body)
});
const good = { task: GID, decision: 'Approved', feedback: '', url: 'https://longbeardcreative.github.io/social-approvals/reviews/x.html', campaign: 'Pentecost launch' };

console.log('1. Method + input guards');
let r = await worker.fetch(new Request('https://relay.test/', { method: 'OPTIONS' }), ENV);
check('OPTIONS → 204 + CORS', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === '*');
r = await worker.fetch(new Request('https://relay.test/', { method: 'GET' }), ENV);
check('GET → 405', r.status === 405);
r = await worker.fetch(new Request('https://relay.test/', { method: 'POST', body: '{nope' }), ENV);
check('bad JSON → 400', r.status === 400);
stubFetch();
r = await worker.fetch(req({ ...good, task: '123' }), ENV);
check('short task → 400, no Asana calls', r.status === 400 && calls.length === 0);
r = await worker.fetch(req({ ...good, decision: 'Maybe' }), ENV);
check('bad decision → 400', r.status === 400);

console.log('2. Approve happy path');
stubFetch();
r = await worker.fetch(req(good), ENV);
let j = await r.json();
check('two Asana calls made', calls.length === 2);
check('comment posted to right task', calls[0].url === 'https://app.asana.com/api/1.0/tasks/' + GID + '/stories' && calls[0].method === 'POST');
check('bearer token attached', calls[0].headers.Authorization === 'Bearer test-token-abc');
check('comment: ✅ Approved by Matthew + link', calls[0].body.data.text.startsWith('✅ Approved by Matthew') && calls[0].body.data.text.includes(good.url));
check('reassign PUT with assignee', calls[1].url.endsWith('/tasks/' + GID) && calls[1].method === 'PUT' && calls[1].body.data.assignee === 'johan@longbeard.com');
check('responds success + CORS', r.status === 200 && j.success === true && r.headers.get('Access-Control-Allow-Origin') === '*');

console.log('3. Revisions path');
stubFetch();
r = await worker.fetch(req({ ...good, decision: 'Revisions requested', feedback: 'https://loom.com/share/abc — fix FB headline' }), ENV);
check('comment: 🔁 Revisions requested by Matthew + notes', calls[0].body.data.text.startsWith('🔁 Revisions requested by Matthew:') && calls[0].body.data.text.includes('fix FB headline'));
check('still reassigns', calls.length === 2);

console.log('3b. REVIEWER override');
stubFetch();
r = await worker.fetch(req(good), { ...ENV, REVIEWER: 'Fr. Gregory' });
check('custom reviewer name used', calls[0].body.data.text.startsWith('✅ Approved by Fr. Gregory'));

console.log('4. Failure handling');
stubFetch([{ ok: false, status: 403, text: 'no access' }]);
r = await worker.fetch(req(good), ENV);
j = await r.json();
check('comment 403 → 502 + detail, reassign skipped', r.status === 502 && j.error.includes('403') && calls.length === 1);
stubFetch([{ ok: true, status: 200 }, { ok: false, status: 400, text: 'bad assignee' }]);
r = await worker.fetch(req(good), ENV);
j = await r.json();
check('reassign fails → success:true + warning', r.status === 200 && j.success === true && j.warning.includes('reassign failed'));

console.log('5. Origin lock + url hygiene');
const LOCKED = { ...ENV, ALLOWED_ORIGIN: 'https://longbeardcreative.github.io' };
stubFetch();
r = await worker.fetch(req(good, { headers: { Origin: 'https://evil.example' } }), LOCKED);
check('foreign origin → 403, no Asana calls', r.status === 403 && calls.length === 0);
stubFetch();
r = await worker.fetch(req(good, { headers: { Origin: 'https://longbeardcreative.github.io' } }), LOCKED);
check('matching origin passes', r.status === 200 && calls.length === 2);
stubFetch();
r = await worker.fetch(req({ ...good, url: 'javascript:alert(1)' }), ENV);
check('non-https url stripped from comment', !calls[0].body.data.text.includes('javascript:'));

globalThis.fetch = realFetch;
fs.unlinkSync('/home/claude/._worker.mjs');
console.log(failures === 0 ? '\nALL WORKER TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
