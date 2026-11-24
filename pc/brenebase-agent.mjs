/* Brenebase PC agent: the always-on piece on Andrew's PC that can jumpstart the LLMs and bridges from anywhere.

   Starts at login (install-agent.ps1 registers it), uses almost nothing while idle, and can do ONLY these things:
     status          what is running: the model server, the loaded model, each bridge, the hub worker
     model-start     lms unload --all, lms load <model> with the big context, lms server start (same as start-wizra.ps1)
     model-stop      lms unload --all, lms server stop
     start:<name>    start one helper: wizra (Wizra bridge), town (Breneland townsfolk bridge), worker (Brenebase worker)
     stop:<name>     stop one helper this agent started
     start-all       model, then every helper that is set up
     stop-all        every helper, then the model
     logs:<name>     the last lines a helper printed
   No other command can be run through it.

   Two ways in, both need the PC key (HUB_WORKER_TOKEN, the same secret as the worker):
     1. Tailscale: Brenebase calls http://<this PC's tailnet name>:8765 directly. Only addresses on the tailnet
        (100.64.0.0/10, fd7a:115c:a1e0::/48) and this PC itself are answered.
     2. Polling: every few seconds it asks brenebase.fly.dev for a waiting command. Works even if Tailscale is down.

   Settings (setx on Windows; the installer sets the first two)
     HUB_URL           https://brenebase.fly.dev
     HUB_WORKER_TOKEN  the PC key
     AGENT_PORT        8765
     LMS               path to lms.exe (default %USERPROFILE%\.lmstudio\bin\lms.exe)
     MODEL             mn-violet-lotus-12b         MODEL_CONTEXT  32768 (or WIZRA_CONTEXT)
     WIZRA_BRIDGE      %USERPROFILE%\Brenai\wizra-bridge.mjs
     TOWN_BRIDGE       path to Breneland-Next tools\npc-brain-bridge.mjs (leave empty if not on this PC)
     BRENEBASE_DIR     folder holding worker\hub-worker.mjs (default: the folder above this file)
   Run by hand: node brenebase-agent.mjs */
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';

const HOME = os.homedir();
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const HUB = (process.env.HUB_URL || 'https://brenebase.fly.dev').replace(/\/$/, '');
const KEY = (process.env.HUB_WORKER_TOKEN || '').trim();
const PORT = +process.env.AGENT_PORT || 8765;
const LMS = process.env.LMS || path.join(HOME, '.lmstudio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms');
const MODEL = process.env.MODEL || 'mn-violet-lotus-12b';
const CTX = process.env.MODEL_CONTEXT || process.env.WIZRA_CONTEXT || '16384';   /* 16k is plenty for her chat (24 messages) and leaves the picture engine room on the graphics card */
/* installed layout: Brenebase\pc\brenebase-agent.mjs and Brenebase\worker\hub-worker.mjs */
const BASE = process.env.BRENEBASE_DIR || path.dirname(HERE);
if (!KEY) { console.log('Set HUB_WORKER_TOKEN first (the PC key).'); process.exit(1); }

/* Hunyuan3D (the 3D model maker): a local server that needs the whole graphics card, so it and Wizra's model take turns */
const HUNYUAN_PORT = +process.env.HUNYUAN_PORT || 8081;
const MODE_FILE = path.join(HOME, 'Brenebase', 'gpu-mode.txt');   /* "wizra" or "3d": the worker reads it too */
const gpuMode = () => { try { return fs.readFileSync(MODE_FILE, 'utf8').trim() || 'wizra'; } catch { return 'wizra'; } };
const setMode = m => { try { fs.mkdirSync(path.dirname(MODE_FILE), { recursive: true }); fs.writeFileSync(MODE_FILE, m); } catch { } };
const portUp = port => new Promise(ok => { const c = net.connect({ host: '127.0.0.1', port }); const t = setTimeout(() => { c.destroy(); ok(false); }, 1500); c.on('connect', () => { clearTimeout(t); c.destroy(); ok(true); }); c.on('error', () => { clearTimeout(t); ok(false); }); });
const HELPERS = {
  hunyuan: { label: '3D model maker (Hunyuan3D)', file: process.env.HUNYUAN_BAT || 'F:\\Projects\\Hunyuan3D\\start_hunyuan3d.bat', port: HUNYUAN_PORT, manual: true },
  wizra: { label: 'Wizra bridge', file: process.env.WIZRA_BRIDGE || path.join(HOME, 'Brenai', 'wizra-bridge.mjs') },
  town: { label: 'Town bridge (Breneland townsfolk)', file: process.env.TOWN_BRIDGE || '' },
  worker: { label: 'Brenebase worker', file: path.join(BASE, 'worker', 'hub-worker.mjs'), env: { HUB_URL: HUB } },
};
const running = {};

