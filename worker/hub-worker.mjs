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
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { checkFile, SLOT_TYPES } from '../parts.mjs';

const HUB = (process.env.HUB_URL || 'http://localhost:8080').replace(/\/$/, '');
const TOKEN = process.env.HUB_WORKER_TOKEN || '';
const BIONIC = process.env.BIONIC_URL || 'http://127.0.0.1:1234';
const BLENDER = process.env.BLENDER || 'blender';
const REPOS = process.env.REPOS || path.join(os.homedir(), 'repos');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (!TOKEN) { console.log('Set HUB_WORKER_TOKEN first.'); process.exit(1); }

/* named scripts the hub may ask for. Nothing outside this list runs. */
const PC_SCRIPTS = {
  'make3d:check': j => ['node', [path.join(REPOS, 'Brenelandtest/pipeline/jstest/piece.mjs'), j.args.piece || '']],
  'motion:library': j => ['node', [path.join(REPOS, 'Brenelandtest/brenai/tools/clipconv.mjs'), j.args.in || path.join(REPOS, 'clips-in'), j.args.out || path.join(REPOS, 'clips-out')]],
  'ship:test': j => ['npx', ['serve', path.join(REPOS, j.args.site || 'Brenelandtest/site')]],
};

const found = cmd => spawnSync(cmd, ['--version'], { shell: true, stdio: 'ignore' }).status === 0;
async function bionicUp() { try { return (await fetch(`${BIONIC}/v1/models`)).ok; } catch { return false; } }
const can = [];
if (await bionicUp()) can.push('pc-model');
if (found('claude')) can.push('claude-code');
if (found(`"${BLENDER}"`)) can.push('blender');
can.push('pc-run');
if (found('git')) can.push('merge');
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
can.push('read', 'readdir');
console.log(`hub worker: ${HUB}\ncan do: ${can.join(', ')}`);

const run = (cmd, args, cwd, input) => new Promise(ok => {
  const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' || !args.length });
  let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  if (input) { p.stdin.write(input); p.stdin.end(); }
  p.on('close', code => ok({ code, out: out.slice(-20000), err: err.slice(-4000) }));
});

async function doJob(j) {
  if (j.backend === 'pc-model') {
    const r = await fetch(`${BIONIC}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: j.system || '' }, ...(j.messages && j.messages.length ? j.messages : [{ role: 'user', content: j.text }])], temperature: 0.8, max_tokens: j.maxTokens || 800 }) });
    const d = await r.json(); return { ok: r.ok, text: d.choices?.[0]?.message?.content || '', error: r.ok ? undefined : JSON.stringify(d).slice(0, 300) };
  }
  if (j.backend === 'claude-code') {
    const repo = path.join(REPOS, (j.repo || 'brenemanandrew/Brenelandtest').split('/').pop());
    if (!fs.existsSync(repo)) return { ok: false, error: `No checkout at ${repo}. Clone it there or set REPOS.` };
    const branch = j.parent ? `hub/${j.parent}` : `hub/${j.id}`;
    await run('git', ['checkout', '-B', branch], repo);
    const r = await run('claude', ['-p', '--output-format', 'text'], repo, j.prompt);
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
    const r = await run('node', [path.join(HERE, 'render-brenai.cjs'), path.join(dir, 'specs.json'), path.join(dir, 'out')], path.join(HERE, '..'));
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
  if (j.backend === 'merge') return merge(j);
  if (j.backend === 'readdir') {
    const d = path.resolve(j.dir);
    if (!READ_ROOTS.some(r => d.toLowerCase().startsWith(r.toLowerCase()))) return { ok: false, error: `${d} is outside READ_ROOTS` };
    if (!fs.existsSync(d)) return { ok: true, result: { files: [] }, text: 'folder not there yet' };
    const files = fs.readdirSync(d).filter(n => n.endsWith('.md')).map(n => ({ name: n, mtime: fs.statSync(path.join(d, n)).mtimeMs })).sort((a, b) => b.mtime - a.mtime).slice(0, 50).map(f => ({ ...f, text: fs.readFileSync(path.join(d, f.name), 'utf8').slice(0, 50000) }));
    return { ok: true, result: { files } };
  }
  if (j.backend === 'read') {
    const f = path.resolve(j.source.path);
    if (!READ_ROOTS.some(r => f.toLowerCase().startsWith(r.toLowerCase() + path.sep) || f.toLowerCase() === r.toLowerCase())) return { ok: false, error: `${f} is outside READ_ROOTS` };
    if (!fs.existsSync(f)) return { ok: false, error: `Not found on this PC: ${f}` };
    return { ok: true, text: fs.readFileSync(f, 'utf8').slice(0, 400000) };
  }
  return { ok: false, error: `This PC cannot do ${j.backend}` };
}

/* Merge: put each filled slot where the code's manifest says, check it, run the build test, commit on the branch. */
async function merge(j) {
  const repo = path.join(REPOS, (j.repo || 'brenemanandrew/Brenelandtest').split('/').pop());
  if (!fs.existsSync(repo)) return { ok: false, error: `No checkout at ${repo}` };
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

const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
for (;;) {
  try {
    const r = await fetch(`${HUB}/api/worker/next?can=${can.join(',')}`, { headers: H });
    if (r.status === 401) { console.log('Token refused: the PC and hub secrets do not match.'); await new Promise(s => setTimeout(s, 30000)); continue; }
    const { job } = await r.json();
    if (job) {
      console.log(`job ${job.id}: ${job.label}`);
      const out = await doJob(job).catch(e => ({ ok: false, error: String(e.message || e) }));
      await fetch(`${HUB}/api/worker/done`, { method: 'POST', headers: H, body: JSON.stringify({ id: job.id, ...out }) });
      console.log(`  ${out.ok ? 'done' : 'failed'}`);
    } else await new Promise(s => setTimeout(s, 4000));
  } catch (e) { console.log('hub not reachable, retrying'); await new Promise(s => setTimeout(s, 10000)); }
}
