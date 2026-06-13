'use strict';
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');

const editorSrc = fs.readFileSync('/home/claude/editor.html', 'utf8');
const ph = JSON.parse(fs.readFileSync('/home/claude/placeholders.json', 'utf8'));

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function loadDom(html, { withFetch } = {}) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(String(e)));
  vc.on('error', (...a) => errs.push(a.join(' ')));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/page.html',
    virtualConsole: vc,
    beforeParse(window) {
      window.__alerts = [];
      window.alert = m => window.__alerts.push(String(m));
      window.__confirms = [];
      window.confirm = m => { window.__confirms.push(String(m)); return true; };
      if (withFetch) {
        window.__fetchCalls = [];
        window.fetch = (url, opts) => {
          window.__fetchCalls.push({ url, body: JSON.parse(opts.body) });
          return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
        };
      }
    }
  });
  return { dom, errs };
}
const tick = () => new Promise(r => setTimeout(r, 30));

const RELAY = 'https://social-approvals-relay.longbeard.workers.dev/';
const TASK_URL = 'https://app.asana.com/1/15793206/project/1205550001112223/task/1209888777666555?focus=true';
const GID = '1209888777666555';
const fill = (post, copy, img) => { post.copy = copy; post.img = img; };

(async () => {
  /* ---------- 1. editor integrity ---------- */
  console.log('1. Editor integrity');
  const { dom: ed, errs: edErrs } = loadDom(editorSrc);
  await tick();
  const w = ed.window, sa = w.__sa, d = w.document;
  check('script block survived (window.__sa exists)', !!sa);
  check('no jsdom script errors', edErrs.length === 0, edErrs[0]);
  check('4 cards with switches + tab bars', d.querySelectorAll('.card').length === 4 && d.querySelectorAll('.sw input').length === 4 && d.querySelectorAll('.tabs').length === 4);
  check('each platform starts with 1 post + add tab', d.querySelectorAll('#tabs-x .tab').length === 2);

  /* ---------- 2. tabs & switches via UI ---------- */
  console.log('2. Tabs & switches');
  d.querySelector('[data-act="addpost"][data-p="x"]').click();
  check('add post → 2 posts, second selected', sa.state.p.x.posts.length === 2 && sa.state.p.x.cur === 1);
  check('eyebrow shows position', d.getElementById('eb-x').textContent.includes('post 2 of 2'));
  d.getElementById('ta-x').value = 'second post copy';
  d.getElementById('ta-x').dispatchEvent(new w.Event('input', {bubbles:true}));
  check('typing edits the selected post only', sa.state.p.x.posts[1].copy === 'second post copy' && sa.state.p.x.posts[0].copy === '');
  d.querySelector('[data-act="seltab"][data-p="x"][data-i="0"]').click();
  check('tab switch restores post 1 textarea', sa.state.p.x.cur === 0 && d.getElementById('ta-x').value === '');
  d.querySelector('[data-act="seltab"][data-p="x"][data-i="1"]').click();
  d.querySelector('[data-act="rmpost"][data-p="x"]').click();
  check('remove post (confirmed) → back to 1', sa.state.p.x.posts.length === 1 && w.__confirms.length === 1);
  const fbSwitch = d.getElementById('on-fb');
  fbSwitch.checked = false;
  fbSwitch.dispatchEvent(new w.Event('change', {bubbles:true}));
  check('switch off dims card + flips state', sa.state.p.fb.on === false && d.getElementById('card-fb').classList.contains('off'));
  fbSwitch.checked = true; fbSwitch.dispatchEvent(new w.Event('change', {bubbles:true}));

  /* ---------- 3. generate guards ---------- */
  console.log('3. Generate guards');
  sa.state.campaign = 'Guard test';
  sa.state.asana = TASK_URL;
  sa.state.relay = RELAY;
  ['x','ig','fb','li'].forEach(id => { sa.state.p[id].on = false; });
  d.getElementById('generate').click();
  check('blocks when all platforms off', w.__alerts.some(a => a.includes('switched off')));
  ['x','ig','fb','li'].forEach(id => { sa.state.p[id].on = true; });

  /* ---------- 4. selection + multi-post bake ---------- */
  console.log('4. Platform selection + multi-post bake');
  sa.state.campaign = 'Tricky & <Câmpaign> "test" $& ${x} </script> demo';
  const nasty = 'Hostile <script>alert("x")</script> & "quotes" $& ${y}\nSecond line — done.';
  // X: 3 posts; IG: 1; FB: 1; LI: off
  sa.state.p.x.posts = [sa.newPost(), sa.newPost(), sa.newPost()];
  fill(sa.state.p.x.posts[0], nasty, ph.x1);
  fill(sa.state.p.x.posts[1], 'X post two', ph.x2);
  fill(sa.state.p.x.posts[2], 'X post three', ph.x1);
  sa.state.p.ig.posts = [sa.newPost()]; fill(sa.state.p.ig.posts[0], 'IG single', ph.ig1);
  sa.state.p.fb.posts = [sa.newPost()]; fill(sa.state.p.fb.posts[0], 'FB single', ph.fb);
  sa.state.p.li.on = false;
  ['x','ig','fb'].forEach(id => sa.refreshCard(id));
  const t = sa.bake();
  check('counts: 5 posts / 3 platforms', t.total === 5 && t.platforms === 3);
  for (const m of ['__INTRO__','__APPROVE_LABEL__','__CAMPAIGN__','__PAYLOAD__','<!--__MOCKUPS__-->','/*__MOCKUP_CSS__*/'])
    check('marker replaced: ' + m, !t.html.includes(m));
  check('exactly 2 </script> in baked file', (t.html.match(/<\/script>/g) || []).length === 2);
  const between = t.html.slice(t.html.indexOf('id="payload">') + 13, t.html.indexOf('</script>', t.html.indexOf('id="payload">')));
  check('payload safe + v3 + task + relay', !between.includes('<') && (() => { const p = JSON.parse(between); return p.v === 3 && p.task === GID && p.relay === RELAY; })());

  const { dom: tb, errs: tbErrs } = loadDom(t.html, { withFetch: true });
  await tick();
  const td = tb.window.document;
  check('review parses without errors', tbErrs.length === 0, tbErrs[0]);
  check('3 slots only (LinkedIn excluded)', td.querySelectorAll('.slot').length === 3 && !td.body.innerHTML.includes('LinkedIn'));
  check('5 mockups total', td.querySelectorAll('.mk').length === 5);
  check('X slot is a carousel: 3 items, 3 dots, 1/3 counter', td.querySelectorAll('.car').length === 1 && td.querySelectorAll('.car-item').length === 3 && td.querySelectorAll('.dot').length === 3 && td.querySelector('.car-count').textContent.trim() === '1 / 3');
  check('single-post slots have no carousel chrome', td.querySelectorAll('.slot')[1].querySelector('.car') === null);
  check('slot tag shows post count', td.body.innerHTML.includes('3 posts'));
  check('intro: 5 posts across 3 platforms + swipe hint', td.querySelector('.note').textContent.includes('5 posts across 3 platforms') && td.querySelector('.note').textContent.includes('swipe'));
  check('approve label = Approve all 5', td.getElementById('approve').textContent === 'Approve all 5');
  check('hostile copy inert', td.querySelector('.mk script') === null);

  /* ---------- 5. flows on the multi review ---------- */
  console.log('5. Approve / revisions flows');
  td.getElementById('approve').click();
  await tick();
  const call = tb.window.__fetchCalls[0];
  check('approve → relay with task gid', call && call.url === RELAY && call.body.task === GID && call.body.decision === 'Approved');
  check('double-submit blocked', (td.getElementById('approve').click(), tb.window.__fetchCalls.length === 1));
  const { dom: rv } = loadDom(t.html, { withFetch: true });
  await tick();
  const rd = rv.window.document;
  rd.getElementById('revise').click();
  rd.getElementById('fbx').value = 'X post 2 needs a tighter crop';
  rd.getElementById('send').click();
  await tick();
  check('revisions carry notes', rv.window.__fetchCalls[0].body.decision === 'Revisions requested' && rv.window.__fetchCalls[0].body.feedback.includes('tighter crop'));

  /* ---------- 6. single-post wording ---------- */
  console.log('6. Degenerate case: one post, one platform');
  ['ig','fb'].forEach(id => { sa.state.p[id].on = false; });
  sa.state.p.x.posts = [sa.newPost()]; fill(sa.state.p.x.posts[0], 'only post', ph.x1); sa.state.p.x.cur = 0;
  const one = sa.bake();
  const od = loadDom(one.html); await tick();
  check('intro singular', od.dom.window.document.querySelector('.note').textContent.startsWith('One post is below'));
  check('button = Approve this post', od.dom.window.document.getElementById('approve').textContent === 'Approve this post');
  check('no carousel for single post', od.dom.window.document.querySelector('.car') === null);

  /* ---------- 7. draft migration ---------- */
  console.log('7. Old-draft migration');
  const oldDraft = JSON.stringify({ campaign:'Old', account:'Magisterium AI', handle:'magisteriumai', gh:'longbeardcreative', repo:'social-approvals', asana:'', relay:'',
    p:{ x:{copy:'legacy copy', img:null, note:''}, ig:{copy:'', img:null, note:''}, fb:{copy:'', img:null, note:''}, li:{copy:'', img:null, note:''} } });
  const { dom: mig } = loadDom(editorSrc.replace('</head>', '<script>localStorage.setItem("sa-draft-v1", ' + JSON.stringify(oldDraft) + ');</scr' + 'ipt></head>'));
  await tick();
  const ms = mig.window.__sa.state;
  check('v1 draft wraps into posts[]', Array.isArray(ms.p.x.posts) && ms.p.x.posts.length === 1 && ms.p.x.posts[0].copy === 'legacy copy' && ms.p.x.on === true);

  /* ---------- 8. sample review ---------- */
  console.log('8. Sample review (showcase)');
  const { dom: ed2 } = loadDom(editorSrc);
  await tick();
  const s2 = ed2.window.__sa;
  s2.state.campaign = 'Sample campaign — boss view demo';
  s2.state.asana = 'https://app.asana.com/0/1200000000000000/1200000000000001';
  s2.state.relay = 'https://example.invalid/relay';
  s2.state.p.x.posts = [s2.newPost(), s2.newPost()];
  fill(s2.state.p.x.posts[0], 'The Church has thought about every question you are asking. Magisterium AI puts 28,000+ magisterial documents one question away.\n\nAsk it anything → magisterium.com', ph.x1);
  fill(s2.state.p.x.posts[1], 'Every claim, cited. Every source, magisterial.\n\nThis is what trustworthy answers about Catholic teaching look like → magisterium.com', ph.x2);
  s2.state.p.ig.posts = [s2.newPost(), s2.newPost()];
  fill(s2.state.p.ig.posts[0], 'Every answer, sourced from the Church\u2019s own documents — encyclicals, councils, catechisms.\n\nMagisterium AI. Faithful answers, cited sources. Link in bio.', ph.ig1);
  fill(s2.state.p.ig.posts[1], 'Ask better questions about the faith.\n\nMagisterium AI reads the documents so you can read the answers. Link in bio.', ph.ig2);
  s2.state.p.fb.posts = [s2.newPost()];
  fill(s2.state.p.fb.posts[0], 'What does the Church actually teach? Not what someone on the internet thinks it teaches.\n\nMagisterium AI answers from 28,000+ official documents — every answer cited. Try it free at magisterium.com.', ph.fb);
  s2.state.p.li.on = false;
  ['x','ig','fb'].forEach(id => s2.refreshCard(id));
  const sample = s2.bake();
  fs.writeFileSync('/home/claude/sample-review.html', sample.html);
  const { dom: sd, errs: sdErrs } = loadDom(sample.html);
  await tick();
  check('sample: 5 mocks, 2 carousels, LinkedIn excluded', sd.window.document.querySelectorAll('.mk').length === 5 && sd.window.document.querySelectorAll('.car').length === 2 && !sd.window.document.body.innerHTML.includes('LinkedIn'));
  check('no script errors in sample', sdErrs.length === 0, sdErrs[0]);
  console.log('  sample size: ' + Math.round(sample.html.length / 1024) + ' KB');

  console.log(failures === 0 ? '\nALL EDITOR TESTS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