const run = (cmd, args) => new Promise(ok => {
  const p = spawn(cmd, args, { windowsHide: true });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('error', e => ok({ code: -1, out: String(e.message) })); p.on('close', code => ok({ code, out: out.slice(-3000) }));
});

async function modelState() {
  try {
    const r = await fetch('http://127.0.0.1:1234/api/v0/models', { signal: AbortSignal.timeout(3000) });
    if (r.ok) { const j = await r.json(); const loaded = (j.data || []).filter(m => m.state === 'loaded').map(m => m.id); return { server: true, loaded }; }
    const r2 = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(3000) });
    return { server: r2.ok, loaded: r2.ok ? ['(server up; loaded model not reported)'] : [] };
  } catch { return { server: false, loaded: [] }; }
}

/* a helper stopped by a kill has exitCode null (only signalCode is set), so exitCode alone said "still running" and Start
   refused for good after every update. A process counts as alive only until its exit event. */
const alive = p => !!p && !p.ended && p.exitCode === null && p.signalCode === null;
function startHelper(name) {
  const h = HELPERS[name]; if (!h) return `no helper called ${name}`;
  if (!h.file) return `${h.label} is not set up on this PC`;
  if (!fs.existsSync(h.file)) return `${h.label}: file not found (${h.file})`;
  if (alive(running[name])) return `${h.label} already running`;
  /* a worker left running by an earlier copy of the agent is not ours and runs old code: stop it first (Windows) */
  if (name === 'worker' && process.platform === 'win32') { try { spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*hub-worker.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { windowsHide: true, timeout: 15000 }); } catch { } }
  const bat = /\.(bat|cmd)$/i.test(h.file);
  const p = bat ? spawn('cmd.exe', ['/c', h.file], { cwd: path.dirname(h.file), env: { ...process.env, ...(h.env || {}) }, windowsHide: true }) : spawn(process.execPath, [h.file], { cwd: path.dirname(h.file), env: { ...process.env, ...(h.env || {}) }, windowsHide: true });
  p.startedAt = Date.now();
  p.log = []; const keep = d => { p.log.push(...String(d).split('\n').filter(Boolean)); p.log = p.log.slice(-60); };
  p.stdout.on('data', keep); p.stderr.on('data', keep); p.on('exit', (c, sig) => { p.ended = true; keep(`(stopped, code ${c}${sig ? ', ' + sig : ''})`); });
  running[name] = p; return `${h.label} started`;
}
function stopHelper(name) {
  const p = running[name]; if (!alive(p)) return `${(HELPERS[name] || {}).label || name} was not running`;
  p.stopped = true;
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); } catch { p.kill(); } } else p.kill();
  return `${HELPERS[name].label} stopped`;
}

async function status() {
  const m = await modelState();
  return {
    pc: os.hostname(), at: new Date().toISOString(), uptimeMin: Math.round(os.uptime() / 60),
    model: { name: MODEL, context: +CTX, server: m.server, loaded: m.loaded, lmsFound: fs.existsSync(LMS) },
    mode: gpuMode(),
    helpers: Object.fromEntries(await Promise.all(Object.entries(HELPERS).map(async ([k, h]) => {
      const p = running[k], run = alive(p), up = h.port ? await portUp(h.port) : run;
      /* plain states: on, starting (running but not answering yet), failed (stopped with an error), off */
      const state = p && p.stopped ? (up ? 'starting' : 'off').replace('starting', 'off') : up ? 'on' : run ? 'starting' : p && p.ended && !/code 0\b/.test((p.log || []).slice(-1)[0] || '') ? 'failed' : 'off';
      return [k, { label: h.label, setUp: !!h.file && fs.existsSync(h.file), running: run || up, state, since: p && p.startedAt, log: (p && p.log || []).slice(-8) }];
    }))),
    files: Object.fromEntries(['worker/hub-worker.mjs', 'pc/brenebase-agent.mjs'].map(f => { try { return [f, crypto.createHash('sha1').update(fs.readFileSync(path.join(BASE, f))).digest('hex').slice(0, 7)]; } catch { return [f, 'missing']; } })),
  };
}

