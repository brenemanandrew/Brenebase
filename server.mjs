/* Brenebase (brenebase.fly.dev): the hub server. One page for Andrew (public/index.html), a JSON API, and a queue the PC worker pulls from.
   Node 22, one dependency (@anthropic-ai/sdk, only used when ANTHROPIC_API_KEY is set).

   Env
     PORT              8080
     DATA_DIR          ./data (on Fly: /data)
     HUB_PASSWORD      the page login. Empty = open, for local testing only
     HUB_WORKER_TOKEN  the PC worker's key (same idea as BRENAI_BRAIN_TOKEN)
     ANTHROPIC_API_KEY Planner, Expert and unsure routing in the cloud (optional)
     MESHY_API_KEY     3D generate, retexture, rig (optional)
     HUB_WORK_LOCAL=1  send Work-area thinking to the PC model instead of Claude
     GITHUB_TOKEN      read private repos for project notes (optional; public repos work without it)
     TS_AUTHKEY        Tailscale auth key: Brenebase joins the tailnet as "brenebase" (start.sh)
     PC_TAILNET_HOST   the PC's tailnet name, e.g. andrew-pc, so the agent can be called directly
     HUB_UPDATE_DIRS   PC folders to look in for update files, ; separated
     HUB_UPDATES_MINUTES  how often to look (default 15 with GITHUB_TOKEN, 60 without)
     COPILOT_URL       where Copilot jobs open (default https://copilot.microsoft.com/, his personal Copilot)
     COPILOT_TOKEN     optional, unused by Andrew: a GitHub Models token for an automatic path
     Copilot review (complex / all / off) is set on the page, Tools tab, and kept in DATA_DIR/settings.json */
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TOOLS, AREAS, AUTONOMY, resolve } from './tools.mjs';
import { route } from './route.mjs';
import * as L from './ledger.mjs';
import { PC_BACKENDS, SPENDS, brief, runClaude, runMeshy, meshyStatus, LINKS, systemFor, runCopilot, needsReview, reviewCopilot } from './adapters.mjs';
import { rejoin } from './split.mjs';
import * as P from './parts.mjs';
import * as PJ from './projects.mjs';
import * as PA from './pcagent.mjs';
import * as U from './updates.mjs';
import * as TG from './tags.mjs';
import { vet } from './vet.mjs';
import { think } from './think.mjs';
import * as SK from './skills.mjs';
import * as CP from './companion.mjs';
import * as TH from './threads.mjs';

const PORT = +process.env.PORT || 8080;
const PASS = (process.env.HUB_PASSWORD || '').trim();
/* an unconfigured copy is closed, not open: on Fly it refuses to start without its password and PC key */
if (process.env.FLY_APP_NAME && (!PASS || !process.env.HUB_WORKER_TOKEN)) { console.error('Refusing to start: set HUB_PASSWORD and HUB_WORKER_TOKEN as Fly secrets.'); process.exit(1); }
const WTOKEN = (process.env.HUB_WORKER_TOKEN || '').trim();
const PUB = path.join(path.dirname(new URL(import.meta.url).pathname), 'public');
let claude = null;
if (process.env.ANTHROPIC_API_KEY) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); claude = new Anthropic(); }
const worker = { seen: 0, can: [] };
/* small settings Andrew changes on the page, kept on the volume */
const SETFILE = path.join(process.env.DATA_DIR || './data', 'settings.json');
let SETTINGS = { voice: 'af_heart', speed: 1, copilotReview: 'complex', copilotRecord: { reviewed: 0, ok: 0, fixed: 0, unreliable: 0, corrections: 0 } };
try { SETTINGS = { ...SETTINGS, ...JSON.parse(fs.readFileSync(SETFILE, 'utf8')) }; } catch { /* defaults */ }
const saveSettings = () => { fs.mkdirSync(path.dirname(SETFILE), { recursive: true }); fs.writeFileSync(SETFILE, JSON.stringify(SETTINGS, null, 1)); };

/* a Copilot answer arrived (pasted back or automatic): check it with Claude Opus first if it needs it */
async function copilotAnswer(j, answer, via) {
  if (j.tool === 'image' || !needsReview(j, answer, SETTINGS.copilotReview)) return L.update(j.id, { status: 'done', result: { ...j.result, text: answer, relay: false, review: null } }, `answer from Copilot (${via}), not reviewed (${SETTINGS.copilotReview === 'off' ? 'review is off' : 'simple'})`);
  L.update(j.id, { status: 'reviewing', result: { ...j.result, relay: false, original: answer } }, 'Claude Opus is checking Copilot\'s answer');
  try {
    const rv = await reviewCopilot(j, answer, claude);
    if (rv.verdict !== 'unchecked') { const R = SETTINGS.copilotRecord; R.reviewed++; R[rv.verdict] = (R[rv.verdict] || 0) + 1; R.corrections += rv.corrections.length; saveSettings(); }
    return L.update(j.id, { status: 'done', result: { ...L.get(j.id).result, text: rv.verdict === 'unreliable' ? '' : rv.corrected || answer, original: answer, review: rv } }, `Opus review: ${rv.verdict}${rv.corrections.length ? `, ${rv.corrections.length} correction(s)` : ''}`);
  } catch (e) { return L.update(j.id, { status: 'done', result: { ...L.get(j.id).result, text: answer, original: answer, review: { verdict: 'unchecked', corrections: [], note: `Review failed: ${e.message || e}` } } }, 'review failed, answer shown unchecked'); }
}
const workerOnline = () => Date.now() - worker.seen < 30000;

