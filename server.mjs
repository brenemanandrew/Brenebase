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
const body = req => new Promise(ok => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });

/* a routed thought becomes a job. Whether it runs now or waits depends on autonomy, the tool's gate and whether it spends credits. */
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
function makeJob({ text, tool, mode, area, autonomy = 'draft', args = {}, repo, target, project, thread }) {
  const th = thread && TH.get(thread); if (th && th.project && project === undefined) project = th.project;
  if (tool === 'image' && mode === 'model' && !args.specs) args = { ...args, specs: wizraSpecs(text) };
  let r = resolve(tool, mode); if (!r) throw new Error('unknown tool');
  if (process.env.HUB_WORK_LOCAL === '1' && area === 'work' && r.backend === 'claude') r = { ...r, backend: 'pc-model', runsOn: 'pc' };
  const pj = project === '' ? null : PJ.card(project) || PJ.match(text);
  /* a private (work) project's context never goes to the cloud: those jobs move to the PC model */
  if (pj && pj.private && r.backend === 'claude') r = { ...r, backend: 'pc-model', runsOn: 'pc' };
  const job = { text, area: area || (pj && pj.area), autonomy, args, repo: repo || (pj && pj.repo && pj.repo.includes('/') && !pj.repo.includes(' ') ? pj.repo : undefined), target, project: pj ? pj.id : null, thread: th ? th.id : undefined, ...r };
  const safe = ['brief', 'claude', 'link', 'copilot'].includes(r.backend) || (r.backend === 'pc-model') || (tool === 'image' && r.mode === 'model');
  const mustAsk = r.gate === 'always' || SPENDS.includes(r.backend) || autonomy === 'ask' || (autonomy === 'draft' && !safe);
  return L.add({ ...job, status: mustAsk ? 'waiting' : 'ready' });
}

