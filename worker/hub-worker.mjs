/* The hub worker: runs on Andrew's PC, connects OUT to the hub (the hub cannot reach the PC), picks up jobs and sends results back.
   Same idea as brenai/bridge/wizra-bridge.mjs, made generic: each capability is turned on only if its tool is found.

   Capabilities
     pc-model     Bionic / LM Studio server on port 1234 (OpenAI-style /v1/chat/completions), the model the Wizra bridge uses
     claude-code  the `claude` command (Claude Code). Runs `claude -p` in the repo folder on a new branch
     blender      Blender, run headless with blender_ops.py
     pc-run       named scripts in PC_SCRIPTS below (render checker, clip converter)

   Env (setx on Windows)
     HUB_URL           https://<your hub>.fly.dev
     HUB_WORKER_TOKEN  same value as the hub's secret
     BIONIC_URL        default http://127.0.0.1:1234
     BLENDER           path to blender.exe (default: "blender" on PATH)
     REPOS             folder that holds your repo checkouts (default: %USERPROFILE%\repos)
     READ_ROOTS        folders project notes may be read from, ; separated (default G:\My Drive;F:\Projects;the WoW AddOns folder)
   Run: node hub-worker.mjs */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { checkFile, SLOT_TYPES } from '../parts.mjs';

const HUB = (process.env.HUB_URL || 'http://localhost:8080').replace(/\/$/, '');
const TOKEN = (process.env.HUB_WORKER_TOKEN || '').trim();
const BIONIC = process.env.BIONIC_URL || 'http://127.0.0.1:1234';
const BLENDER = process.env.BLENDER || 'blender';
const REPOS = process.env.REPOS || path.join(os.homedir(), 'repos');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (!TOKEN) { console.log('Set HUB_WORKER_TOKEN first.'); process.exit(1); }

/* named scripts the hub may ask for. Nothing outside this list runs. */
const PC_SCRIPTS = {
  'make3d:check': j => [process.execPath, [path.join(REPOS, 'Brenelandtest/pipeline/jstest/piece.mjs'), j.args.piece || '']],
  'motion:library': j => [process.execPath, [path.join(REPOS, 'Brenelandtest/brenai/tools/clipconv.mjs'), j.args.in || path.join(REPOS, 'clips-in'), j.args.out || path.join(REPOS, 'clips-out')]],
  'ship:test': j => ['npx', ['serve', path.join(REPOS, j.args.site || 'Brenelandtest/site')]],
};