async function act(action) {
  const [verb, name] = String(action || '').split(':');
  if (verb === 'status') return { ok: true, status: await status() };
  if (verb === 'update') { await selfUpdate(); return { ok: true, note: 'Checked Brenebase for newer files; anything new was downloaded and restarted.', status: await status() }; }
  if ((verb === 'model-start' || (verb === 'start' && name === 'wizra')) && gpuMode() === '3d') return { ok: false, note: 'The 3D model maker has the graphics card. Switch to Wizra first.', status: await status() };
  if (verb === 'start' && name === 'hunyuan' && gpuMode() !== '3d') return { ok: false, note: 'Use the switch: turning on the 3D model maker takes Wizra offline.', status: await status() };
  if (verb === 'model-start') {
    if (!fs.existsSync(LMS)) return { ok: false, note: `lms not found at ${LMS}` };
    const a = await run(LMS, ['unload', '--all']);
    const b = await run(LMS, ['load', MODEL, '--context-length', String(CTX), '--gpu', 'max', '-y']);
    const c = await run(LMS, ['server', 'start', '--port', '1234']);
    return { ok: b.code === 0 && c.code === 0, note: [a.out, b.out, c.out].join('\n').trim().slice(-1500), status: await status() };
  }
  /* a picture-reading (vision) model for LM Studio, so pictures sent to the companion can be read on this PC. Downloads in the background. */
  if (verb === 'vision-get') {
    if (!fs.existsSync(LMS)) return { ok: false, note: `lms not found at ${LMS}` };
    if (running.vision && !running.vision.ended) return { ok: true, note: 'Already downloading. Tap Vision log to see how far.' };
    /* "lms get <name>" only searches LM Studio's staff picks; a full Hugging Face address always works. Tried in order until one downloads. */
    const tries = (process.env.VISION_GET ? [process.env.VISION_GET] : []).concat(['https://huggingface.co/lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF', 'lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF', 'https://huggingface.co/lmstudio-community/gemma-3-12b-it-GGUF']);
    const holder = { log: [], exitCode: null }; running.vision = holder;
    const keep = d => { holder.log.push(...String(d).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/[\r\n]+/).filter(x => x.trim())); holder.log = holder.log.slice(-40); };
    const next = i => { if (i >= tries.length) { holder.ended = true; holder.exitCode = 1; keep('(none of the downloads worked; send this log to Claude)'); return; }
      keep(`--- trying ${tries[i]}`); const p = spawn(LMS, ['get', tries[i], '-y'], { windowsHide: true });
      p.stdout.on('data', keep); p.stderr.on('data', keep); p.on('error', e => { keep(String(e.message)); next(i + 1); });
      p.on('exit', c => { if (c === 0) { holder.ended = true; holder.exitCode = 0; keep('(finished: the picture reader is installed; LM Studio loads it when a picture comes in)'); } else next(i + 1); }); };
    next(0);
    return { ok: true, note: `Downloading a picture reader with LM Studio (several GB): ${tries[0]}. Tap Vision log to see how far.` };
  }
  if (verb === 'logs' && name === 'vision') return { ok: true, note: (running.vision && running.vision.log || []).join('\n') || 'nothing yet' };
  /* one switch for the graphics card: Wizra (her model and bridge) or the 3D model maker. Only when Andrew presses it. */
  if (verb === 'mode' && name === '3d') {
    const notes = [stopHelper('wizra')];
    if (fs.existsSync(LMS)) { await run(LMS, ['unload', '--all']); notes.push('Wizra\'s model unloaded'); }
    setMode('3d'); notes.push(startHelper('hunyuan'), 'The first start downloads about 10 GB and loads for about 5 minutes; it shows "starting" until then.');
    return { ok: true, note: notes.join('\n'), status: await status() };
  }
  if (verb === 'mode' && name === 'wizra') {
    const notes = [stopHelper('hunyuan')]; setMode('wizra');
    const m = await act('model-start'); notes.push(m.ok ? 'Wizra\'s model loaded' : 'Wizra\'s model did NOT load: ' + (m.note || '').slice(-200));
    notes.push(startHelper('wizra'));
    return { ok: m.ok, note: notes.join('\n'), status: await status() };
  }
  if (verb === 'model-stop') { await run(LMS, ['unload', '--all']); const r = await run(LMS, ['server', 'stop']); return { ok: true, note: r.out.trim(), status: await status() }; }
  if (verb === 'start') { const note = startHelper(name); return { ok: /started|already running/.test(note), note, status: await status() }; }
  if (verb === 'stop') return { ok: true, note: stopHelper(name), status: await status() };
  if (verb === 'logs') return { ok: true, note: (running[name] && running[name].log || []).join('\n') || 'nothing yet' };
  if (verb === 'start-all') {
    const notes = []; const m = await modelState();
    if (!m.loaded.length) notes.push((await act('model-start')).ok ? 'model loaded' : 'model did NOT load');
    else notes.push('model already loaded');
    for (const k of Object.keys(HELPERS)) if (!HELPERS[k].manual) notes.push(startHelper(k));
    return { ok: true, note: notes.join('\n'), status: await status() };
  }
  if (verb === 'stop-all') { const notes = Object.keys(HELPERS).map(stopHelper); await act('model-stop'); notes.push('model unloaded'); return { ok: true, note: notes.join('\n'), status: await status() }; }
  return { ok: false, note: `unknown action ${action}` };
}