async function start(j) {
  try {
    if (j.backend === 'brief') { const b = brief(j, PJ.context(j.project && PJ.card(j.project), 'code', j.text)); return L.update(j.id, { status: 'done', result: { text: b.prompt }, held: b.held }, b.secrets ? `${b.secrets} secret(s) removed` : 'brief written'); }
    if (j.backend === 'link') { const f = LINKS[`${j.tool}:${j.mode}`]; return L.update(j.id, { status: 'done', result: { link: f ? f(j.target) : null, text: j.does } }, 'link ready'); }
    if (j.backend === 'claude') { L.update(j.id, { status: 'running' }); const r = await runClaude(j, claude, PJ.context(j.project && PJ.card(j.project), 'cloud', j.text), j.thread ? TH.history(L.list(200).filter(x => x.id !== j.id), j.thread) : []); return L.update(j.id, { status: 'done', result: { text: rejoin(r.text, r.held) } }, 'answered by Claude'); }
    if (j.backend === 'copilot') { const r = await runCopilot(j, j.project && PJ.card(j.project)); return r.relay ? L.update(j.id, { status: 'waiting-answer', result: { text: r.prompt, link: r.link, relay: true } }, 'Ready: copy it into Copilot, paste the answer back') : copilotAnswer(j, r.text, r.via); }
    if (j.backend === 'meshy') { L.update(j.id, { status: 'running' }); const r = await runMeshy(j); return L.update(j.id, { status: 'running', result: r }, `Meshy task ${r.task} started`); }
    if (PC_BACKENDS.includes(j.backend)) {
      const pj = j.project && PJ.card(j.project);
      const extra = j.backend === 'claude-code' ? { prompt: brief(j, PJ.context(pj, 'code', j.text)).prompt, held: brief(j).held } : j.backend === 'pc-model' ? { system: systemFor(j.tool, j.mode) + (pj ? '\n\n' + PJ.context(pj, 'local', j.text) : ''), ...(j.thread && !j.messages ? { messages: [...TH.history(L.list(200).filter(x => x.id !== j.id), j.thread), { role: 'user', content: j.text }] } : {}) } : {};
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
function afterChange(j) {
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

    /* ---- the PC worker ---- */
    if (p.startsWith('/api/worker/')) {
      if (!isWorker(req)) return send(res, 401, { error: 'worker token refused' });
      worker.seen = Date.now();
      if (p === '/api/worker/next') { worker.can = (u.searchParams.get('can') || '').split(',').filter(Boolean); return send(res, 200, { job: L.next(worker.can) }); }
      if (p === '/api/worker/done' && req.method === 'POST') { const b = await body(req); const j = L.get(b.id); if (!j) return send(res, 404, {}); if (j.backend === 'readdir') { const n = b.ok ? U.fromPcFiles(b.result && b.result.files, j.dir) : 0; return send(res, 200, L.update(j.id, { status: b.ok ? 'done' : 'failed', error: b.error, result: { text: `${n} new update(s)` } }, 'update folder read')); }
      if (j.backend === 'read') { if (b.ok && b.result && b.result.foundAt && b.result.foundAt !== j.source.path) PJ.remember(j.project, j.source.path, b.result.foundAt); const added = PJ.recordPc(j.project, j.source, b.ok, b.text || '', b.error); return send(res, 200, L.update(j.id, { status: b.ok ? 'done' : 'failed', error: b.error, result: { text: b.ok ? `${added.length} new note(s)` : '' } }, 'notes read')); } const text = b.text != null ? rejoin(b.text, j.held || []) : undefined; if (j.companion && b.ok) CP.add('them', b.text || '', { job: j.id, convo: j.convo }); else if (j.companion) CP.add('note', `No reply: ${b.error || 'the PC model did not answer'}`, { convo: j.convo });
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
    if (im) { const f = path.join(IMG_DIR, im[1]); if (!fs.existsSync(f)) return send(res, 404, {}); res.writeHead(200, { 'content-type': f.endsWith('.png') ? 'image/png' : f.endsWith('.wav') ? 'audio/wav' : 'image/webp' }); return fs.createReadStream(f).pipe(res); }
    const one = p.match(/^\/api\/jobs\/([a-f0-9]+)$/);
    if (one && req.method === 'GET') { const j = L.get(one[1]); return j ? send(res, 200, j) : send(res, 404, {}); }
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
    if (p === '/api/threads' && req.method === 'GET') return send(res, 200, { threads: TH.list() });
    if (p === '/api/threads' && req.method === 'POST') { const b = await body(req); return send(res, 200, b.id ? TH.update(b.id, b) : TH.open(b)); }
    if (p === '/api/companion' && req.method === 'GET') return send(res, 200, { ...CP.state(), waiting: L.list(80).some(j => j.companion && ['queued', 'running'].includes(j.status)), pc: workerOnline() });
    if (p === '/api/companion/setup' && req.method === 'POST') { const b = await body(req); return send(res, 200, { setup: CP.setup(b) }); }
    if (p === '/api/companion/convo' && req.method === 'POST') { const b = await body(req); return send(res, 200, CP.convo(b)); }
    if (p === '/api/companion/clear' && req.method === 'POST') { CP.clear(); return send(res, 200, { ok: true }); }
    if (p === '/api/companion/say' && req.method === 'POST') {
      /* one turn: his line goes into the history, the PC model gets the recent conversation; no filters, PC only */
      const b = await body(req); const text = String(b.text || '').trim(); if (!text) return send(res, 400, { error: 'say something' });
      const mode = CP.MODES.includes(b.mode) ? b.mode : 'chat'; const convo = CP.state().current; CP.add('me', text, { mode, convo });
      const rq = CP.request(mode);
      const j = L.add({ tool: 'companion', mode, backend: 'pc-model', runsOn: 'pc', label: `Companion: ${mode}`, text, system: rq.system, messages: rq.messages, maxTokens: 600, companion: true, convo, status: 'queued', quiet: true });
      if (!workerOnline()) PA.jumpstart(['worker', 'model']).catch(() => {});
      return send(res, 200, { ok: true, id: j.id });
    }
    if (p === '/api/settings' && req.method === 'GET') return send(res, 200, SETTINGS);
    if (p === '/api/settings' && req.method === 'POST') { const b = await body(req); if (['complex', 'all', 'off'].includes(b.copilotReview)) SETTINGS.copilotReview = b.copilotReview; if (b.voice && /^[a-z]{2}_[a-z]+$/.test(b.voice)) SETTINGS.voice = b.voice; if (b.speed) SETTINGS.speed = Math.max(0.6, Math.min(1.6, +b.speed || 1)); saveSettings(); return send(res, 200, SETTINGS); }
    if (p === '/api/catalogue') return send(res, 200, { tools: TOOLS, areas: Object.fromEntries(Object.entries(AREAS).map(([k, v]) => [k, v.label])), autonomy: AUTONOMY, worker: { online: workerOnline(), can: worker.can }, claude: !!claude, meshy: !!process.env.MESHY_API_KEY });
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
      const b = await body(req); const parent = L.add({ tool: 'parts', mode: 'parts', backend: 'parts', runsOn: 'cloud', label: `Parts: ${String(b.text || '').slice(0, 50)}`, text: b.text, project: b.project || null, status: 'running', children: [] });
      const kids = [];
      for (const pt of b.parts || []) { let j = makeJob({ text: pt.text, tool: pt.tool, mode: pt.mode, area: b.area, autonomy: b.autonomy, project: b.project, repo: b.repo, thread: b.thread }); L.update(j.id, { parent: parent.id }); if (j.status === 'ready') j = await start(j); kids.push(j.id); }
      return send(res, 200, L.update(parent.id, { children: kids, status: 'done' }, `${kids.length} parts sent to their tools`));
    }
    if (p === '/api/tags' && req.method === 'GET') return send(res, 200, { tags: TG.tags() });
    if (p === '/api/tags' && req.method === 'POST') { const b = await body(req); return send(res, 200, { tags: TG.saveTags(b.tags) }); }
    if (p === '/api/pc' && req.method === 'GET') return send(res, 200, { ...(await PA.state()), worker: { online: workerOnline(), can: worker.can }, actions: PA.ACTIONS });
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
      for (const j of L.list(200)) if (j.status === 'queued' && workerOnline() && PC_BACKENDS.includes(j.backend) && !worker.can.includes(j.backend)) j.stuck = `Waiting: ${NEED[j.backend] || 'this PC cannot do ' + j.backend}.`; else delete j.stuck; return send(res, 200, { jobs: L.list(200).filter(j => !j.quiet && (!tf || j.thread === tf || (j.parent && (L.get(j.parent) || {}).thread === tf))).slice(0, 80), worker: { online: workerOnline(), can: worker.can } }); }
    if (p === '/api/jobs' && req.method === 'POST') { const b = await body(req); let j = makeJob(b); if (j.status === 'ready') j = await start(j); return send(res, 200, j); }
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
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log(`Brenebase on :${PORT} (tailscale ${PA.tailnetReady() ? 'on' : 'off'}), (claude ${claude ? 'on' : 'off'}, meshy ${process.env.MESHY_API_KEY ? 'on' : 'off'}, login ${PASS ? 'on' : 'OFF'})`));