const SESSION = crypto.createHash('sha256').update('hub:' + PASS).digest('hex').slice(0, 32);
const authed = req => !PASS || (req.headers.cookie || '').includes(`hub=${SESSION}`);
const isWorker = req => WTOKEN && String(req.headers.authorization || '').trim() === `Bearer ${WTOKEN}`;
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req, max = 2e6) => new Promise(ok => { let b = ''; req.on('data', c => { b += c; if (b.length > max) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });

/* a routed thought becomes a job. Whether it runs now or waits depends on autonomy, the tool's gate and whether it spends credits. */
/* ---- the report every finished job ends with, in the same shape as a Claude session's: done, tested, not tested,
   blocked (with the fix), next step. Built from what the job knows; no model is asked. ---- */
const FIXES = [
  [/No checkout at|Could not clone/i, 'The repo is not on your PC. The worker now clones it by itself: tap Retry. If the clone fails, run git clone once by hand on the PC so git can sign in to GitHub.'],
  [/claude.*(not found|not recognized|ENOENT)|Claude Code is not installed/i, 'Claude Code is not on the PC: irm https://claude.ai/install.ps1 | iex, then run claude once to sign in, then Retry.'],
  [/Bionic|1234|ECONNREFUSED/i, 'The PC model is not answering: PC tab, Load the model, then Retry.'],
  [/401|rejected the API key|bearer/i, 'Claude rejected the API key: replace BRENEBASE_ANTHROPIC_KEY in GitHub and deploy.'],
  [/Meshy (401|403)/i, 'Meshy refused the key: set BRENEBASE_MESHY_KEY in GitHub and deploy.'],
  [/BRENAI_COOKIES|playwright/i, 'The Brenai renderer is not set up on the PC: npm i playwright, npx playwright install chromium, and set BRENAI_COOKIES.'],
  [/outside READ_ROOTS/i, 'That folder is not one Brenebase may read: add it to READ_ROOTS on the PC.'],
  [/Not sent to Copilot/i, 'Pick Claude or the PC model for this one instead.'],
];
const firstSentences = (t, n = 2) => String(t || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, n).join(' ').slice(0, 300);
function sectionFrom(text, re) { const m = String(text || '').match(new RegExp(`(?:^|\\n)[#*\\s]*(?:${re})[^\\n]*\\n?([\\s\\S]*?)(?:\\n\\s*\\n[#*]*\\s*[A-Z]|$)`, 'i')); return m ? m[1].split('\n').map(l => l.replace(/^\s*[-*\d.]+\s*/, '').trim()).filter(Boolean).slice(0, 4) : []; }
function report(j) {
  const r = j.result || {}, R = { done: [], tested: [], notTested: [], blocked: [], next: [] };
  if (j.status === 'failed' || j.error) {
    /* the line that says what went wrong, not the first line of a stack trace */
    const lines = String(j.error || 'It failed without a message.').split('\n').map(l => l.trim()).filter(Boolean);
    R.blocked.push((lines.find(l => /(^|\b)(Error|error|failed|not found|cannot|could not|Nothing to)/.test(l) && !/^at /.test(l)) || lines[0]).slice(0, 300));
    const fx = FIXES.find(([re]) => re.test(j.error || '')); R.next.push(fx ? fx[1] : 'Tap Retry. If it fails the same way, send me a screenshot of this card.');
    return R;
  }
  if (j.status !== 'done') return null;
  const t = r.text || '';
  if (j.backend === 'claude-code') {
    /* Claude puts its summary at the end: take the last paragraph before any Tested / Not tested section */
    const body = String(t).split(/\n\s*#*\s*(?:\*\*)?(?:tested|what i tested|not tested|could not test|verified)\b/i)[0];
    const paras = body.split(/\n\s*\n/).map(x => x.trim()).filter(x => x && !/^(working on|step \d|reading|editing|running)\b/i.test(x));
    R.done.push(firstSentences(paras[paras.length - 1] || body.split('\n').filter(l => l.trim()).pop()) || 'Claude Code finished.'); if (r.branch) R.done.push(`Work is on branch ${r.branch} in ${j.repo || 'the repo'}.`);
    if (r.diff) { const m = r.diff.match(/(\d+) files? changed/); R.done.push(m ? `${m[1]} file(s) changed.` : 'See the change list in Output.'); }
    R.tested = sectionFrom(t, 'tested|what i tested|verified'); R.notTested = sectionFrom(t, 'not tested|could not test|untested');
    if (!R.tested.length) R.notTested.push('Claude Code did not say what it tested: check the branch before merging.');
    R.next.push(j.parent ? 'The split continues: art and story parts, then Merge.' : `Look over branch ${r.branch || ''}, then tell me to merge or deploy it.`);
  } else if (j.backend === 'merge') {
    R.done.push('Art and story were put into the code and committed on the branch.');
    R.tested = String(t).split('\n').filter(l => /test (passed|FAILED)/i.test(l)); R.notTested.push(...String(t).split('\n').filter(l => /REJECTED|EMPTY/.test(l)));
    R.next.push('Run it and look at the points listed in Output.');
  } else if (j.tool === 'copilot') {
    R.done.push(firstSentences(t) || 'Copilot answered.');
    const rv = r.review; if (rv) R.tested.push(rv.verdict === 'ok' ? 'Claude Opus checked it: no changes needed.' : rv.verdict === 'fixed' ? `Claude Opus checked it and made ${rv.corrections.length} correction(s), listed below.` : rv.verdict === 'unreliable' ? 'Claude Opus judged it too wrong to use.' : rv.note); else R.notTested.push('Not checked by Claude Opus (simple, or the check is off).');
    R.next.push('Use it, or ask a follow-up in this tab.');
  } else if (j.backend === 'tts') { R.done.push('Read aloud.'); }
  else if (j.backend === 'studio') { R.done.push('Read Brenai Studio (nothing was changed).'); R.next.push('Send me a screenshot of the Output (scroll through it all) so I can wire image jobs to Studio.'); }
  else if (j.backend === 'probe') { const st = (r.probe || []).filter(f => f.studio); if (st.length) { R.done.push(`Found Brenai Studio at ${st[0].url}.`); if (st[0].openapi) R.done.push(`It lists ${st[0].openapi.length} request types.`); R.next.push('Send me a screenshot of the Output below so I can wire image jobs to it.'); } else { R.blocked.push('Brenai Studio was not found on the usual ports.'); R.next.push('Open Brenai Studio and send me the address in its browser bar.'); } }
  else if (r.images && r.images.length) { R.done.push(`${r.images.length} picture(s) made.`); R.notTested.push('Look at them: a picture can only be judged by eye.'); if (r.restyle) R.next.push('Restyle realistic or anime with Meshy, or ask for a different pose.'); }
  else if (r.link) { R.done.push('Link ready.'); R.next.push('Open it.'); }
  else {
    R.done.push(firstSentences(t) || 'Answered.');
    R.notTested.push(j.backend === 'pc-model' ? 'Answered by your PC model; nothing was run or checked.' : 'An answer, not a change: nothing was run or checked against your files.');
    R.next.push(j.tool === 'planner' ? 'Pick the first action, or Send it to the Coder.' : 'Ask a follow-up in this tab, or act on it.');
  }
  return R;
}

/* Brenai renderer specs for a picture of Wizra: a front and back sheet in T-pose unless a pose is named */
function wizraSpecs(text) {
  const t = String(text).toLowerCase(), T = { leftUpperArm: [0, 0, 0], rightUpperArm: [0, 0, 0], leftLowerArm: [0, 0, 0], rightLowerArm: [0, 0, 0], leftHand: [0, 0, 0], rightHand: [0, 0, 0] };
  const base = { cam: 'full', pose: 'full', scene: 'studio', face: /smil|happy/.test(t) ? 'happy' : 'neutral' };
  const tpose = /t-?pose|turnaround|sheet|front and back/.test(t);
  const specs = [{ name: 'front', spec: { ...base, ...(tpose ? { set: T } : {}) } }];
  if (/back|turnaround|sheet|both sides/.test(t)) specs.push({ name: 'back', spec: { ...base, set: { ...(tpose ? T : {}), hips: [0, Math.PI, 0] } } });
  return specs;
}
const IMG_DIR = path.join(process.env.DATA_DIR || './data', 'images');
/* what the page shows: the job plus its report, how long it has run, and for a split how many parts are where */
function dress(j) {
  const o = { ...j, report: report(j) };
  if (j.skillCheck) { o.report = { ...o.report, skills: j.skillCheck.used, skillsBy: j.skillCheck.by, skillErrors: j.skillCheck.errors }; delete o.skillCheck; }
  if (j.status === 'running' || j.status === 'queued') o.elapsed = Math.round((Date.now() - (j.startedAt || j.at)) / 1000);
  if (j.backend === 'parts' && j.children) {
    /* a parts card is as far along as its parts, and its report lists them */
    const kids = j.children.map(id => L.get(id)).filter(Boolean);
    o.status = kids.some(k => k.status === 'failed') && kids.every(k => ['done', 'failed', 'cancelled'].includes(k.status)) ? 'failed' : kids.every(k => ['done', 'cancelled'].includes(k.status)) ? 'done' : kids.some(k => ['waiting', 'waiting-answer', 'held'].includes(k.status)) && !kids.some(k => ['queued', 'running', 'ready'].includes(k.status)) ? 'waiting' : 'running';
    o.report = { done: kids.map(k => `${k.label}: ${k.status}${k.status === 'done' && k.result && k.result.images ? ` (${k.result.images.length} picture(s))` : ''}`), tested: [], notTested: [], blocked: kids.filter(k => k.status === 'failed').map(k => `${k.label}: ${String(k.error || '').split('\n')[0].slice(0, 200)}`), next: [o.status === 'done' ? 'Open the parts below, or the results window, to see each result.' : o.status === 'failed' ? 'Open the failed part and tap Retry.' : 'Still working: the parts update by themselves.'] };
    const pend = j.pending || [];
    if (pend.length && o.status === 'done') o.status = 'running';
    if (pend.length) o.report.done.push(...pend.map(w => `${resolve(w.pt.tool, w.pt.mode).label}: waiting for part ${w.needs.map(n => n + 1).join(' and ')}`));
    o.partJobs = kids.map(dress);
  }
  if (j.children) { const kids = j.children.map(id => L.get(id)).filter(Boolean); o.parts = { done: kids.filter(k => k.status === 'done').length, failed: kids.filter(k => k.status === 'failed').length, waiting: kids.filter(k => ['waiting', 'held', 'waiting-answer'].includes(k.status)).length + (j.pending || []).length, running: kids.filter(k => ['queued', 'running', 'ready'].includes(k.status)).length, total: kids.length + (j.pending || []).length }; }
  return o;
}
/* Only what a person would read out loud goes to the voice: no code, links, paths, tables, JSON, *actions* or
   formatting marks. Capped so a long answer does not tie the PC up. Empty means no voice job at all. */
export function speakable(text, cap = 1500) {
  const keep = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
    .replace(/\*[^*\n]{1,200}\*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ').replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}\S*/g, ' ').replace(/\b[\w-]+\.(mjs|js|cjs|json|py|ps1|md|html|css|glb|vrm|wav|png|toml|yml)\b/g, ' ')
    .split('\n').filter(l => { const t = l.trim(); return t && !/^[|{}\[\]<>$#]|^(import|export|const|let|var|function|def|class|return)\b|[;{}]\s*$|=>|^\s*"[\w-]+"\s*:/.test(t); })
    .map(l => l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').replace(/[#*_>|~]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1'))
    .join('. ').replace(/\s+/g, ' ').replace(/([:,;])\s*\./g, '.').replace(/\s+([.,!?])/g, '$1').replace(/(\.\s*){2,}/g, '. ').trim();
  if (!/[a-z]{2}/i.test(keep)) return '';
  if (keep.length <= cap) return keep;
  const cut = keep.slice(0, cap); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > cap * 0.5 ? cut.slice(0, end + 1) : cut;
}
function makeJob({ text, tool, mode, area, autonomy = 'draft', args = {}, repo, target, project, thread, pic }) {
  const th = thread && TH.get(thread); if (th && th.project && project === undefined) project = th.project;
  if (tool === 'image' && mode === 'model' && !args.specs) args = { ...args, specs: wizraSpecs(text) };
  /* Brenai Studio picture: what its page sends as api('image', { ...imageParams(), prompt }). Field names are confirmed
     from the Look inside Brenai Studio output; STUDIO_FIELDS can override them without a PC update. */
  /* pictures on the PC with stable-diffusion.cpp, run by the Brenebase worker itself (no Brenai Studio). The Images tab sends exact settings in args. */
  let sd;
  if (tool === 'image' && ['realistic', 'anime', 'manga'].includes(mode)) {
    const n = Math.max(1, Math.min(8, +args.count || +((String(text).match(/\b(\d{1,2})\s*(images|pictures|pics|renders|versions)\b/i) || [])[1]) || 1));
    const ar = (String(text).match(/\b(16:9|9:16|1:1|4:3|3:4|3:2|2:3)\b/) || [])[1] || (/portrait|full body|t-?pose|standing/i.test(text) ? '2:3' : /landscape|wide|scene/i.test(text) ? '3:2' : '1:1');
    const SIZE = { '1:1': [1024, 1024], '2:3': [832, 1216], '3:2': [1216, 832], '9:16': [768, 1344], '16:9': [1344, 768], '3:4': [896, 1152], '4:3': [1152, 896] }[ar];
    sd = { engine: { realistic: 'zimage', anime: 'illustrious', manga: 'manga' }[mode], prompt: String(args.prompt || text).replace(/^\s*[\w\s]{1,30}:\s*/, '').replace(/\b\d{1,2}\s*(images|pictures|pics|renders|versions)\b/ig, '').trim().slice(0, 2000), count: n, width: +args.width || SIZE[0], height: +args.height || SIZE[1], ...(args.steps ? { steps: +args.steps } : {}), ...(args.cfg !== undefined && args.cfg !== '' ? { cfg: +args.cfg } : {}), ...(args.seed !== undefined && args.seed !== '' ? { seed: +args.seed } : {}), ...(args.negative ? { negative: String(args.negative) } : {}), ...(args.strength ? { strength: +args.strength } : {}) };
  }
  let studioBody;
  if (tool === 'image' && ['h3'].includes(mode)) {
    const engine = { realistic: 'zimage', anime: 'illustrious', h3: 'h3' }[mode];
    const n = Math.max(1, Math.min(8, +((String(text).match(/\b(\d{1,2})\s*(images|pictures|pics|renders|versions)\b/i) || [])[1]) || 1));
    const ar = (String(text).match(/\b(16:9|9:16|1:1|4:3|3:4|3:2|2:3|21:9)\b/) || [])[1] || (/portrait|full body|t-?pose|standing/i.test(text) ? '2:3' : /landscape|wide|scene/i.test(text) ? '16:9' : '1:1');
    const F = { engine: 'engine', count: 'count', aspect: 'aspect_ratio', ...(process.env.STUDIO_FIELDS ? JSON.parse(process.env.STUDIO_FIELDS) : {}) };
    studioBody = { [F.engine]: engine, model: engine, prompt: String(text).replace(/^\s*[\w\s]{1,30}:\s*/, '').slice(0, 2000), [F.count]: n, [F.aspect]: ar };
  }
  let r = resolve(tool, mode); if (!r) throw new Error('unknown tool');
  if (process.env.HUB_WORK_LOCAL === '1' && area === 'work' && r.backend === 'claude') r = { ...r, backend: 'pc-model', runsOn: 'pc' };
  const pj = project === '' ? null : PJ.card(project) || PJ.match(text);
  /* a private (work) project's context never goes to the cloud: those jobs move to the PC model */
  if (pj && pj.private && r.backend === 'claude') r = { ...r, backend: 'pc-model', runsOn: 'pc' };
  const job = { text, area: area || (pj && pj.area), autonomy, args, repo: repo || (pj && pj.repo && pj.repo.includes('/') && !pj.repo.includes(' ') ? pj.repo : undefined), target, project: pj ? pj.id : null, thread: th ? th.id : undefined, ...(studioBody ? { studioBody } : {}), ...(sd ? { sd } : {}), ...(pic ? { pic } : {}), ...r };
  const safe = ['brief', 'claude', 'link', 'copilot', 'doll'].includes(r.backend) || (r.backend === 'pc-model') || (tool === 'image' && ['model', 'realistic', 'anime', 'manga', 'h3'].includes(r.mode));
  const mustAsk = r.gate === 'always' || SPENDS.includes(r.backend) || autonomy === 'ask' || (autonomy === 'draft' && !safe);
  const made = L.add({ ...job, status: mustAsk ? 'waiting' : 'ready' });
  if (sd && ['realistic', 'anime'].includes(r.mode) && /realistic|photo/i.test(text) && /anime|manga|cel|toon/i.test(text) && !args.noTwin) {
    const other = r.mode === 'realistic' ? 'anime' : 'realistic';
    const twin = makeJob({ text, tool, mode: other, area, autonomy, args: { ...args, noTwin: true }, repo, target, project, thread, pic });
    L.update(made.id, { twin: twin.id }, `the ${other} version is job ${twin.id}`);
    if (twin.status === 'ready') start(twin);
  }
  return made;
}

/* every task checks the skills Brenebase has before it starts (skills.mjs): one log line per skill, the picked ones go
   to whoever does the work in full, the report lists them. Chat with the companion and the PC's own reading jobs are
   not tasks and are not checked. */
const SKILL_BACKENDS = ['claude-code', 'claude', 'brief', 'copilot', 'pc-model', 'blender', 'pc-run', 'merge', 'meshy', 'sd-image', 'doll'];
async function skillCheck(j) {
  if (!SKILL_BACKENDS.includes(j.backend) || j.quiet || j.companion || j.skillCheck) return j.skillCheck || null;
  const pj = j.project && PJ.card(j.project), local = /\[\[local\]\]/i.test(j.text || '') || !!(pj && pj.private);
  const c = await SK.check(String(j.text || '').slice(0, 4000), { claude: local ? null : claude, local }).catch(e => ({ by: 'none', lines: [], used: [], errors: [`skill check failed: ${e.message || e}`] }));
  /* skills the planner picked for this part stay picked, even if this check would have missed them */
  for (const n of j.plannedSkills || []) { if (c.used.includes(n)) continue; const l = c.lines.find(x => x.name === n); if (l) Object.assign(l, { used: true, reason: 'picked by the planner when the jobs were worked out' }); else c.lines.push({ name: n, used: true, reason: 'picked by the planner when the jobs were worked out' }); c.used.push(n); }
  L.update(j.id, { skillCheck: c }, `skills checked (${c.by}): ${c.used.length ? 'using ' + c.used.join(', ') : 'none apply'}`);
  for (const line of SK.logLines(c)) L.update(j.id, {}, line);
  for (const e of c.errors) L.update(j.id, {}, `skills: could not read ${e}`);
  return c;
}
async function start(j) {
  try {
    const sc = await skillCheck(j), skillText = sc ? SK.brief(sc) : '';
    const pb = j.pic ? picB64(j.pic) : null;
    if (pb && j.sd) L.update(j.id, { sd: { ...j.sd, init64: pb, strength: j.sd.strength ?? 0.6 } }, 'starting from the pasted picture');
    if (j.backend === 'doll') { L.update(j.id, { status: 'running', step: 'the PC model is using the doll skill' }); const cur = CP.state().setup || {}; const d = await dollAsk(j.mode === 'new' ? `Make a new doll: ${j.text}` : j.text, j.mode === 'new' ? {} : cur); return L.update(j.id, d.error ? { status: 'failed', error: d.error } : { status: 'done', result: { text: d.note || 'Doll ready.', doll: d } }, d.error ? 'doll skill failed' : 'doll ready'); }
    if (j.backend === 'brief') { const b = brief(j, PJ.context(j.project && PJ.card(j.project), 'code', j.text) + (skillText ? '\n\n' + skillText : '')); return L.update(j.id, { status: 'done', result: { text: b.prompt }, held: b.held }, b.secrets ? `${b.secrets} secret(s) removed` : 'brief written'); }
    if (j.backend === 'link') { const f = LINKS[`${j.tool}:${j.mode}`]; return L.update(j.id, { status: 'done', result: { link: f ? f(j.target) : null, text: j.does } }, 'link ready'); }
    if (j.backend === 'claude') { L.update(j.id, { status: 'running' }); const r = await runClaude(pb ? { ...j, picB64: pb } : j, claude, PJ.context(j.project && PJ.card(j.project), 'cloud', j.text) + (skillText ? '\n\n' + skillText : ''), j.thread ? TH.history(L.list(200).filter(x => x.id !== j.id), j.thread) : []); return L.update(j.id, { status: 'done', result: { text: rejoin(r.text, r.held) } }, 'answered by Claude'); }
    if (j.backend === 'copilot') { const r = await runCopilot(j, j.project && PJ.card(j.project)); return r.relay ? L.update(j.id, { status: 'waiting-answer', result: { text: r.prompt, link: r.link, relay: true } }, 'Ready: copy it into Copilot, paste the answer back') : copilotAnswer(j, r.text, r.via); }
    if (j.backend === 'meshy') { L.update(j.id, { status: 'running' }); const r = await runMeshy(j); return L.update(j.id, { status: 'running', result: r }, `Meshy task ${r.task} started`); }
    if (PC_BACKENDS.includes(j.backend)) {
      const pj = j.project && PJ.card(j.project);
      const extra = j.backend === 'claude-code' ? { prompt: brief(j, PJ.context(pj, 'code', j.text)).prompt + (skillText ? '\n\n' + skillText : '') + (j.pic ? `\n\nAndrew attached a picture to this request (not readable from here; ask him for it if the work needs it).` : ''), held: brief(j).held } : j.backend === 'pc-model' ? { ...(pb ? { image64: pb, imageMime: j.pic.mime } : {}), system: systemFor(j.tool, j.mode) + (pj ? '\n\n' + PJ.context(pj, 'local', j.text) : '') + (skillText ? '\n\n' + skillText : ''), ...(j.thread && !j.messages ? { messages: [...TH.history(L.list(200).filter(x => x.id !== j.id), j.thread), { role: 'user', content: j.text }] } : {}) } : {};
      const q = L.update(j.id, { status: 'queued', ...extra }, workerOnline() ? 'sent to the PC' : 'waiting for the PC worker; asking the PC agent to start what is needed');
      if (!workerOnline()) PA.jumpstart(['worker', ...(j.backend === 'pc-model' ? ['model'] : [])]).then(n => n.length && L.update(j.id, {}, `Jumpstart: ${n.join('; ')}`)).catch(() => {});
      return q;
    }
    throw new Error(`no adapter for ${j.backend}`);
  } catch (e) { return L.update(j.id, { status: 'failed', error: String(e.message || e) }, 'failed'); }
}

/* ---- project notes: cloud sources read here, PC files read by the worker; every hour and on demand ---- */
async function syncProjects(id) {
  const { report, pcJobs } = await PJ.sync(id);
  for (const pj of pcJobs) L.add({ tool: 'projects', mode: 'read', backend: 'read', runsOn: 'pc', label: `Read notes for ${pj.project}`, text: pj.source.path, project: pj.project, source: pj.source, readPath: PJ.realPath(pj.source.path), status: 'queued', quiet: true });
  return { report, pcFiles: pcJobs.length };
}
setTimeout(() => syncProjects().catch(() => {}), 5000);

/* ---- update files from Claude sessions: repos, PC folders (Drive), direct posts; checked routinely ---- */
const UPDATE_DIRS = (process.env.HUB_UPDATE_DIRS || 'G:\\My Drive\\Brenebase\\updates;F:\\Projects\\Breneland-Next\\.brenebase\\updates;C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Interface\\AddOns\\SUI\\.brenebase\\updates').split(';').filter(Boolean);
async function syncUpdates() {
  const report = await U.scanRepos(PJ.cards());
  for (const dir of UPDATE_DIRS) L.add({ tool: 'projects', mode: 'updates', backend: 'readdir', runsOn: 'pc', label: `Look for update files in ${dir}`, text: dir, dir, status: 'queued', quiet: true });
  return { report, pcFolders: UPDATE_DIRS.length };
}
setTimeout(() => syncUpdates().catch(() => {}), 8000);
setInterval(() => syncUpdates().catch(() => {}), (+process.env.HUB_UPDATES_MINUTES || (process.env.GITHUB_TOKEN ? 15 : 60)) * 60000);
setInterval(() => syncProjects().catch(() => {}), (+process.env.HUB_SYNC_MINUTES || 60) * 60000);

/* ---- split jobs: a parent with parts, put back together by a merge job on the PC ---- */
function startSplit({ text, plan, repo, label, thread }) {
  const parent = L.add({ tool: 'split', mode: 'split', backend: 'split', runsOn: 'cloud', label: `Split: ${label || text.slice(0, 50)}`, text, repo, plan, thread, stage: 'parts', status: 'running', slots: plan.slots.map(x => ({ ...x, fill: null })), children: [] });
  const kids = [];
  const pj = PJ.match(text); const brief = P.codeBrief(plan, { id: parent.id, repo }) + (pj ? '\n\n' + PJ.context(pj, 'code', plan.mechanics.join('. ')) : '');
  kids.push(L.add({ parent: parent.id, part: 'code', tool: 'coder', mode: 'build', backend: 'claude-code', runsOn: 'pc', label: 'Code part (Claude Code)', text: brief, prompt: brief, held: [], repo, status: 'queued' }));
  const storySlots = plan.slots.filter(x => x.side === 'story');
  if (storySlots.length) { const sp = P.storyPrompt(plan, storySlots); kids.push(L.add({ parent: parent.id, part: 'story', tool: 'companion', mode: 'chat', backend: 'pc-model', runsOn: 'pc', label: 'Story part (PC model)', text: sp.text, system: sp.system, maxTokens: 3000, slotIds: storySlots.map(x => x.id), status: 'held' })); }
  for (const x of plan.slots.filter(x => x.side === 'art' && !P.SLOT_TYPES[x.type].many)) {
    kids.push(L.add({ parent: parent.id, part: 'art', slotIds: [x.id], tool: 'make3d', mode: 'generate', backend: 'meshy', runsOn: 'meshy', label: `Art part: ${x.id} (Meshy)`, text: `${x.what}, ${x.type === 'character' ? 'full body, T-pose, ' : ''}${plan.art.join('. ') || 'game asset'}`, status: 'waiting' }));
  }
  return L.update(parent.id, { children: kids.map(k => k.id) }, `${kids.length} parts made. Folders of items (props, icons) are filled by hand or from the 3D tool.`);
}

function fillSlot(parent, id, fill) { const sl = parent.slots.find(x => x.id === id); if (sl) sl.fill = fill; }

/* called after any change to a job that belongs to a split */
/* deploying Brenebase from its own page: runs the "Brenebase Deploy" workflow (DEPLOY_TOKEN, or GITHUB_TOKEN if it may run Actions).
   Tapping the button is Andrew asking for the deploy. Job branches for Brenebase can be merged into main first. */
const GH_REPO = 'brenemanandrew/Brenebase';
const ghApi = async (pth, method = 'GET', body) => { const t = process.env.DEPLOY_TOKEN || process.env.GITHUB_TOKEN; if (!t) throw new Error('No GitHub token on Brenebase. Add the secret BRENEBASE_DEPLOY_TOKEN (Brenebase repo only, Actions and Contents read and write), then deploy once by hand.'); const r = await fetch(`https://api.github.com/repos/${GH_REPO}${pth}`, { method, headers: { authorization: `Bearer ${t}`, accept: 'application/vnd.github+json', 'user-agent': 'brenebase', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); const txt = await r.text(); let d; try { d = JSON.parse(txt); } catch { d = {}; } if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? `GitHub refused (${r.status}): the token may not run Actions or write to ${GH_REPO}. Use BRENEBASE_DEPLOY_TOKEN with Actions and Contents read and write.` : `GitHub ${r.status}: ${d.message || txt.slice(0, 160)}`); return d; };
const deployNow = () => ghApi('/actions/workflows/deploy.yml/dispatches', 'POST', { ref: 'main' });
async function deployState() { const d = await ghApi('/actions/workflows/deploy.yml/runs?per_page=1'); const r = (d.workflow_runs || [])[0]; return r ? { status: r.status, conclusion: r.conclusion, at: r.created_at, sha: (r.head_sha || '').slice(0, 7), title: (r.head_commit && r.head_commit.message || '').split('\n')[0].slice(0, 100), url: r.html_url } : null; }

/* a picture pasted into Send or Images: kept as a file, the job carries its path; read back when the work starts */
function savePic(dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/); if (!m) return null;
  fs.mkdirSync(IMG_DIR, { recursive: true }); const f = `in-${crypto.randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(IMG_DIR, f), Buffer.from(m[2], 'base64')); return { url: `/api/img/${f}`, file: f, mime: `image/${m[1]}` };
}
const picB64 = pic => { try { return pic && fs.readFileSync(path.join(IMG_DIR, path.basename(pic.file))).toString('base64'); } catch { return null; } };

/* the doll skill (skills/doll.md): the PC model turns words into a doll's look; checked here, never saved until he taps Save. No cloud model. */
const SKILLS = path.join(path.dirname(new URL(import.meta.url).pathname), 'skills');
async function dollAsk(text, current = {}) {
  const out = await askPc(fs.readFileSync(path.join(SKILLS, 'doll', 'SKILL.md'), 'utf8'), `The doll right now:\n${JSON.stringify({ look: current.look || {}, reactions: current.reactions || {} })}\n\nRequest: ${text}`);
  if (out == null) return { error: 'Your PC model is not free right now. The doll skill runs only on your PC: check the Worker and Model lights.' };
  const m = String(out).match(/\{[\s\S]*\}/); let j = null; try { j = m && JSON.parse(m[0]); } catch { }
  if (!j) return { error: 'The PC model did not answer with a doll. Try saying it another way.', raw: String(out).slice(0, 400) };
  const lk = j.look || Object.fromEntries(Object.entries(j).filter(([k]) => !['name', 'note', 'reactions'].includes(k)));
  return { name: j.name ? String(j.name).slice(0, 40) : undefined, look: { ...(current.look || {}), ...CP.cleanLook(lk) }, reactions: { ...(current.reactions || {}), ...CP.cleanReactions(j.reactions) }, note: String(j.note || '').slice(0, 300) };
}

/* a picture read by Claude (only when he chose Claude as the picture reader for the companion) */
async function describeImage(kind, b64) {
  const r = await claude.beta.messages.create({ model: process.env.HUB_ROUTER_MODEL || 'claude-opus-5-5', max_tokens: 600, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: `image/${kind}`, data: b64 } }, { type: 'text', text: VISION_ASK }] }] });
  const t = r.content.find(x => x.type === 'text'); return t ? t.text : '';
}
const VISION_ASK = 'Describe this picture for a friend who cannot see it: what is in it, any people and what they are doing, any text word for word, the setting and the mood. 3 to 6 plain sentences. Never use em dashes.';

/* ask the PC model one thing and wait for the answer (through the worker; quiet, so it is not shown as a job) */
function askPc(system, text, waitMs = 90000) {
  if (!workerOnline() || !worker.can.includes('pc-model')) return Promise.resolve(null);
  const j = L.add({ tool: 'companion', mode: 'chat', backend: 'pc-model', runsOn: 'pc', label: 'Thinking: planning the parts', system, text, maxTokens: 1500, status: 'queued', quiet: true });
  return new Promise(ok => { const t0 = Date.now(); const iv = setInterval(() => { const x = L.get(j.id); if (x && ['done', 'failed'].includes(x.status)) { clearInterval(iv); ok(x.status === 'done' ? (x.result && x.result.text) || '' : null); } else if (Date.now() - t0 > waitMs) { clearInterval(iv); L.update(j.id, { status: 'cancelled' }, 'took too long'); ok(null); } }, 1000); });
}

/* a parts card: when a part finishes, start the parts that were waiting for it, with its result handed on */
async function releaseParts(par) {
  for (const w of [...(par.pending || [])]) {
    const deps = w.needs.map(n => L.get(par.byIdx[n])).filter(Boolean);
    if (deps.length < w.needs.length) continue;
    if (deps.some(d => ['failed', 'cancelled'].includes(d.status))) { par.pending = par.pending.filter(x => x !== w); const f = L.add({ parent: par.id, tool: w.pt.tool, mode: w.pt.mode, runsOn: 'cloud', backend: 'none', label: resolve(w.pt.tool, w.pt.mode).label, text: w.pt.text, status: 'failed', error: 'An earlier part it needed failed. Retry that part, then send this one again.' }); par.byIdx[w.idx] = f.id; par.children.push(f.id); continue; }
    if (!deps.every(d => d.status === 'done')) continue;
    par.pending = par.pending.filter(x => x !== w);
    const handed = deps.map(d => `${d.label}:\n${String((d.result && (d.result.text || (d.result.images ? d.result.images.length + ' picture(s): ' + d.result.images.join(', ') : ''))) || '').slice(0, 6000)}`).join('\n\n');
    let j = makeJob({ text: `${w.pt.text}\n\nUse this result from the earlier part:\n${handed}`, tool: w.pt.tool, mode: w.pt.mode, area: par.area, autonomy: par.autonomy, project: par.project || undefined, repo: par.repo, thread: par.thread });
    L.update(j.id, { parent: par.id }); par.byIdx[w.idx] = j.id; par.children.push(j.id);
    L.update(par.id, { pending: par.pending, byIdx: par.byIdx, children: par.children }, `part ${w.idx + 1} started with what it was waiting for`);
    if (j.status === 'ready') start(j).catch(() => { });
  }
}

function afterChange(j) {
  if (j && j.parent) { const par = L.get(j.parent); if (par && par.backend === 'parts') { if (['done', 'failed', 'cancelled'].includes(j.status)) releaseParts(par).catch(() => { }); return j; } }
  if (!j || !j.parent) return j;
  const par = L.get(j.parent); if (!par) return j;
  if (j.part === 'story' && j.status === 'done' && j.result && j.result.text) {
    const m = j.result.text.match(/\{[\s\S]*\}/); let obj = null; try { obj = m && JSON.parse(m[0]); } catch { /* bad JSON */ }
    if (obj) for (const id of j.slotIds) if (obj[id] != null) fillSlot(par, id, { source: 'text', value: JSON.stringify(obj[id], null, 1), from: 'PC model' });
    if (!obj) L.update(par.id, {}, 'Story part came back but was not valid JSON. Fill the story slots by hand or rerun it.');
  }
  if (j.part === 'art' && j.status === 'done' && j.result && j.result.models && j.result.models.glb) fillSlot(par, j.slotIds[0], { source: 'url', value: j.result.models.glb, from: 'Meshy' });
  if (j.part === 'code' && j.status === 'done') { const mf = (j.result && j.result.merge) || P.manifestFrom(j.result && j.result.text); L.update(par.id, { manifest: mf, branch: j.result && j.result.branch }, mf ? 'Code part sent back its merge manifest' : 'Code part finished WITHOUT a merge manifest; the merge will use the planned paths');
    /* the story part waits for the code, so its dialogue uses the event names the code really fires */
    const events = [...new Set(((mf && mf.slots) || []).flatMap(x => x.events || []))];
    for (const cid of par.children) { const c = L.get(cid); if (c && c.part === 'story' && c.status === 'held') L.update(c.id, { status: 'queued', text: c.text + (events.length ? `\n\nThe game fires these events. Use only these in "when" and "goal": ${events.join(', ')}` : '') }, events.length ? `released with ${events.length} event names from the code` : 'released (the code listed no events)'); }
  }
  if (j.part === 'merge' && ['done', 'failed'].includes(j.status)) return L.update(par.id, { status: j.status, stage: 'merged', result: j.result, error: j.error }, j.status === 'done' ? 'Merged and tested' : 'Merge failed');
  /* an art part whose slot was filled another way (by hand) is no longer needed: cancel it so it never spends credits */
  for (const cid of par.children) { const c = L.get(cid); if (c && c.part === 'art' && c.status === 'waiting' && c.slotIds.every(id => (par.slots.find(x => x.id === id) || {}).fill)) L.update(c.id, { status: 'cancelled' }, 'slot already filled, Meshy not needed'); }
  const code = L.get(par.children[0]);
  const empty = par.slots.filter(x => !x.fill).map(x => x.id);
  if (par.stage === 'parts' && code && code.status === 'done' && !empty.length) return L.update(par.id, { status: 'waiting', stage: 'merge' }, 'Every slot is filled. Ready to merge on the PC.');
  return L.update(par.id, {});
}

function startMerge(par) {
  const m = L.add({ parent: par.id, part: 'merge', tool: 'split', mode: 'merge', backend: 'merge', runsOn: 'pc', label: 'Merge on the PC', repo: par.repo, branch: par.branch || `hub/${par.id}`, manifest: par.manifest, slots: par.slots, text: 'Drop the art and story into the code, check each file, run the test.', status: 'queued' });
  return L.update(par.id, { stage: 'merging', status: 'running', children: [...par.children, m.id] }, 'OK given, merge sent to the PC');
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  try {
    if (p === '/api/login' && req.method === 'POST') { const b = await body(req); if (PASS && String(b.password || '').trim() !== PASS) return send(res, 401, { error: 'wrong password' }); res.setHeader('set-cookie', `hub=${SESSION}; HttpOnly; Path=/; Max-Age=15552000; SameSite=Lax${process.env.FLY_APP_NAME ? '; Secure' : ''}`); return send(res, 200, { ok: true }); }

    /* ---- files the PC installer downloads (no secrets in any of them) ---- */
    const PCFILES = { 'worker/render-brenai.cjs': 'worker/render-brenai.cjs', 'pc/brenebase-agent.mjs': 'pc/brenebase-agent.mjs', 'pc/install-agent.ps1': 'pc/install-agent.ps1', 'worker/hub-worker.mjs': 'worker/hub-worker.mjs', 'worker/blender_ops.py': 'worker/blender_ops.py', 'parts.mjs': 'parts.mjs' };
    const pcf = p.match(/^\/(?:pc-files\/)?(.+)$/); const pcKey = pcf && (p.startsWith('/pc-files/') ? pcf[1] : p === '/pc/install-agent.ps1' ? 'pc/install-agent.ps1' : null);
    /* what the PC should be running: a hash per file, so the agent can update itself */
    if (p === '/pc-files/manifest.json') { const m = {}; for (const k of Object.keys(PCFILES)) { try { m[k] = crypto.createHash('sha1').update(fs.readFileSync(path.join(path.dirname(PUB), PCFILES[k]))).digest('hex'); } catch { } } return send(res, 200, m); }
    if (pcKey && PCFILES[pcKey]) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return fs.createReadStream(path.join(path.dirname(PUB), PCFILES[pcKey])).pipe(res); }

    /* ---- the PC agent's polling (same PC key as the worker) ---- */
    if (p === '/api/agent/next' || p === '/api/agent/done') {
      if (!isWorker(req)) return send(res, 401, { error: 'PC key refused' });
      const b = await body(req);
      if (p === '/api/agent/next') return send(res, 200, { cmd: PA.agentNext(b) });
      PA.agentDone(b); return send(res, 200, { ok: true });
    }

    /* ---- direct update posts from Claude sessions that can reach Brenebase (PC key) ---- */
    if (p === '/api/updates/post' && req.method === 'POST') {
      if (!isWorker(req)) return send(res, 401, { error: 'key refused' });
      const b = await body(req); const u = U.add(b.text, { key: `post:${b.id || ''}`, project: b.project, from: b.from || 'direct post' });
      return send(res, 200, u ? { ok: true, id: u.id } : { ok: true, note: 'already had it, or nothing in it' });
    }

    /* ---- live progress from the PC worker ---- */
    if (p === '/api/worker/progress' && req.method === 'POST') { if (!isWorker(req)) return send(res, 401, {}); worker.seen = Date.now(); const b = await body(req); if (Array.isArray(b.busy)) { worker.busy = b.busy.map(String).slice(0, 10); worker.busyIds = (b.busyIds || []).map(String); worker.busyAt = Date.now(); } const j = L.get(b.id); if (j) { j.step = String(b.step || '').slice(0, 120); j.stepAt = Date.now(); j.live = String(b.log || '').slice(-6000); if (!j.startedAt) j.startedAt = Date.now(); } return send(res, 200, { ok: true }); }

    /* ---- the PC worker ---- */
    if (p.startsWith('/api/worker/')) {
      if (!isWorker(req)) return send(res, 401, { error: 'worker token refused' });
      worker.seen = Date.now();
      if (p === '/api/worker/next' && Date.now() - SK.pcState().at > 1800000 && !L.list(200).some(x => x.backend === 'skills-list' && ['queued', 'running'].includes(x.status)) && (u.searchParams.get('has') || u.searchParams.get('can') || '').includes('skills-list')) L.add({ tool: 'skills', mode: 'read', backend: 'skills-list', runsOn: 'pc', label: 'Read the skill folders on the PC', text: 'Read every SKILL.md in the PC skill folders.', status: 'queued', quiet: true });
      if (p === '/api/worker/next') { const offer = (u.searchParams.get('can') || '').split(',').filter(Boolean); worker.can = u.searchParams.has('has') ? (u.searchParams.get('has') || '').split(',').filter(Boolean) : offer; const nj = L.next(offer); if (nj) { nj.startedAt = Date.now(); nj.step = 'picked up by the PC'; } return send(res, 200, { job: nj }); }
      if (p === '/api/worker/done' && req.method === 'POST') { const b = await body(req); const j = L.get(b.id); if (!j) return send(res, 404, {}); if (j.backend === 'readdir') { const n = b.ok ? U.fromPcFiles(b.result && b.result.files, j.dir) : 0; return send(res, 200, L.update(j.id, { status: b.ok ? 'done' : 'failed', error: b.error, result: { text: `${n} new update(s)` } }, 'update folder read')); }
      if (j.backend === 'push-branch') {
        if (!b.ok) return send(res, 200, L.update(j.id, { status: 'failed', error: b.error || 'The PC could not push the branch.' }, 'push failed'));
        L.update(j.id, { status: 'running', step: 'merging into main on GitHub' }, 'branch pushed');
        (async () => { try { const m = await ghApi('/merges', 'POST', { base: 'main', head: j.branch, commit_message: `Merge ${j.branch} (Brenebase job ${j.of})` }); L.update(j.id, { step: 'deploying' }, m && m.sha ? `merged as ${m.sha.slice(0, 7)}` : 'already in main'); await deployNow(); L.update(j.id, { status: 'done', result: { text: `Merged ${j.branch} into main and started the deploy. Reload Brenebase in about a minute; tap Update now on the PC tab if the worker changed.` } }, 'deploy started'); }
          catch (e) { L.update(j.id, { status: 'failed', error: String(e.message || e) }, 'ship failed'); } })();
        return send(res, 200, { ok: true });
      }
      if (j.backend === 'skills-list') { const r = b.result || {}; SK.setPc(b.ok ? r.files : [], b.ok ? ((r.errors || []).join('; ') || null) : (b.error || 'the PC could not read them')); return send(res, 200, L.update(j.id, { status: b.ok ? 'done' : 'failed', error: b.error, result: { text: b.text } }, 'skills read')); }
      if (j.backend === 'read') { if (b.ok && b.result && b.result.foundAt && b.result.foundAt !== j.source.path) PJ.remember(j.project, j.source.path, b.result.foundAt); const added = PJ.recordPc(j.project, j.source, b.ok, b.text || '', b.error); return send(res, 200, L.update(j.id, { status: b.ok ? 'done' : 'failed', error: b.error, result: { text: b.ok ? `${added.length} new note(s)` : '' } }, 'notes read')); } const text = b.text != null ? rejoin(b.text, j.held || []) : undefined; if (j.image64) { delete j.image64; } if (j.pic && b.result && b.result.seen) CP.seen(j.pic, b.result.seen); if (j.companion && b.result && b.result.visionNote) CP.add('note', b.result.visionNote, { convo: j.convo }); if (j.companion && b.ok) CP.add('them', b.text || '', { job: j.id, convo: j.convo }); else if (j.companion) CP.add('note', `No reply: ${b.error || 'the PC model did not answer'}`, { convo: j.convo });
        if (b.result && b.result.audio64) { fs.mkdirSync(IMG_DIR, { recursive: true }); const f = `${j.id}.wav`; fs.writeFileSync(path.join(IMG_DIR, f), Buffer.from(b.result.audio64, 'base64')); b.result.audio = `/api/img/${f}`; delete b.result.audio64; if (j.of) { const src = L.get(j.of); if (src) L.update(src.id, { result: { ...src.result, audio: b.result.audio } }, 'read aloud ready'); } }
        if (b.result && b.result.images64) { fs.mkdirSync(IMG_DIR, { recursive: true }); b.result.images = b.result.images64.map(im => { const f = `${j.id}-${im.name.replace(/[^\w.-]/g, '')}`; fs.writeFileSync(path.join(IMG_DIR, f), Buffer.from(im.data, 'base64')); return `/api/img/${f}`; }); delete b.result.images64; b.result.restyle = j.tool === 'image' && j.mode === 'model'; }
        const fin = afterChange(L.update(b.id, { status: b.ok ? 'done' : 'failed', result: { ...b.result, text }, error: b.error }, b.ok ? 'back from the PC' : 'PC reported a failure'));
        /* a Claude Code job that finished is itself an update, even if it forgot to write the file */
        if (j.backend === 'claude-code' && b.ok) U.add(`---\nproject: ${j.project || (j.parent && (L.get(j.parent) || {}).project) || ''}\nby: Claude Code via Brenebase job ${j.id}\nbranch: ${(b.result && b.result.branch) || ''}\ntitle: ${String(j.label).replace(/\n/g, ' ')}\n---\n## Done\n${String(text || '').split('\n').filter(l => l.trim()).slice(0, 25).map(l => '- ' + l.replace(/^[-*]\s*/, '')).join('\n')}`, { key: `job:${j.id}`, from: `Brenebase job ${j.id}` });
        return send(res, 200, fin); }
      return send(res, 404, {});
    }

    if (p.startsWith('/api/') && !authed(req)) return send(res, 401, { error: 'login' });
    const im = p.match(/^\/api\/img\/([\w.-]+)$/);
    if (im) { const f = path.join(IMG_DIR, im[1]); if (!fs.existsSync(f)) return send(res, 404, {}); res.writeHead(200, { 'content-type': f.endsWith('.png') ? 'image/png' : f.endsWith('.wav') ? 'audio/wav' : f.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' }); return fs.createReadStream(f).pipe(res); }
    const one = p.match(/^\/api\/jobs\/([a-f0-9]+)$/);
    if (one && req.method === 'GET') { const j = L.get(one[1]); return j ? send(res, 200, dress(j)) : send(res, 404, {}); }
    /* make it again: a new job with the same request, so the pictures already made stay */
    if (p === '/api/deploy' && req.method === 'GET') { try { return send(res, 200, { last: await deployState() }); } catch (e) { return send(res, 200, { error: String(e.message || e) }); } }
    if (p === '/api/deploy' && req.method === 'POST') { try { await deployNow(); return send(res, 200, { ok: true, note: 'Deploy started. Brenebase restarts in about a minute; reload the page then.' }); } catch (e) { return send(res, 200, { error: String(e.message || e) }); } }
    /* a finished Brenebase code job: push its branch from the PC, merge it into main on GitHub, deploy */
    const sh = p.match(/^\/api\/jobs\/([a-f0-9]+)\/ship$/);
    if (sh && req.method === 'POST') {
      const o = L.get(sh[1]); if (!o || o.backend !== 'claude-code' || o.status !== 'done' || !o.result || !o.result.branch) return send(res, 400, { error: 'Only a finished code job with a branch can be shipped.' });
      if (!/(^|\/)brenebase$/i.test(o.repo || '')) return send(res, 200, { handoff: `Branch ${o.result.branch} in ${o.result.worktree || 'its worktree'} on the PC is ready for the ${o.project || o.repo} master session to review, test, merge and deploy. Jobs never merge or deploy other projects.` });
      const j = L.add({ tool: 'ship', mode: 'brenebase', backend: 'push-branch', runsOn: 'pc', label: `Ship: merge ${o.result.branch} into main and deploy`, text: `Push ${o.result.branch} from the PC, merge it into main on GitHub, then deploy Brenebase.`, repo: o.repo, branch: o.result.branch, worktree: o.result.worktree, of: o.id, status: 'queued' });
      return send(res, 200, dress(j));
    }
    const ag = p.match(/^\/api\/jobs\/([a-f0-9]+)\/again$/);
    if (ag && req.method === 'POST') { const o = L.get(ag[1]); if (!o) return send(res, 404, {}); const { noTwin, ...args } = o.args || {}; let j = makeJob({ text: o.text, tool: o.tool, mode: o.mode, area: o.area, autonomy: o.autonomy, args: { ...args, noTwin: true }, repo: o.repo, project: o.project || '', thread: o.thread, pic: o.pic }); if (j.status === 'ready') j = await start(j); return send(res, 200, dress(j)); }
    const rt = p.match(/^\/api\/jobs\/([a-f0-9]+)\/retry$/);
    if (rt && req.method === 'POST') {
      const j = L.get(rt[1]); if (!j) return send(res, 404, {}); delete j.skillCheck;
      L.update(j.id, { error: undefined, step: '', live: '', startedAt: 0 }, 'retried');
      if (PC_BACKENDS.includes(j.backend)) { L.update(j.id, { status: 'queued' }); if (!workerOnline()) PA.jumpstart(['worker']).catch(() => {}); return send(res, 200, dress(L.get(j.id))); }
      return send(res, 200, dress(await start(L.update(j.id, { status: 'ready' }))));
    }
    const sp = p.match(/^\/api\/jobs\/([a-f0-9]+)\/speak$/);
    if (sp && req.method === 'POST') {
      /* read a job's answer aloud with the voice pack on the PC */
      const sb = await body(req); const j = L.get(sp[1]); const said = j && j.result && speakable(j.result.text); if (!said) return send(res, 400, { error: 'nothing a person would read out' });
      const k = L.add({ tool: 'voice', mode: 'speak', backend: 'tts', runsOn: 'pc', label: 'Read aloud', text: said, of: j.id, voice: sb.voice || SETTINGS.voice, speed: SETTINGS.speed, status: 'queued', quiet: true });
      if (!workerOnline()) PA.jumpstart(['worker']).catch(() => {});
      return send(res, 200, { ok: true, id: k.id });
    }
    const rs = p.match(/^\/api\/jobs\/([a-f0-9]+)\/restyle$/);
    if (rs && req.method === 'POST') {
      /* her render goes to Meshy as the reference picture (a data URL, since Brenebase pictures need a login) */
      const b = await body(req); const j = L.get(rs[1]); const img = j && j.result && (j.result.images || [])[b.n || 0]; if (!img) return send(res, 404, {});
      const f = path.join(IMG_DIR, path.basename(img)); const data = `data:${f.endsWith('.png') ? 'image/png' : 'image/webp'};base64,${fs.readFileSync(f).toString('base64')}`;
      return send(res, 200, makeJob({ text: `${b.style || 'Realistic, detailed, natural lighting'}. Keep the same character, outfit, pose and framing. ${j.text}`, tool: 'image', mode: 'edit', area: j.area, autonomy: 'draft', args: { image_url: data }, project: j.project }));
    }
    if (p === '/api/studio/probe' && req.method === 'POST') { const j = L.add({ tool: 'image', mode: 'studio', backend: 'probe', runsOn: 'pc', label: 'Find Brenai Studio on the PC', text: 'Look for Brenai Studio on the usual local ports and list how its page talks to its server.', status: 'queued' }); if (!workerOnline()) PA.jumpstart(['worker']).catch(() => {}); return send(res, 200, j); }
    if (p === '/api/skills' && req.method === 'GET') { const a = SK.all(); return send(res, 200, { skills: a.skills.map(x => ({ name: x.name, description: x.description, from: x.from, src: x.src })), errors: a.errors, pc: SK.pcState() }); }
    if (p === '/api/skills/check' && req.method === 'POST') { const b = await body(req); const c = await SK.check(String(b.task || ''), { claude: b.rulesOnly ? null : claude }); return send(res, 200, { ...c, log: SK.logLines(c) }); }
    if (p === '/api/skills/sync' && req.method === 'POST') { const j = L.add({ tool: 'skills', mode: 'read', backend: 'skills-list', runsOn: 'pc', label: 'Read the skill folders on the PC', text: 'Read every SKILL.md in the PC skill folders.', status: 'queued' }); return send(res, 200, j); }
    if (p === '/api/studio/vision' && req.method === 'POST') { const calls = [{ path: '/api/llm/status', max: 4000 }, ...['image_url', 'vision', 'mmproj', 'caption', 'llm/chat', 'describe', 'paste', 'readAsDataURL'].map(g => ({ path: '/', grep: g, before: 700, after: 500 })), { path: '/api/config', max: 6000 }]; const j = L.add({ tool: 'image', mode: 'studio', backend: 'studio', runsOn: 'pc', label: 'How Brenai Studio reads pictures', text: 'Read how Brenai Studio reads a picture (its model and the request it sends), so Brenebase can use the same. Changes nothing. Keep Brenai Studio open.', calls, status: 'queued' }); return send(res, 200, j); }
    if (p === '/api/engines/help' && req.method === 'POST') { const j = L.add({ tool: 'image', mode: 'studio', backend: 'engine-help', runsOn: 'pc', label: "Read the picture and movie engine's options", text: 'Run sd-cli --help and read the notes next to it, so the movie model can be wired up exactly. Changes nothing.', status: 'queued' }); return send(res, 200, j); }
    if (p === '/api/engines/find' && req.method === 'POST') { const j = L.add({ tool: 'image', mode: 'studio', backend: 'engines', runsOn: 'pc', label: 'Find the image and movie engines on the PC', text: 'Find how Brenai Studio runs its image and movie models (program, model files, command lines), so Brenebase can run them itself. Reads only.', status: 'queued' }); return send(res, 200, j); }
    if (p === '/api/studio/look' && req.method === 'POST') {
      /* read-only: Studio's settings, models, state, jobs, LLM status, and the code that builds its image request */
      const calls = [{ path: '/api/config' }, { path: '/api/models' }, { path: '/api/state' }, { path: '/api/llm/status' }, { path: '/api/jobs', max: 1200 }, { path: '/app.js?v=ui4', grep: "api('image'" }, { path: '/app.js?v=ui4', grep: 'function imageParams', before: 50, after: 900 }, { path: '/app.js?v=ui4', grep: 'function imgEngine', before: 50, after: 500 }];
      const j = L.add({ tool: 'image', mode: 'studio', backend: 'studio', runsOn: 'pc', label: 'Look inside Brenai Studio', text: 'Read Studio settings, models, state, jobs and how it builds an image request (changes nothing).', calls, status: 'queued' });
      if (!workerOnline()) PA.jumpstart(['worker']).catch(() => {}); return send(res, 200, j);
    }
    if (p === '/api/threads' && req.method === 'GET') return send(res, 200, { threads: TH.list() });
    if (p === '/api/threads' && req.method === 'POST') { const b = await body(req); return send(res, 200, b.id ? TH.update(b.id, b) : TH.open(b)); }
    if (p === '/api/inbox' && req.method === 'GET') {
      /* finished and failed jobs for the results window, newest first, plus the talk about them */
      const since = +u.searchParams.get('since') || 0;
      const items = L.list(200).filter(j => ['done', 'failed'].includes(j.status) && !j.companion && !['tts', 'read', 'readdir'].includes(j.backend) && (j.updated || j.at) > since).sort((a, b) => (b.updated || b.at) - (a.updated || a.at)).slice(0, 30).map(dress)
        .map(j => ({ id: j.id, label: j.label, text: String(j.text || '').slice(0, 200), status: j.status, at: j.updated || j.at, report: j.report, error: j.error, images: (j.result && j.result.images) || [], audio: j.result && j.result.audio, answer: j.result && j.result.text ? String(j.result.text).slice(0, 20000) : '', link: j.result && j.result.link, branch: j.result && j.result.branch }));
      return send(res, 200, { items, talk: CP.historyOf('results'), waiting: L.list(80).some(j => j.companion && j.convo === 'results' && ['queued', 'running'].includes(j.status)), setup: CP.state().setup });
    }
    if (p === '/api/inbox/ask' && req.method === 'POST') {
      const b = await body(req); const src = L.get(b.job); const text = String(b.text || '').trim(); if (!src || !text) return send(res, 400, { error: 'which result, and what do you want to know?' });
      CP.ensure('results', 'Results'); CP.add('me', text, { convo: 'results', about: src.id });
      const info = `${src.label}\nAsked: ${String(src.text || '').slice(0, 1500)}\nStatus: ${src.status}${src.error ? '\nError: ' + src.error : ''}\nResult:\n${String((src.result && src.result.text) || '').slice(0, 6000)}`;
      const rq = CP.requestAbout('results', info);
      const j = L.add({ tool: 'companion', mode: 'chat', backend: 'pc-model', runsOn: 'pc', label: 'Companion: about a result', text, system: rq.system, messages: rq.messages, maxTokens: 600, companion: true, convo: 'results', status: 'queued', quiet: true });
      if (!workerOnline()) PA.jumpstart(['worker', 'model']).catch(() => {}); else if (!worker.can.includes('pc-model')) PA.jumpstart(['model']).catch(() => {});
      return send(res, 200, { ok: true, id: j.id });
    }
    if (p === '/api/companion' && req.method === 'GET') {
      /* say why a reply is not coming, instead of "thinking" forever */
      const w = L.list(80).find(j => j.companion && ['queued', 'running'].includes(j.status));
      const age = w ? Date.now() - w.at : 0;
      const drawing = (worker.busy || []).some(x => /^Images:/.test(x));
      const stuck = !w || age < 4000 ? '' : drawing && w.status === 'queued' ? 'Your PC is drawing a picture; she answers as soon as it is done (they share the graphics card).' : age < 20000 ? '' : !workerOnline() ? 'Your PC worker is offline: PC tab, Start everything (or check the PC is on).' : !worker.can.includes('pc-model') ? 'The model is not loaded on your PC. Brenebase asked the PC to load it; if that does not work, PC tab, Load. Brenai Studio in Coding mode also unloads it.' : w.status === 'queued' ? 'Waiting for the PC worker to pick it up.' : age > 120000 ? 'The PC model is taking a long time; it may be busy or stuck. PC tab, Unload then Load.' : '';
      return send(res, 200, { ...CP.state(), waiting: !!w, stuck, pc: workerOnline() });
    }
    if (p === '/api/companion/setup' && req.method === 'POST') { const b = await body(req); return send(res, 200, { setup: CP.setup(b) }); }
    if (p === '/api/companion/convo' && req.method === 'POST') { const b = await body(req); return send(res, 200, CP.convo(b)); }
    if (p === '/api/doll/ask' && req.method === 'POST') { const b = await body(req); if (!String(b.text || '').trim()) return send(res, 400, { error: 'say what to change' }); return send(res, 200, await dollAsk(String(b.text).slice(0, 2000), b.current || (CP.state().setup || {}))); }
    if (p === '/api/dolls' && req.method === 'GET') return send(res, 200, { dolls: CP.dolls() });
    if (p === '/api/dolls' && req.method === 'POST') { const b = await body(req); return send(res, 200, { dolls: b.drop ? CP.dropDoll(b.drop) : CP.saveDoll(b) }); }
    if (p === '/api/companion/clear' && req.method === 'POST') { CP.clear(); return send(res, 200, { ok: true }); }
    if (p === '/api/companion/say' && req.method === 'POST') {
      /* one turn: his line goes into the history, the PC model gets the recent conversation; no filters, PC only */
      const b = await body(req, 9e6); const text = String(b.text || '').trim();
      /* a picture: saved here, then read by a vision model (on the PC, or Claude if he chose that), and she answers what it shows */
      const im = typeof b.image === 'string' && b.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!text && !im) return send(res, 400, { error: 'say something' });
      const mode = CP.MODES.includes(b.mode) ? b.mode : 'chat'; const convo = CP.state().current;
      let pic = null, picUrl = null;
      if (im) { pic = crypto.randomBytes(6).toString('hex'); fs.mkdirSync(IMG_DIR, { recursive: true }); const f = `cp-${pic}.${im[1] === 'jpeg' ? 'jpg' : im[1]}`; fs.writeFileSync(path.join(IMG_DIR, f), Buffer.from(im[2], 'base64')); picUrl = `/api/img/${f}`; }
      CP.add('me', text, { mode, convo, ...(pic ? { image: picUrl, pic } : {}) });
      const reader = (CP.state().setup || {}).imageReader || 'pc';
      if (im && reader === 'claude' && claude) { try { CP.seen(pic, await describeImage(im[1], im[2])); } catch (e) { CP.add('note', `Claude could not read the picture: ${String(e.message || e).slice(0, 160)}`, { convo }); } }
      /* asking her to change ("put on a red dress", "try a ponytail"): the doll skill works out the new look on the PC model and it is kept */
      if (text && /\b(wear|wearing|put on|take off|change (into|your|her|clothes|outfit)|dress (up|in|yourself)|outfit|hair ?(style|cut|colou?r)?|dye|switch (to|into)|try on|glasses|ponytail|pigtails|braid|skirt|jeans|shorts|leggings|hoodie|sweater|boots|sneakers|heels)\b/i.test(text)) {
        const cur = CP.state().setup || {};
        dollAsk(`Andrew said to his companion: "${text}". If he is asking her to change how she looks (clothes, hair, colours, glasses), give the change. If not, answer {"look":{},"note":""}.`, cur).then(d => {
          if (d.error || !d.look) return; const now = CP.state().setup || {}; if (JSON.stringify(d.look) === JSON.stringify(now.look || {})) return;
          CP.setup({ ...now, look: d.look }); CP.add('note', `Her look changed${d.note ? ': ' + d.note : ''}`, { convo });
        }).catch(() => { });
      }
      const rq = CP.request(mode);
      const needPc = im && !(CP.state(400).history.find(m => m.pic === pic) || {}).seen;
      const j = L.add({ tool: 'companion', mode, backend: 'pc-model', runsOn: 'pc', label: `Companion: ${mode}`, text: text || '(a picture)', system: rq.system, messages: rq.messages, maxTokens: 600, companion: true, convo, status: 'queued', quiet: true, ...(needPc ? { image64: im[2], imageMime: `image/${im[1]}`, pic } : {}) });
      if (!workerOnline()) PA.jumpstart(['worker', 'model']).catch(() => {}); else if (!worker.can.includes('pc-model')) PA.jumpstart(['model']).catch(() => {});
      return send(res, 200, { ok: true, id: j.id });
    }
    if (p === '/api/settings' && req.method === 'GET') return send(res, 200, SETTINGS);
    if (p === '/api/settings' && req.method === 'POST') { const b = await body(req); if (['complex', 'all', 'off'].includes(b.copilotReview)) SETTINGS.copilotReview = b.copilotReview; if (b.voice && /^[a-z]{2}_[a-z]+$/.test(b.voice)) SETTINGS.voice = b.voice; if (b.speed) SETTINGS.speed = Math.max(0.6, Math.min(1.6, +b.speed || 1)); saveSettings(); return send(res, 200, SETTINGS); }
    if (p === '/api/catalogue') return send(res, 200, { tools: TOOLS, areas: Object.fromEntries(Object.entries(AREAS).map(([k, v]) => [k, v.label])), autonomy: AUTONOMY, worker: { online: workerOnline(), can: worker.can }, claude: !!claude, meshy: !!process.env.MESHY_API_KEY });
    if (p === '/api/think' && req.method === 'POST') {
      const b = await body(req); const tg = TG.read(b.text || ''); const th = b.thread && TH.get(b.thread);
      const pj = (b.project && PJ.card(b.project)) || (tg.project && PJ.card(tg.project)) || (th && th.project && PJ.card(th.project)) || PJ.match(b.text || '');
      if (Date.now() - SK.pcState().at > 600000 && worker.can.includes('skills-list') && !L.list(200).some(x => x.backend === 'skills-list' && ['queued', 'running'].includes(x.status))) L.add({ tool: 'skills', mode: 'read', backend: 'skills-list', runsOn: 'pc', label: 'Read the skill folders on the PC', text: 'Read every SKILL.md in the PC skill folders.', status: 'queued', quiet: true });
      const plan = await think((tg.rest || b.text) + (b.hasImage ? '\n\n[Andrew attached a picture to this request. Parts that should look at it get it.]' : ''), { claude, askPc, project: pj, tags: tg });
      return send(res, 200, { ...plan, tags: tg, project: pj ? { id: pj.id, name: pj.name, private: !!pj.private } : null, hints: PJ.hints(pj, tg.rest || b.text) });
    }
    if (p === '/api/route' && req.method === 'POST') {
      const b = await body(req); const v = vet(b.text); const tg = v.tags;
      const r = await route(tg.rest || b.text, { claude });
      /* a tool tag is a head start: it wins only when the statement is one part */
      if (tg.tool && v.parts.length === 1) { r.pick = resolve(v.parts[0].tool, v.parts[0].mode); r.why = `Tag ${tg.found.join(' + ')}: ${r.pick.label}`; r.confidence = 1; r.question = ''; }
      if (tg.area) r.area = tg.area;
      const pj = (tg.project && PJ.card(tg.project)) || PJ.match(b.text);
      const hintText = `${tg.rest} ${tg.focus || ''}`;
      return send(res, 200, { ...r, tags: tg, vet: v, project: pj ? { id: pj.id, name: pj.name, private: !!pj.private, needsInfo: !!pj.needs_info, byTag: !!tg.project } : null, hints: PJ.hints(pj, hintText) });
    }
    if (p === '/api/jobs/parts' && req.method === 'POST') {
      /* one job per part; every part goes through makeJob's checks on its own */
      const b = await body(req, 9e6); const pic = b.image ? savePic(b.image) : null; delete b.image; const parent = L.add({ tool: 'parts', mode: 'parts', backend: 'parts', runsOn: 'cloud', label: `Parts: ${String(b.text || '').slice(0, 50)}`, text: b.text, project: b.project || null, status: 'running', children: [] });
      const kids = [];
      const byIdx = {}, pending = [];
      for (const [idx, pt] of (b.parts || []).entries()) {
        const needs = (pt.needs || []).filter(n => Number.isInteger(n) && n < idx);
        if (needs.length) { pending.push({ idx, pt, needs }); continue; }
        let j = makeJob({ text: pt.text, tool: pt.tool, mode: pt.mode, area: b.area, autonomy: b.autonomy, project: pt.private ? 'work' : b.project, repo: b.repo, thread: b.thread, pic }); L.update(j.id, { parent: parent.id, ...(pt.skills && pt.skills.length ? { plannedSkills: pt.skills } : {}) }); byIdx[idx] = j.id; kids.push(j.id); if (j.status === 'ready') start(j).catch(() => { });
      }
      const par = L.update(parent.id, { children: kids, byIdx, pending, area: b.area, autonomy: b.autonomy, repo: b.repo, thread: b.thread, status: 'done' }, `${kids.length} part(s) sent to their tools${pending.length ? `, ${pending.length} waiting for an earlier part` : ''}`);
      return send(res, 200, dress(par));
    }
    if (p === '/api/tags' && req.method === 'GET') return send(res, 200, { tags: TG.tags() });
    if (p === '/api/tags' && req.method === 'POST') { const b = await body(req); return send(res, 200, { tags: TG.saveTags(b.tags) }); }
    if (p === '/api/pc' && req.method === 'GET') return send(res, 200, { ...(await PA.state()), worker: { online: workerOnline(), can: worker.can, busy: worker.busy || [] }, actions: PA.ACTIONS });
    if (p === '/api/pc/do' && req.method === 'POST') { const b = await body(req); return send(res, 200, await PA.call(b.action)); }
    if (p === '/api/projects' && req.method === 'GET') return send(res, 200, { projects: PJ.cards().map(c => ({ ...c, live: PJ.liveFor(c.id), updates: U.list(c.id, 20) })), unassigned: U.list(null, 200).filter(u => !u.project || !PJ.card(u.project)).slice(0, 20) });
    if (p === '/api/updates' && req.method === 'GET') return send(res, 200, { updates: U.list(u.searchParams.get('project'), 100) });
    if (p === '/api/updates' && req.method === 'POST') { const b = await body(req); const x = U.add(b.text, { key: `page:${Date.now()}`, project: b.project, from: 'pasted on the page' }); return send(res, 200, x || { error: 'nothing found in it (needs Done, Tested, Broken or Open bullets)' }); }
    if (p === '/api/updates/scan' && req.method === 'POST') return send(res, 200, await syncUpdates());
    if (p === '/api/projects/sync' && req.method === 'POST') { const b = await body(req); return send(res, 200, await syncProjects(b.id)); }
    const ph = p.match(/^\/api\/projects\/([a-z0-9-]+)\/help$/);
    if (ph && req.method === 'POST') { const b = await body(req); const pj = PJ.card(ph[1]); if (!pj) return send(res, 404, {}); const text = `Help me solve this in ${pj.name}: ${b.item}`; const r = await route(text, { claude, rulesOnly: true }); const pick = r.pick && r.pick.tool !== 'companion' ? r.pick : { tool: 'expert', mode: pj.area === 'work' ? 'ops' : 'game' }; let j = makeJob({ text, tool: pick.tool, mode: pick.mode, area: pj.area, autonomy: 'draft', project: pj.id, repo: b.repo }); if (j.status === 'ready') j = await start(j); return send(res, 200, j); }
    if (p === '/api/split/plan' && req.method === 'POST') { const b = await body(req); const pl = b.plan || P.plan(b.text); if (b.add) P.addSlot(pl, b.add); return send(res, 200, { plan: pl, brief: P.codeBrief(pl, { id: 'NEW', repo: b.repo }), leaks: P.leaks(pl), types: Object.keys(P.SLOT_TYPES) }); }
    if (p === '/api/split/run' && req.method === 'POST') { const b = await body(req); if (!b.plan || !b.plan.mechanics.length) return send(res, 400, { error: 'nothing for the code part to build' }); return send(res, 200, startSplit(b)); }
    if (p === '/api/jobs' && req.method === 'GET') { const tf = u.searchParams.get('thread'); const NEED = { 'claude-code': 'Claude Code is not installed or not signed in on the PC (npm i -g @anthropic-ai/claude-code, then run claude once to sign in)', 'blender': 'Blender is not found on the PC (set BLENDER to blender.exe)', tts: 'the voice pack is not found on the PC (run start-wizra.ps1 once)', 'pc-model': 'the model is not loaded (PC tab: Load)' };
      /* a PC job the worker no longer has (it was restarted or replaced) would say "running" forever: after 10 quiet minutes, fail it so Retry shows */
      for (const j of L.list(200)) if (j.status === 'running' && j.runsOn === 'pc' && Date.now() - (j.stepAt || j.startedAt || j.at) > 600000 && !(worker.busyAt && Date.now() - worker.busyAt < 60000 && (worker.busyIds || []).includes(j.id))) afterChange(L.update(j.id, { status: 'failed', error: 'Lost track of this job on the PC: the worker was restarted or replaced while it ran. Tap Retry.' }, 'lost on the PC'));
      for (const j of L.list(200)) if (j.status === 'queued' && workerOnline() && PC_BACKENDS.includes(j.backend) && !worker.can.includes(j.backend)) j.stuck = `Waiting: ${NEED[j.backend] || 'this PC cannot do ' + j.backend}.`; else delete j.stuck; return send(res, 200, { jobs: L.list(200).filter(j => !j.quiet && (!tf || j.thread === tf || (j.parent && (L.get(j.parent) || {}).thread === tf))).slice(0, 80).map(dress), worker: { online: workerOnline(), can: worker.can } }); }
    if (p === '/api/jobs' && req.method === 'POST') { const b = await body(req, 9e6); const pic = b.image ? savePic(b.image) : null; delete b.image; const planned = Array.isArray(b.skills) ? b.skills.map(String).slice(0, 12) : null; if (b.private) b.project = 'work'; delete b.skills; delete b.private; let j = makeJob({ ...b, ...(pic ? { pic } : {}) }); if (planned && planned.length) j = L.update(j.id, { plannedSkills: planned }); if (j.status === 'ready') j = await start(j); return send(res, 200, j); }
    const fm = p.match(/^\/api\/jobs\/([a-f0-9]+)\/fill$/);
    if (fm && req.method === 'POST') { const b = await body(req); const par = L.get(fm[1]); if (!par || !par.slots) return send(res, 404, {}); fillSlot(par, b.slot, b.value ? { source: b.source || 'url', value: b.value, from: 'you' } : null); L.update(par.id, {}, `${b.slot} ${b.value ? 'filled by you' : 'cleared'}`); return send(res, 200, afterChange({ parent: par.id })); }
    const ans = p.match(/^\/api\/jobs\/([a-f0-9]+)\/answer$/);
    if (ans && req.method === 'POST') { const b = await body(req); const j = L.get(ans[1]); if (!j) return send(res, 404, {}); L.update(j.id, { result: { ...j.result, prompt: j.result && j.result.text } }, 'answer pasted back from Copilot'); return send(res, 200, await copilotAnswer(L.get(j.id), b.text, 'pasted')); }
    const m = p.match(/^\/api\/jobs\/([a-f0-9]+)\/(approve|cancel|refresh)$/);
    if (m && req.method === 'POST') {
      const j = L.get(m[1]); if (!j) return send(res, 404, {});
      if (m[2] === 'cancel') return send(res, 200, L.update(j.id, { status: 'cancelled' }, 'cancelled'));
      if (m[2] === 'approve' && j.status === 'waiting' && j.backend === 'split') return send(res, 200, startMerge(j));
      if (m[2] === 'approve' && j.status === 'waiting') return send(res, 200, afterChange(await start(L.update(j.id, {}, 'OK given'))));
      if (m[2] === 'refresh' && j.backend === 'meshy' && j.result && j.result.task) {
        const all = await Promise.all((j.result.tasks || [j.result.task]).map(id => meshyStatus(j.result.meshy, id)));
        const done = all.every(x => x.status === 'SUCCEEDED'), bad = all.some(x => ['FAILED', 'CANCELED', 'EXPIRED'].includes(x.status)), s = all[0];
        const images = all.flatMap(x => x.image_urls || []);
        return send(res, 200, afterChange(L.update(j.id, { status: done ? 'done' : bad ? 'failed' : 'running', result: { ...j.result, progress: Math.min(...all.map(x => x.progress || 0)), models: s.model_urls, thumb: s.thumbnail_url, images } }, `Meshy: ${all.map(x => x.status).join(', ')}`)));
      }
      return send(res, 200, j);
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'no such route' });

    const f = path.join(PUB, p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log(`Brenebase on :${PORT} (tailscale ${PA.tailnetReady() ? 'on' : 'off'}), (claude ${claude ? 'on' : 'off'}, meshy ${process.env.MESHY_API_KEY ? 'on' : 'off'}, login ${PASS ? 'on' : 'OFF'})`));