/* ---- way 1: Tailscale (and this PC itself) ---- */
const onTailnet = a => { a = String(a || '').replace(/^::ffff:/, ''); if (a === '127.0.0.1' || a === '::1') return true; if (a.toLowerCase().startsWith('fd7a:115c:a1e0:')) return true; const m = a.match(/^100\.(\d+)\./); return !!m && +m[1] >= 64 && +m[1] <= 127; };
const srv = http.createServer(async (req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (!onTailnet(req.socket.remoteAddress)) return send(403, { error: 'only answered on the tailnet' });
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'PC key refused' });
  const action = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1)) || 'status';
  send(200, await act(action).catch(e => ({ ok: false, note: String(e.message || e) })));
});
const listen = n => srv.listen(PORT, () => console.log(`Brenebase agent on :${PORT} (tailnet only), polling ${HUB}`)).once('error', e => { if (e.code === 'EADDRINUSE' && n < 10) setTimeout(() => listen(n + 1), 2000); });
listen(0);

/* keeps itself current: every 10 minutes it compares its files with Brenebase's and downloads any that changed.
   A new worker is restarted; a new agent starts a fresh copy of itself and this one exits. AGENT_UPDATE=off turns it off. */
const FILES = { 'pc/brenebase-agent.mjs': 'pc/brenebase-agent.mjs', 'worker/hub-worker.mjs': 'worker/hub-worker.mjs', 'worker/blender_ops.py': 'worker/blender_ops.py', 'worker/render-brenai.cjs': 'worker/render-brenai.cjs', 'parts.mjs': 'parts.mjs' };
async function selfUpdate() {
  if (process.env.AGENT_UPDATE === 'off') return;
  try {
    const want = await (await fetch(`${HUB}/pc-files/manifest.json`, { signal: AbortSignal.timeout(10000) })).json(); const changed = [];
    for (const [k, rel] of Object.entries(FILES)) {
      if (!want[k]) continue; const local = path.join(BASE, rel);
      const have = fs.existsSync(local) ? crypto.createHash('sha1').update(fs.readFileSync(local)).digest('hex') : '';
      if (have === want[k]) continue;
      const body = Buffer.from(await (await fetch(`${HUB}/pc-files/${k}`, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
      if (crypto.createHash('sha1').update(body).digest('hex') !== want[k]) continue;
      fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, body); changed.push(k);
    }
    if (!changed.length) return;
    console.log('updated:', changed.join(', '));
    if (changed.some(k => k.startsWith('worker/') || k === 'parts.mjs')) { stopHelper('worker'); setTimeout(() => console.log(startHelper('worker')), 1500); }
    if (changed.includes('pc/brenebase-agent.mjs')) { stopHelper('worker'); spawn(process.execPath, [path.join(BASE, 'pc', 'brenebase-agent.mjs')], { cwd: path.join(BASE, 'pc'), detached: true, stdio: 'ignore', windowsHide: true }).unref(); setTimeout(() => process.exit(0), 500); }
  } catch { /* try again next time */ }
}
setTimeout(selfUpdate, 5000); setInterval(selfUpdate, 10 * 60000);

/* the worker starts with the agent (at login), so jobs run without anyone tapping Start. AGENT_AUTOSTART=off turns it off. */
if (process.env.AGENT_AUTOSTART !== 'off') console.log(startHelper('worker'));

/* ---- way 2: polling Brenebase ---- */
const H = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
let beat = 0, refused = false;
for (;;) {
  try {
    /* every poll carries a fresh status now and then, so the PC tab is right even without Tailscale */
    const st = beat++ % 2 === 0 ? await status() : null;   /* about every 10 s */
    const r = await fetch(`${HUB}/api/agent/next`, { method: 'POST', headers: H, body: JSON.stringify({ status: st }) });
    /* a wrong key: say so once, then check back every 5 minutes instead of repeating it */
    if (r.status === 401) { if (!refused) console.log('PC key refused by Brenebase: the HUB_WORKER_TOKEN on this PC does not match the BRENEBASE_PC_KEY secret. Checking again every 5 minutes.'); refused = true; await new Promise(s => setTimeout(s, 300000)); continue; }
    refused = false;
    const { cmd } = await r.json();
    if (cmd) { console.log(`doing ${cmd.action}`); const out = await act(cmd.action).catch(e => ({ ok: false, note: String(e.message || e) })); await fetch(`${HUB}/api/agent/done`, { method: 'POST', headers: H, body: JSON.stringify({ id: cmd.id, ...out }) }); }
    else await new Promise(s => setTimeout(s, 5000));
  } catch { await new Promise(s => setTimeout(s, 15000)); }
}