/* async with a time limit: a slow or stuck `claude --version` must never freeze the worker */
const found = cmd => new Promise(ok => { let p; try { p = spawn(cmd, ['--version'], { shell: true, stdio: 'ignore', windowsHide: true }); } catch { return ok(false); } const t = setTimeout(() => { try { p.kill(); } catch { } ok(false); }, 15000); p.on('error', () => { clearTimeout(t); ok(false); }); p.on('exit', c => { clearTimeout(t); ok(c === 0); }); });
async function bionicUp() { try { return (await fetch(`${BIONIC}/v1/models`, { signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } }
const can = [];
console.log('worker starting: checking the PC model, Claude Code, Blender, git (each has a time limit)');
if (await bionicUp()) can.push('pc-model');
/* Claude Code: on the PATH, or where its Windows installer puts it (%USERPROFILE%\.local\bin), or CLAUDE */
const CLAUDE = process.env.CLAUDE || [path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')].find(f => fs.existsSync(f)) || 'claude';
if (await found(`"${CLAUDE}"`)) can.push('claude-code');
if (await found(`"${BLENDER}"`)) can.push('blender');
can.push('pc-run');
if (await found('git')) can.push('merge');
/* the voice pack: Kokoro, the same model and voices as Wizra's bridge. Uses the copy start-wizra.ps1 already installed in
   %USERPROFILE%\Brenai (or one in the Brenebase folder), so nothing new downloads. Loaded on the first job. */
const KOKORO_HOMES = [path.join(HERE, '..'), process.env.WIZRA_DIR || path.join(os.homedir(), 'Brenai')];
let kokoroPath = null;
for (const d of KOKORO_HOMES) { try { kokoroPath = createRequire(path.join(d, 'package.json')).resolve('kokoro-js'); break; } catch { /* not here */ } }
if (kokoroPath) can.push('tts');
let tts = null;
async function voice() {
  if (!tts) { const { KokoroTTS } = await import(pathToFileURL(kokoroPath).href); tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: process.env.WIZRA_VOICE_QUALITY || 'q8', device: 'cpu' }); }
  return tts;
}
/* plain 16-bit WAV, the same as the bridge: every phone browser plays it */
function wav16(f32, rate) {
  const b = Buffer.alloc(44 + f32.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  return b;
}
/* project notes on this PC: only files inside these folders can be read (Google Drive for desktop, project folders) */
const READ_ROOTS = (process.env.READ_ROOTS || 'G:\\My Drive;F:\\Projects;C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Interface\\AddOns').split(';').map(r => path.resolve(r.trim())).filter(Boolean);
can.push('read', 'readdir', 'probe', 'studio', 'studio-image');
console.log(`hub worker: ${HUB}\ncan do: ${can.join(', ')}`);
/* things can come up after the worker (LM Studio's server, Claude Code, the voice pack): look again every minute */
setInterval(async () => {
  const has = k => can.includes(k), set = (k, on) => { if (on && !has(k)) { can.push(k); console.log('now can do', k); } if (!on && has(k)) can.splice(can.indexOf(k), 1); };
  set('pc-model', await bionicUp());
  set('claude-code', await found(`"${CLAUDE}"`));
  if (!kokoroPath) for (const d of KOKORO_HOMES) { try { kokoroPath = createRequire(path.join(d, 'package.json')).resolve('kokoro-js'); break; } catch { } }
  set('tts', !!kokoroPath);
}, 60000);

const run = (cmd, args, cwd, input, onOut) => new Promise(ok => {
  const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' || !args.length });
  let out = '', err = ''; p.stdout.on('data', d => { out += d; if (onOut) onOut(String(d)); }); p.stderr.on('data', d => { err += d; if (onOut) onOut(String(d)); });
  p.on('error', e => ok({ code: -1, out, err: String(e.message) }));
  if (input) { p.stdin.write(input); p.stdin.end(); }
  p.on('close', code => ok({ code, out: out.slice(-20000), err: err.slice(-4000) }));
});

/* tell Brenebase what step a job is on, with the last lines of output, at most every 4 seconds */
async function progress(j, step, text, force) {
  j._tail ||= []; j._last ||= 0;
  if (text) j._tail = j._tail.concat(String(text).split(/\r?\n/).filter(Boolean)).slice(-40);
  if (!force && Date.now() - j._last < 4000) return; j._last = Date.now();
  try { await fetch(`${HUB}/api/worker/progress`, { method: 'POST', headers: H, body: JSON.stringify({ id: j.id, step, log: j._tail.join('\n') }), signal: AbortSignal.timeout(15000) }); } catch { /* the result still goes back at the end */ }
}
async function doJob(j) { await progress(j, 'started on the PC', '', true);
  if (j.backend === 'pc-model') {
    const r = await fetch(`${BIONIC}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: j.system || '' }, ...(j.messages && j.messages.length ? j.messages : [{ role: 'user', content: j.text }])], temperature: 0.8, max_tokens: j.maxTokens || 800 }), signal: AbortSignal.timeout(300000) });
    const d = await r.json(); return { ok: r.ok, text: d.choices?.[0]?.message?.content || '', error: r.ok ? undefined : JSON.stringify(d).slice(0, 300) };
  }
  if (j.backend === 'claude-code') {
    const repo = path.join(REPOS, (j.repo || 'brenemanandrew/Brenelandtest').split('/').pop());
    /* the repo is not on this PC yet: clone it into REPOS (uses the PC's own git sign-in for private repos) */
    if (!fs.existsSync(repo)) {
      await progress(j, `cloning ${j.repo || 'brenemanandrew/Brenelandtest'} into ${REPOS}`, '', true); fs.mkdirSync(REPOS, { recursive: true });
      const c = await run('git', ['clone', `https://github.com/${j.repo || 'brenemanandrew/Brenelandtest'}.git`, repo], REPOS, null, t => progress(j, 'cloning', t));
      if (c.code || !fs.existsSync(repo)) return { ok: false, error: `Could not clone ${j.repo} into ${repo}: ${(c.err || c.out).slice(-300)}` };
    }
    const branch = j.parent ? `hub/${j.parent}` : `hub/${j.id}`;
    await progress(j, `switching to branch ${branch}`, '', true);
    await run('git', ['checkout', '-B', branch], repo);
    await progress(j, 'Claude Code is working', '', true);
    const r = await run(CLAUDE, ['-p', '--output-format', 'text'], repo, j.prompt, t => progress(j, 'Claude Code is working', t));
    await progress(j, 'committing on the branch', '', true);
    await run('git', ['add', '-A'], repo); await run('git', ['commit', '-m', `hub: ${j.label}`], repo);
    const diff = await run('git', ['diff', '--stat', 'HEAD~1'], repo);
    let merge = null; try { merge = JSON.parse(fs.readFileSync(path.join(repo, 'hub-merge.json'), 'utf8')); } catch { /* not written; the hub also looks in the reply */ }
    return { ok: r.code === 0, text: r.out, result: { branch, diff: diff.out, merge }, error: r.code ? r.err : undefined };
  }
  if (j.backend === 'blender') {
    const r = await run(BLENDER, ['-b', '--python', path.join(HERE, 'blender_ops.py'), '--', JSON.stringify({ mode: j.mode, ...j.args })], REPOS);
    const line = r.out.split('\n').reverse().find(l => l.startsWith('HUB_RESULT '));
    return { ok: r.code === 0 && !!line, text: line ? line.slice(11) : r.err || r.out.slice(-2000), error: r.code ? r.err : undefined };
  }
  if (j.backend === 'pc-run' && j.tool === 'image' && j.mode === 'model') {
    const dir = path.join(os.tmpdir(), 'brenebase-render-' + j.id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'specs.json'), JSON.stringify(j.args.specs || []));
    const r = await run(process.execPath, [path.join(HERE, 'render-brenai.cjs'), path.join(dir, 'specs.json'), path.join(dir, 'out')], path.join(HERE, '..'));
    const files = fs.existsSync(path.join(dir, 'out')) ? fs.readdirSync(path.join(dir, 'out')) : [];
    const images = files.map(f => ({ name: f, data: fs.readFileSync(path.join(dir, 'out', f)).toString('base64') }));
    return { ok: images.length > 0, text: r.out.slice(-1500), result: { images64: images }, error: images.length ? undefined : (r.out + r.err).slice(-800) };
  }
  if (j.backend === 'pc-run') {
    const f = PC_SCRIPTS[`${j.tool}:${j.mode}`]; if (!f) return { ok: false, error: `No PC script for ${j.tool}:${j.mode}` };
    const [cmd, args] = f(j); const r = await run(cmd, args, REPOS);
    return { ok: r.code === 0, text: r.out || r.err, error: r.code ? r.err : undefined };
  }
  if (j.backend === 'tts') {
    const t = await voice(); const v = t.voices[j.voice] ? j.voice : 'af_heart', speed = Math.max(0.6, Math.min(1.6, Number(j.speed) || 1));
    /* long answers are spoken a few sentences at a time and joined */
    const chunks = String(j.text).match(/[^.!?\n]+[.!?]*\s*/g) || [String(j.text)], parts = []; let cur = '';
    for (const c of chunks) { if ((cur + c).length > 600 && cur) { parts.push(cur); cur = ''; } cur += c; } if (cur.trim()) parts.push(cur);
    let rate = 24000; const pieces = [];
    for (const p of parts.slice(0, 12)) { const a = await t.generate(p.trim(), { voice: v, speed }); rate = a.sampling_rate; pieces.push(a.audio); }
    const all = new Float32Array(pieces.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of pieces) { all.set(a, o); o += a.length; }
    return { ok: true, text: `spoken with ${v}`, result: { audio64: wav16(all, rate).toString('base64') } };
  }
  /* find Brenai Studio on this PC and list how its page talks to its server, so Brenebase can be wired to it */
  if (j.backend === 'probe') {
    const ports = [...new Set([+(process.env.STUDIO_PORT || 0), 7860, 7861, 7862, 8188, 8000, 8001, 8080, 8081, 8090, 8765, 8888, 3000, 3001, 5000, 5001, 5173, 4000, 9000].filter(Boolean))];
    const found = [];
    for (const port of ports) {
      for (const host of ['127.0.0.1']) {
        const base = `http://${host}:${port}`; let html = '';
        try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(1500) }); html = await r.text(); } catch { continue; }
        const title = (html.match(/<title>([^<]*)/i) || [])[1] || '';
        const hit = { url: base, title: title.trim().slice(0, 80), studio: /brenai studio|illustrious|z-image|minimax/i.test(html), apis: [], scripts: [] };
        /* the page and its own scripts: every '/api/...' or '/prompt'-style path and form field they mention */
        const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).filter(u => !/^https?:\/\//.test(u)).slice(0, 8);
        let code = html;
        for (const sp of srcs) { try { code += '\n' + await (await fetch(new URL(sp, base + '/'), { signal: AbortSignal.timeout(3000) })).text(); hit.scripts.push(sp); } catch { } }
        hit.apis = [...new Set([...code.matchAll(/["'`](\/(?:api|sdapi|prompt|queue|history|view|upload|generate|run|txt2img|img2img|object_info|system_stats)[\w\/.-]*)/g)].map(m => m[1]))].slice(0, 60);
        hit.fields = [...new Set([...code.matchAll(/\b(prompt|negative(?:_prompt)?|aspect(?:_ratio)?|width|height|steps|seed|count|batch(?:_size)?|model|ckpt|reference|image|cfg(?:_scale)?|sampler|lora)\s*:/gi)].map(m => m[1]))].slice(0, 30);
        found.push(hit);
      }
    }
    /* for the Studio page: its published API list if it has one, and the code around each /api/ call */
    for (const f of found.filter(x => x.studio)) {
      for (const doc of ['/openapi.json', '/api/openapi.json', '/docs/openapi.json']) {
        try { const r = await fetch(f.url + doc, { signal: AbortSignal.timeout(2500) }); if (r.ok) { const o = await r.json(); f.openapi = Object.entries(o.paths || {}).map(([pth, ops]) => Object.entries(ops).map(([m, op]) => `${m.toUpperCase()} ${pth}${op.requestBody ? ' (body)' : ''}${op.summary ? ' : ' + op.summary : ''}`).join('; ')).slice(0, 80); break; } } catch { }
      }
      let code = ''; for (const sp of f.scripts) { try { code += '\n' + await (await fetch(new URL(sp, f.url + '/'), { signal: AbortSignal.timeout(3000) })).text(); } catch { } }
      f.calls = [...code.matchAll(/(?:fetch|axios\.\w+|post|get|api)\s*\(([^;]{0,220})/gi)].map(m => m[1].replace(/\s+/g, ' ')).filter(x => /api/i.test(x)).slice(0, 40);
      /* every call through the page's api(path, body) helper: the path, and the keys of what it sends */
      f.apiCalls = [...new Set([...code.matchAll(/\bapi\(\s*([`'"])([^`'"]{1,80})\1\s*(?:,\s*(\{[^;]{0,400}))?/g)].map(m => `${m[2]}${m[3] ? ' <- ' + [...new Set([...m[3].matchAll(/([A-Za-z_][\w]*)\s*:/g)].map(k => k[1]))].slice(0, 14).join(', ') : ''}`))].slice(0, 60);
      f.apiStrings = [...new Set([...code.matchAll(/['"`]\/api\/['"`]\s*\+\s*['"`]?([\w\/${}.-]+)|\/api\/([\w\/${}.-]+)/g)].map(m => '/api/' + (m[1] || m[2])))].slice(0, 60);
    }
    const studio = found.filter(f => f.studio);
    return { ok: true, text: (studio.length ? 'Found Brenai Studio:\n' : 'Brenai Studio not found on the usual ports. Open it and tell Brenebase its address (STUDIO_PORT).\n') + JSON.stringify(studio.length ? studio : found, null, 1), result: { probe: found } };
  }
  /* requests to Brenai Studio on this PC only (STUDIO_URL, default http://127.0.0.1:7860) */
  if (j.backend === 'studio') {
    const base = (process.env.STUDIO_URL || 'http://127.0.0.1:7860').replace(/\/$/, '');
    const calls = j.calls || [{ method: 'GET', path: '/openapi.json' }], out = [];
    for (const c of calls.slice(0, 10)) {
      if (!/^\/[\w\/.?=&%-]*$/.test(c.path || '')) { out.push({ path: c.path, error: 'bad path' }); continue; }
      try {
        const r = await fetch(base + c.path, { method: c.method || 'GET', headers: { 'x-studio': '1', ...(c.body ? { 'content-type': 'application/json' } : {}) }, body: c.body ? JSON.stringify(c.body) : undefined, signal: AbortSignal.timeout(c.wait || 15000) }); const t = await r.text();
        /* grep: only the code around each match (to read how the page builds a request) */
        if (c.grep) { const hits = []; let i = -1; while ((i = t.indexOf(c.grep, i + 1)) >= 0 && hits.length < 4) hits.push(t.slice(Math.max(0, i - (c.before || 900)), i + (c.after || 300))); out.push({ path: c.path, grep: c.grep, status: r.status, hits }); }
        else out.push({ path: c.path, status: r.status, body: t.slice(0, c.max || 2500) });
      }
      catch (e) { out.push({ path: c.path, error: String(e.message || e) }); }
    }
    return { ok: true, text: JSON.stringify(out, null, 1), result: { studio: out } };
  }
  /* a picture made by Brenai Studio's own models: queue it there, follow its job list, fetch the files */
  if (j.backend === 'studio-image') {
    const base = (process.env.STUDIO_URL || 'http://127.0.0.1:7860').replace(/\/$/, ''), H2 = { 'x-studio': '1', 'content-type': 'application/json' };
    const call = async (pth, body) => { const r = await fetch(base + '/api/' + pth, { method: body ? 'POST' : 'GET', headers: H2, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } if (!r.ok) throw new Error(`Studio ${pth} ${r.status}: ${String(t).slice(0, 200)}`); return d; };
    let before = []; try { before = (await call('jobs')).map(x => String(x.id)); } catch (e) { return { ok: false, error: `Brenai Studio is not answering at ${base}. Open it, then Retry. (${e.message})` }; }
    await progress(j, `queuing in Brenai Studio (${j.studioBody.engine || j.studioBody.model || 'image'})`, '', true);
    const res = await call('image', j.studioBody);
    let id = res && (res.id || res.jobId || (res.job && res.job.id)); id = id != null ? String(id) : null;
    const t0 = Date.now();
    while (Date.now() - t0 < (j.maxMinutes || 20) * 60000) {
      await new Promise(r => setTimeout(r, 3000));
      let list = []; try { list = await call('jobs'); } catch { continue; }
      const job = list.find(x => id ? String(x.id) === id : !before.includes(String(x.id)) && x.kind === 'image');
      if (!job) continue; id = String(job.id);
      await progress(j, `Brenai Studio: ${job.note || job.status}`, (job.log || []).slice(-1)[0] || '');
      if (job.status === 'failed' || job.status === 'error') return { ok: false, error: `Brenai Studio could not make it: ${job.note || job.error || 'no reason given'}` };
      if (job.status === 'done') {
        const images = [];
        for (const f of (job.files || []).slice(0, 8)) { try { const b = Buffer.from(await (await fetch(base + f, { signal: AbortSignal.timeout(60000) })).arrayBuffer()); images.push({ name: path.basename(f), data: b.toString('base64') }); } catch { } }
        return { ok: images.length > 0, text: `${images.length} picture(s) from Brenai Studio (${job.note || 'done'}). Saved on the PC in Studio's outputs folder too.`, result: { images64: images }, error: images.length ? undefined : 'Studio finished but the files could not be fetched' };
      }
    }
    return { ok: false, error: 'Brenai Studio took more than 20 minutes; the picture may still finish in Studio itself.' };
  }
  if (j.backend === 'merge') return merge(j);
  if (j.backend === 'readdir') {
    const d = path.resolve(j.dir);
    if (!READ_ROOTS.some(r => d.toLowerCase().startsWith(r.toLowerCase()))) return { ok: false, error: `${d} is outside READ_ROOTS` };
    if (!fs.existsSync(d)) return { ok: true, result: { files: [] }, text: 'folder not there yet' };
    const files = fs.readdirSync(d).filter(n => n.endsWith('.md')).map(n => ({ name: n, mtime: fs.statSync(path.join(d, n)).mtimeMs })).sort((a, b) => b.mtime - a.mtime).slice(0, 50).map(f => ({ ...f, text: fs.readFileSync(path.join(d, f.name), 'utf8').slice(0, 50000) }));
    return { ok: true, result: { files } };
  }
  if (j.backend === 'read') {
    let f = path.resolve(j.readPath || j.source.path);
    if (!READ_ROOTS.some(r => f.toLowerCase().startsWith(r.toLowerCase() + path.sep) || f.toLowerCase() === r.toLowerCase()) && !/\\interface\\addons\\/i.test(f)) return { ok: false, error: `${f} is outside READ_ROOTS` };
    /* not where the card says: look for the same file name in the allowed folders and report where it really is */
    if (!fs.existsSync(f)) { const found = findFile(path.basename(f), [path.dirname(f), ...READ_ROOTS, ...wowRoots(f)]); if (!found) return { ok: false, error: `Not found on this PC: ${path.basename(f)} (looked under ${READ_ROOTS.join(', ')})` }; f = found; }
    return { ok: true, text: fs.readFileSync(f, 'utf8').slice(0, 400000), result: { foundAt: f } };
  }
  return { ok: false, error: `This PC cannot do ${j.backend}` };
}

/* Merge: put each filled slot where the code's manifest says, check it, run the build test, commit on the branch. */
async function merge(j) {
  const repo = path.join(REPOS, (j.repo || 'brenemanandrew/Brenelandtest').split('/').pop());
  if (!fs.existsSync(repo)) return { ok: false, error: `No checkout at ${repo}: run the code part first (it clones the repo)` };
  const co = await run('git', ['checkout', j.branch], repo); if (co.code) return { ok: false, error: `Could not switch to ${j.branch}: ${co.err}` };
  const where = Object.fromEntries(((j.manifest && j.manifest.slots) || []).map(x => [x.id, x.path]));
  const report = [];
  for (const sl of j.slots) {
    if (!sl.fill) { report.push(`${sl.id}: EMPTY, skipped`); continue; }
    const T = SLOT_TYPES[sl.type], many = T.many;
    let dest = path.join(repo, where[sl.id] || sl.path);
    let buf;
    if (sl.fill.source === 'text') buf = Buffer.from(sl.fill.value);
    else if (sl.fill.source === 'pcpath') buf = fs.readFileSync(sl.fill.value);
    else { const r = await fetch(sl.fill.value); if (!r.ok) { report.push(`${sl.id}: download failed (${r.status})`); continue; } buf = Buffer.from(await r.arrayBuffer()); }
    if (many) { fs.mkdirSync(dest, { recursive: true }); dest = path.join(dest, `${sl.id}_1.${T.ext}`); }
    const bad = checkFile(sl.type, buf);
    if (bad) { report.push(`${sl.id}: REJECTED, ${bad}`); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
    report.push(`${sl.id}: ok -> ${path.relative(repo, dest)} (${Math.round(buf.length / 1024)} KB, from ${sl.fill.from || sl.fill.source})`);
  }
  const runCfg = (j.manifest && j.manifest.run) || {};
  let tested = 'no test command in the manifest';
  if (runCfg.install) await run(runCfg.install, [], repo);
  if (runCfg.test) { const t = await run(runCfg.test, [], repo); tested = t.code === 0 ? `test passed: ${runCfg.test}` : `TEST FAILED: ${runCfg.test}\n${(t.err || t.out).slice(-1500)}`; }
  await run('git', ['add', '-A'], repo); await run('git', ['commit', '-m', 'hub: merge art and story into the code'], repo);
  const rejected = report.filter(l => /REJECTED|EMPTY|failed/.test(l)).length;
  const look = (j.manifest && j.manifest.look_at) || [];
  return { ok: !rejected && !/FAILED/.test(tested), text: [...report, '', tested, look.length ? `\nLook at:\n- ${look.join('\n- ')}` : '', runCfg.start ? `\nRun it: ${runCfg.start}` : ''].join('\n'), result: { branch: j.branch } };
}

/* look for a file by name, a few folders deep, without walking forever */
function findFile(name, roots, depth = 6) {
  const want = name.toLowerCase(); let seen = 0;
  const walk = (d, n) => {
    if (n < 0 || seen > 60000) return null; let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
    seen += ents.length;
    for (const e of ents) if (e.isFile() && e.name.toLowerCase() === want) return path.join(d, e.name);
    for (const e of ents) if (e.isDirectory() && !/^(node_modules|\.git|\$recycle\.bin|cache|logs|wtf|screenshots)$/i.test(e.name)) { const r = walk(path.join(d, e.name), n - 1); if (r) return r; }
    return null;
  };
  for (const r of [...new Set(roots)]) if (fs.existsSync(r)) { const hit = walk(r, depth); if (hit) return hit; }
  return null;
}
/* an addon file: also try the usual World of Warcraft installs and game versions */
function wowRoots(f) {
  if (!/addons/i.test(f)) return [];
  const bases = ['C:\\Program Files (x86)\\World of Warcraft', 'C:\\Program Files\\World of Warcraft', 'D:\\World of Warcraft', 'D:\\Games\\World of Warcraft', 'E:\\World of Warcraft', 'F:\\World of Warcraft', 'C:\\Games\\World of Warcraft'];
  return bases.flatMap(b => ['_retail_', '_classic_', '_classic_era_', '_ptr_'].map(v => path.join(b, v, 'Interface', 'AddOns')));
}

const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
let refused = false;
/* jobs run side by side so a long one (a Studio picture, Claude Code) never blocks the companion's replies.
   Jobs that touch a repo or Blender run one at a time. A heartbeat tells Brenebase the worker is alive while it works. */
const HEAVY = ['claude-code', 'merge', 'blender', 'pc-run'];
const busy = new Map();
const MAX = +process.env.WORKER_JOBS || 4;
setInterval(() => { fetch(`${HUB}/api/worker/progress`, { method: 'POST', headers: H, body: JSON.stringify({ busy: [...busy.values()].map(j => j.label) }), signal: AbortSignal.timeout(15000) }).catch(() => { }); }, 10000);
async function finish(job) {
  console.log(`job ${job.id}: ${job.label}`);
  const out = await doJob(job).catch(e => ({ ok: false, error: String(e.message || e) }));
  for (let n = 0; n < 5; n++) { try { await fetch(`${HUB}/api/worker/done`, { method: 'POST', headers: H, body: JSON.stringify({ id: job.id, ...out }), signal: AbortSignal.timeout(120000) }); break; } catch { await new Promise(s => setTimeout(s, 5000)); } }
  console.log(`  ${job.id} ${out.ok ? 'done' : 'failed: ' + String(out.error || '').slice(0, 200)}`);
  busy.delete(job.id);
}
for (;;) {
  try {
    if (busy.size >= MAX) { await new Promise(s => setTimeout(s, 2000)); continue; }
    const heavyBusy = [...busy.values()].some(j => HEAVY.includes(j.backend));
    const offer = can.filter(k => !(heavyBusy && HEAVY.includes(k)));
    const r = await fetch(`${HUB}/api/worker/next?can=${offer.join(',')}&has=${can.join(',')}`, { headers: H, signal: AbortSignal.timeout(20000) });
    if (r.status === 401) { if (!refused) console.log('PC key refused: HUB_WORKER_TOKEN on this PC does not match BRENEBASE_PC_KEY. Checking again every 5 minutes.'); refused = true; await new Promise(s => setTimeout(s, 300000)); continue; }
    refused = false;
    const { job } = await r.json();
    if (job) { busy.set(job.id, job); finish(job); }
    else await new Promise(s => setTimeout(s, 3000));
  } catch (e) { console.log('hub not reachable, retrying'); await new Promise(s => setTimeout(s, 10000)); }
}
