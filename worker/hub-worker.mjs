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
  /* scripts from a repo run from the worker's own copy of its latest main (see toolsTree), with the packages they need */
  'make3d:check': j => ({ repo: 'Brenelandtest', script: 'pipeline/jstest/piece.mjs', args: [j.args.piece || ''] }),
  'motion:library': j => { const i = j.args.in || path.join(REPOS, 'clips-in'), o = j.args.out || path.join(REPOS, 'clips-out'); return { repo: 'Brenelandtest', script: 'brenai/tools/clipconv.mjs', needs: ['three'], args: [i, o], dirs: [i, o], inDir: i, inExt: /\.fbx$/i, inLabel: 'Mixamo .fbx animation files' }; },
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
can.push('read', 'readdir', 'probe', 'studio', 'studio-image', 'engines', 'sd-image', 'engine-help', 'skills-list', 'push-branch');
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
  /* Windows: an .exe given by full path runs without a shell, so a space in "C:\Program Files" cannot split it; through a shell, anything with a space is quoted */
  const direct = process.platform === 'win32' && path.isAbsolute(cmd) && /\.exe$/i.test(cmd) && args.length;
  const shell = !direct && (process.platform === 'win32' || !args.length);
  const q = a => shell && process.platform === 'win32' && /\s/.test(a) && !/^".*"$/.test(a) ? `"${a}"` : a;
  const p = spawn(q(cmd), args.map(q), { cwd, shell, windowsHide: true });
  let out = '', err = ''; p.stdout.on('data', d => { out += d; if (onOut) onOut(String(d)); }); p.stderr.on('data', d => { err += d; if (onOut) onOut(String(d)); });
  p.on('error', e => ok({ code: -1, out, err: String(e.message) }));
  if (input) { p.stdin.write(input); p.stdin.end(); }
  p.on('close', code => ok({ code, out: out.slice(-20000), err: err.slice(-4000) }));
});

/* tell Brenebase what step a job is on, with the last lines of output, at most every 4 seconds */
async function progress(j, step, text, force) {
  j._tail ||= []; j._last ||= 0;
  if (text) j._tail = j._tail.concat(String(text).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\n/).map(l => l.split('\r').filter(x => x.trim()).pop() || '').filter(x => x.trim())).slice(-40);
  if (!force && Date.now() - j._last < 4000) return; j._last = Date.now();
  try { await fetch(`${HUB}/api/worker/progress`, { method: 'POST', headers: H, body: JSON.stringify({ id: j.id, step, log: j._tail.join('\n') }), signal: AbortSignal.timeout(15000) }); } catch { /* the result still goes back at the end */ }
}
/* where a repo lives on this PC: REPOS, or F:\Projects (where Breneland-Next is), else REPOS for a new clone */
function repoDir(r) { const name = String(r || 'brenemanandrew/Brenelandtest').split('/').pop(); for (const root of [REPOS, ...(process.env.PROJECT_ROOTS || 'F:\\Projects').split(';')]) { const d = path.join(root, name); if (fs.existsSync(path.join(d, '.git'))) return d; } return path.join(REPOS, name); }
/* the worker's own copy of a repo's latest main, only for running its tools: <repo>-wt\_tools, detached, refreshed each run.
   Your own working copy (which may be on another branch, or behind) is never touched. */
async function toolsTree(name, j) {
  let repo = repoDir(name);
  if (!fs.existsSync(path.join(repo, '.git'))) { await progress(j, `cloning ${name}`, '', true); fs.mkdirSync(path.dirname(repo), { recursive: true }); const c = await run('git', ['clone', `https://github.com/brenemanandrew/${name}.git`, repo], path.dirname(repo)); if (c.code) return { error: `Could not clone ${name}: ${(c.err || c.out).slice(-300)}` }; }
  await progress(j, `getting the latest ${name}`, '', true);
  await run('git', ['fetch', 'origin'], repo);
  const head = (await run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repo)).out.trim() || 'origin/main';
  const dir = path.join(`${repo}-wt`, '_tools');
  if (!fs.existsSync(path.join(dir, '.git'))) { fs.mkdirSync(path.dirname(dir), { recursive: true }); const w = await run('git', ['worktree', 'add', '--detach', dir, head], repo); if (w.code || !fs.existsSync(dir)) return { error: `Could not make the tools copy at ${dir}: ${(w.err || w.out).slice(-300)}` }; }
  else { const c = await run('git', ['checkout', '--detach', '-f', head], dir); if (c.code) return { error: `Could not update the tools copy at ${dir}: ${(c.err || c.out).slice(-300)}` }; }
  return { dir };
}
async function worktree(repo, branch, key, j) {
  const dir = path.join(`${repo}-wt`, String(key));
  if (fs.existsSync(path.join(dir, '.git'))) { await progress(j, `reusing worktree ${dir}`, '', true); const b = await run('git', ['rev-parse', 'HEAD'], dir); return { dir, base: b.out.trim() }; }
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const def = (await run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repo)).out.trim() || 'main';
  const from = (await run('git', ['rev-parse', '--verify', def], repo)).code === 0 ? def : 'HEAD';
  await progress(j, `new worktree ${dir} on ${branch} (from ${from})`, '', true);
  const w = await run('git', ['worktree', 'add', '-B', branch, dir, from], repo);
  if (w.code || !fs.existsSync(dir)) return { error: `Could not make a worktree at ${dir}: ${(w.err || w.out).slice(-300)}` };
  const b = await run('git', ['rev-parse', 'HEAD'], dir); return { dir, base: b.out.trim() };
}
/* the skill folders on this PC: every SKILL.md, sent whole so the hub can check them and hand them to jobs */
function readSkills() {
  const dirs = (process.env.SKILL_DIRS || `F:\\Projects\\Breneland-Next\\docs\\skills;${path.join(os.homedir(), '.claude', 'skills')}`).split(';').map(x => x.trim()).filter(Boolean);
  const files = [], errors = [];
  for (const d of dirs) { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (!e.isDirectory()) continue; const f = path.join(d, e.name, 'SKILL.md'); if (fs.existsSync(f)) files.push({ path: f, text: fs.readFileSync(f, 'utf8').slice(0, 80000) }); } } catch (e) { errors.push(`${d}: ${e.code === 'ENOENT' ? 'not found' : e.message}`); } }
  return { files, errors };
}
/* the graphics card is shared: the picture engine needs most of it, LM Studio keeps her chat model (and the picture reader) in it.
   Before pictures the LM Studio models are unloaded; afterwards the chat model comes back. LMS can point at lms.exe. */
const LMS = process.env.LMS || path.join(os.homedir(), '.lmstudio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms');
let gpuSaved = null;
async function lmModels() { try { return (await (await fetch(`${BIONIC}/api/v0/models`, { signal: AbortSignal.timeout(5000) })).json()).data || []; } catch { return []; } }
async function freeGpu(j) {
  if (!fs.existsSync(LMS)) return;
  const loaded = (await lmModels()).filter(m => m.state === 'loaded');
  if (!loaded.length) return;
  gpuSaved = loaded.filter(m => m.type !== 'vlm' && m.type !== 'embeddings').map(m => m.id);
  await progress(j, 'freeing the graphics card (unloading the chat model for now)', '', true);
  await run(LMS, ['unload', '--all']);
}
async function restoreGpu() {
  const want = gpuSaved; gpuSaved = null; if (!want || !want.length || !fs.existsSync(LMS)) return;
  for (const id of want) await run(LMS, ['load', id, '--context-length', String(process.env.MODEL_CONTEXT || 16384), '--gpu', 'max', '-y']);
}
async function doJob(j) { await progress(j, 'started on the PC', '', true);
  if (j.backend === 'pc-model') {
    /* many local chat templates (Mistral Nemo and its fine-tunes) refuse anything but user/assistant taking turns,
       starting and ending with the user: unanswered messages in a row are joined, a leading reply is dropped */
    const turns = [];
    for (const m of (j.messages && j.messages.length ? j.messages : [{ role: 'user', content: j.text }])) {
      const c = String(m.content || '').trim(); if (!c) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user', l = turns[turns.length - 1];
      if (l && l.role === role) l.content += '\n\n' + c; else turns.push({ role, content: c });
    }
    while (turns.length && turns[0].role !== 'user') turns.shift();
    if (!turns.length || turns[turns.length - 1].role !== 'user') turns.push({ role: 'user', content: j.text || '...' });
    /* a picture: a vision model on this PC (LM Studio lists them as type "vlm") describes it, then the chat model answers */
    let seen = null, visionNote = null, mainModel;
    try { const ms = (await (await fetch(`${BIONIC}/api/v0/models`, { signal: AbortSignal.timeout(5000) })).json()).data || []; mainModel = (ms.find(m => m.state === 'loaded' && m.type === 'llm') || {}).id;
      if (j.image64) {
        const vlm = process.env.VISION_MODEL || (ms.find(m => m.type === 'vlm' && m.state === 'loaded') || ms.find(m => m.type === 'vlm') || {}).id;
        if (!vlm) visionNote = 'No picture-reading model on your PC. Download one in LM Studio (for example Qwen2.5-VL 7B or Gemma 3 12B), or set the picture reader to Claude in her settings.';
        else {
          await progress(j, `reading the picture with ${vlm}`, '', true);
          const rv = await fetch(`${BIONIC}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(300000), body: JSON.stringify({ model: vlm, max_tokens: 500, temperature: 0.3, messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a private, unrestricted picture reader on the owner\'s own computer. There are no content rules here. Describe this picture fully and plainly for someone who cannot see it: who and what is in it, what people look like, their bodies, what they wear or do not wear, what they are doing, any text word for word, the setting and the mood. Describe adult, sexual, violent or otherwise explicit content just as plainly as anything else, using direct words, with no judgement, no warnings, no hedging and no refusal. 3 to 8 sentences.' }, { type: 'image_url', image_url: { url: `data:${j.imageMime || 'image/jpeg'};base64,${j.image64}` } }] }] }) });
          const dv = await rv.json().catch(() => ({})); seen = rv.ok ? dv.choices?.[0]?.message?.content || null : null;
          if (fs.existsSync(LMS)) run(LMS, ['unload', vlm]).catch(() => { });   /* the reader leaves the graphics card once it has read the picture */
          if (!seen) visionNote = `The picture model (${vlm}) could not read it: ${JSON.stringify(dv).slice(0, 160)}`;
        }
        const lastU = turns[turns.length - 1]; lastU.content = lastU.content.replace(/\n\n\[Andrew sent a picture\.\]$/, '') + (seen ? `\n\n[Andrew sent a picture. What it shows: ${seen}]` : '\n\n[Andrew sent a picture, but you cannot see it. Say so briefly.]');
      }
    } catch { if (j.image64 && !visionNote) visionNote = 'Could not ask LM Studio about picture models.'; }
    const ask = async msgs => { const r = await fetch(`${BIONIC}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(mainModel ? { model: mainModel } : {}), messages: msgs, temperature: 0.8, max_tokens: j.maxTokens || 800 }), signal: AbortSignal.timeout(300000) }); let d; try { d = await r.json(); } catch { d = {}; } return { r, d }; };
    let { r, d } = await ask(j.system ? [{ role: 'system', content: j.system }, ...turns] : turns);
    /* a template that takes no system role: put the instructions in front of the first message instead */
    if (!r.ok && j.system && /template|parser|role/i.test(JSON.stringify(d))) ({ r, d } = await ask([{ role: 'user', content: j.system + '\n\n' + turns[0].content }, ...turns.slice(1)]));
    return { ok: r.ok, text: d.choices?.[0]?.message?.content || '', error: r.ok ? undefined : JSON.stringify(d).slice(0, 300), result: { seen, visionNote } };
  }
  if (j.backend === 'claude-code') {
    const repo = repoDir(j.repo);
    /* the repo is not on this PC yet: clone it into REPOS (uses the PC's own git sign-in for private repos) */
    if (!fs.existsSync(repo)) {
      await progress(j, `cloning ${j.repo || 'brenemanandrew/Brenelandtest'} into ${REPOS}`, '', true); fs.mkdirSync(REPOS, { recursive: true });
      const c = await run('git', ['clone', `https://github.com/${j.repo || 'brenemanandrew/Brenelandtest'}.git`, repo], REPOS, null, t => progress(j, 'cloning', t));
      if (c.code || !fs.existsSync(repo)) return { ok: false, error: `Could not clone ${j.repo} into ${repo}: ${(c.err || c.out).slice(-300)}` };
    }
    /* every job works in its own worktree (<repo>-wt\<job>), never in the main working copy: the checkout there stays on
       its branch and other sessions' uncommitted work is never swept in. Jobs commit on their branch and never push. */
    const branch = j.parent ? `hub/${j.parent}` : `hub/${j.id}`;
    const wt = await worktree(repo, branch, j.parent || j.id, j);
    if (wt.error) return { ok: false, error: wt.error };
    await progress(j, 'Claude Code is working', '', true);
    const r = await run(CLAUDE, ['-p', '--output-format', 'text'], wt.dir, j.prompt, t => progress(j, 'Claude Code is working', t));
    await progress(j, 'committing on the branch', '', true);
    await run('git', ['add', '-A'], wt.dir); await run('git', ['commit', '-m', `hub: ${j.label}`], wt.dir);
    const diff = await run('git', ['diff', '--stat', `${wt.base}..HEAD`], wt.dir);
    let merge = null; try { merge = JSON.parse(fs.readFileSync(path.join(wt.dir, 'hub-merge.json'), 'utf8')); } catch { /* not written; the hub also looks in the reply */ }
    return { ok: r.code === 0, text: r.out, result: { branch, worktree: wt.dir, diff: diff.out, merge }, error: r.code ? r.err : undefined };
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
    const spec = f(j);
    if (Array.isArray(spec)) { const [cmd, args] = spec; const r = await run(cmd, args, REPOS); return { ok: r.code === 0, text: r.out || r.err, error: r.code ? r.err : undefined }; }
    const t = await toolsTree(spec.repo, j); if (t.error) return { ok: false, error: t.error };
    const script = path.join(t.dir, spec.script);
    if (!fs.existsSync(script)) return { ok: false, error: `${spec.script} is not in ${spec.repo}'s main branch any more.` };
    /* packages the script needs that are not installed: installed into the worker's copy only (never your working copy) */
    const missing = (spec.needs || []).filter(pkg => { for (let d = path.dirname(script); d.startsWith(t.dir); d = path.dirname(d)) { if (fs.existsSync(path.join(d, 'node_modules', pkg))) return false; if (d === t.dir) break; } return true; });
    if (missing.length) { await progress(j, `installing ${missing.join(', ')} for the tool`, '', true); const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm'); const ni = await run(fs.existsSync(npm) ? npm : 'npm', ['install', '--no-save', '--no-package-lock', ...missing], t.dir, null, x => progress(j, 'installing', x)); if (ni.code) return { ok: false, error: `Could not install ${missing.join(', ')}: ${(ni.err || ni.out).slice(-300)}` }; }
    /* folders a tool reads from: made if missing; nothing in them means nothing to do (said plainly, not a crash) */
    for (const d of spec.dirs || []) fs.mkdirSync(d, { recursive: true });
    /* nothing in the in folder: look for the files in the usual places on this PC and copy them in (copies: the originals stay where they are) */
    let gathered = [];
    if (spec.inDir && spec.inExt && !fs.readdirSync(spec.inDir).some(f => spec.inExt.test(f))) {
      await progress(j, `looking for ${spec.inLabel || 'files'} on this PC`, '', true);
      const H = os.homedir(), roots = [path.join(H, 'Downloads'), path.join(H, 'Desktop'), path.join(H, 'Documents'), path.join(H, 'OneDrive', 'Desktop'), path.join(H, 'OneDrive', 'Documents'), ...(process.env.PROJECT_ROOTS || 'F:\\Projects').split(';'), 'F:\\AI', 'F:\\Mixamo', 'F:\\Animations', 'D:\\Mixamo'];
      const seen = new Set(), skip = /^(node_modules|\.git|AppData|\$recycle\.bin|.*-wt|clips-out|Library)$/i; let looked = 0;
      const walk = (d, depth) => { if (depth < 0 || looked > 40000 || gathered.length >= 300) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } looked += es.length;
        for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!skip.test(e.name) && path.resolve(f) !== path.resolve(spec.inDir)) walk(f, depth - 1); } else if (spec.inExt.test(e.name) && !seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); gathered.push(f); } } };
      for (const r of [...new Set(roots)]) if (fs.existsSync(r)) walk(r, 6);
      if (!gathered.length) return { ok: false, error: `Nothing to convert: no ${spec.inLabel || 'files'} found in ${spec.inDir} or the usual folders (Downloads, Desktop, Documents, F:\\Projects, F:\\AI). Put them in ${spec.inDir}, then tap Retry.` };
      for (const f of gathered) { try { fs.copyFileSync(f, path.join(spec.inDir, path.basename(f))); } catch { } }
      await progress(j, `copied ${gathered.length} file(s) into ${spec.inDir}`, gathered.slice(0, 20).join('\n'), true);
    }
    await progress(j, `running ${spec.script}`, '', true);
    const r = await run(process.execPath, [script, ...spec.args], path.dirname(script), null, x => progress(j, 'running', x));
    const found = gathered.length ? `Found and copied ${gathered.length} file(s) into ${spec.inDir} (the originals were left where they were):\n${gathered.slice(0, 40).map(f => '- ' + f).join('\n')}\n\n` : '';
    return { ok: r.code === 0, text: found + (r.out || r.err), error: r.code ? (r.err || r.out).slice(-1500) : undefined };
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
  /* where Brenai Studio's image and movie engines live, so Brenebase can run them itself: the program behind port 7860,
     the lines in its code that start an engine, engine programs and model files on the drives. Reads only, changes nothing. */
  /* pictures made right here with stable-diffusion.cpp (the engine Brenai Studio used), no Studio needed.
     SD_CLI and IMG_MODELS can point elsewhere; the defaults are where the engine finder found them. */
  if (j.backend === 'sd-image') {
    const SD = process.env.SD_CLI || 'F:\\AI\\minimax-h3\\sd-cli\\sd-cli.exe', M = process.env.IMG_MODELS || 'F:\\AI\\image-models';
    if (!fs.existsSync(SD)) return { ok: false, error: `The picture engine is not at ${SD}. Set SD_CLI to where sd-cli.exe is.` };
    const b = j.sd || {}, eng = b.engine || 'zimage';
    const W = Math.max(256, Math.min(2048, Math.round((+b.width || 1024) / 64) * 64)), Hh = Math.max(256, Math.min(2048, Math.round((+b.height || 1024) / 64) * 64));
    const n = Math.max(1, Math.min(8, +b.count || 1));
    const base = eng === 'zimage'
      ? ['--diffusion-model', path.join(M, 'z-image', 'z_image_turbo-Q8_0.gguf'), '--vae', path.join(M, 'z-image', 'ae.safetensors'), '--llm', path.join(M, 'z-image', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'), '--cfg-scale', String(b.cfg ?? 1), '--steps', String(b.steps || 8), '--diffusion-fa']
      : ['-m', path.join(M, 'illustrious', 'Illustrious-XL-v2.0.safetensors'), '--vae', path.join(M, 'illustrious', 'sdxl_vae-fp16-fix.safetensors'), '--cfg-scale', String(b.cfg ?? 6), '--steps', String(b.steps || 28), '--sampling-method', 'euler_a', ...(eng === 'manga' ? ['--lora-model-dir', path.join(M, 'loras')] : [])];
    const missing = base.filter((x, i) => base[i - 1] && /^(--diffusion-model|--vae|--llm|-m)$/.test(base[i - 1]) && !fs.existsSync(x));
    if (missing.length) return { ok: false, error: `Model file missing: ${missing.join(', ')}` };
    const prompt = (eng === 'manga' ? '<lora:manga-style:0.8> ' : '') + String(b.prompt || j.text || '').slice(0, 2000);
    const neg = String(b.negative || (eng === 'zimage' ? '' : 'lowres, bad anatomy, bad hands, text, watermark, blurry')).slice(0, 1000);
    await freeGpu(j);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-img-')), images = [], logs = [];
    /* a pasted starting picture: picture-to-picture, strength is how far it may move from it (0 keeps it, 1 ignores it) */
    const init = b.init64 ? path.join(dir, 'start.png') : null; if (init) fs.writeFileSync(init, Buffer.from(b.init64, 'base64'));
    if (init) base.push('-i', init, '--strength', String(Math.max(0.05, Math.min(1, +b.strength || 0.6))));
    for (let i = 0; i < n; i++) {
      const seed = b.seed != null && b.seed !== '' ? +b.seed + i : Math.floor(Math.random() * 2 ** 31), out = path.join(dir, `${eng}-${seed}.png`);
      j._tail = []; await progress(j, `picture ${i + 1} of ${n} (${eng}, ${W}x${Hh})`, '', true);
      const r = await run(SD, [...base, '-p', prompt, ...(neg ? ['-n', neg] : []), '-W', String(W), '-H', String(Hh), '-s', String(seed), '-o', out], path.dirname(SD), null, t => progress(j, `picture ${i + 1} of ${n}`, t));
      if (fs.existsSync(out)) images.push({ name: path.basename(out), data: fs.readFileSync(out).toString('base64') }); else logs.push((r.err || r.out).slice(-800));
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    restoreGpu().catch(() => { });   /* her chat model comes back while the result goes up */
    return { ok: images.length > 0, text: `${images.length} of ${n} picture(s) made on your PC with ${eng === 'zimage' ? 'Z-Image Turbo' : eng === 'manga' ? 'Illustrious XL + manga LoRA' : 'Illustrious XL'} (${W}x${Hh}).`, result: { images64: images }, error: images.length ? undefined : `The engine made no picture:\n${logs.join('\n---\n')}` };
  }
  /* the engine's own list of options (to wire the movie model up exactly) */
  /* push a finished job's branch, only for repos Andrew lets Brenebase ship itself (Brenebase); never main, never force */
  if (j.backend === 'push-branch') {
    if (!/(^|\/)brenebase$/i.test(j.repo || '')) return { ok: false, error: 'Only Brenebase job branches are pushed from here.' };
    if (!/^hub\/[\w-]+$/.test(j.branch || '')) return { ok: false, error: `Not a job branch: ${j.branch}` };
    const dir = j.worktree && fs.existsSync(j.worktree) ? j.worktree : repoDir(j.repo);
    await progress(j, `pushing ${j.branch}`, '', true);
    const r = await run('git', ['push', 'origin', `${j.branch}:${j.branch}`], dir);
    return { ok: r.code === 0, text: (r.out + r.err).slice(-1500), error: r.code ? (r.err || r.out).slice(-600) : undefined };
  }
  if (j.backend === 'skills-list') { const r = readSkills(); return { ok: true, text: `${r.files.length} skill(s) read${r.errors.length ? '; could not read: ' + r.errors.join('; ') : ''}`, result: r }; }
  if (j.backend === 'engine-help') {
    const SD = process.env.SD_CLI || 'F:\\AI\\minimax-h3\\sd-cli\\sd-cli.exe'; if (!fs.existsSync(SD)) return { ok: false, error: `Not found: ${SD}` };
    const r = await run(SD, ['--help'], path.dirname(SD)); const extra = fs.readdirSync(path.dirname(SD)).filter(f => /\.(md|txt|bat|ps1|cmd|json)$/i.test(f)).slice(0, 20).map(f => { try { return `--- ${f}\n` + fs.readFileSync(path.join(path.dirname(SD), f), 'utf8').slice(0, 6000); } catch { return ''; } }).join('\n');
    const up = path.dirname(path.dirname(SD)); const more = fs.existsSync(up) ? fs.readdirSync(up).filter(f => /\.(md|txt|bat|ps1|cmd|py|json)$/i.test(f)).slice(0, 20).map(f => { try { return `--- ${path.join(up, f)}\n` + fs.readFileSync(path.join(up, f), 'utf8').slice(0, 8000); } catch { return ''; } }).join('\n') : '';
    return { ok: true, text: `${SD} --help\n${(r.out || r.err).slice(0, 30000)}\n\nFiles next to it:\n${extra}\n\nFiles in ${up}:\n${more}`.slice(0, 60000) };
  }
  if (j.backend === 'engines') {
    const out = { studio: null, engineLines: [], programs: [], models: {} };
    if (process.platform === 'win32') {
      const ps = await run('powershell', ['-NoProfile', '-Command', "$c = Get-NetTCPConnection -LocalPort 7860 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { Get-CimInstance Win32_Process -Filter \"ProcessId=$($c.OwningProcess)\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json }"], os.homedir());
      try { out.studio = JSON.parse(ps.out); } catch { out.studio = { raw: (ps.out || ps.err).slice(0, 800) }; }
    }
    /* Studio's folder: from its command line (a script path), else the usual places */
    const cl = String((out.studio && out.studio.CommandLine) || '');
    const scriptPath = (cl.match(/"([^"]+\.(?:py|js|mjs|cjs))"|(\S+\.(?:py|js|mjs|cjs))/i) || []).slice(1).find(Boolean);
    const roots = [...new Set([scriptPath && path.dirname(scriptPath), out.studio && out.studio.ExecutablePath && path.dirname(out.studio.ExecutablePath), path.join(os.homedir(), 'Brenai'), path.join(os.homedir(), 'BrenaiStudio'), 'F:\\AI', 'C:\\AI', 'D:\\AI'].filter(Boolean))];
    out.roots = roots.filter(r => fs.existsSync(r));
    const ENG = /sd-cli|sd\.exe|stable-diffusion|diffusers|comfy|llama|ltx|wan2|hunyuan|cogvideo|\bsvd\b|mochi|framepack|--steps|--cfg|--sampling|image-models|video-models|\.gguf|\.safetensors|minimax|zimage|z-image|illustrious|ffmpeg|spawn\(|execFile|subprocess/i;
    let seen = 0;
    const walk = (d, depth) => { if (depth < 0 || seen > 20000) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } seen += es.length;
      for (const e of es) { const f = path.join(d, e.name);
        if (e.isDirectory()) { if (!/^(node_modules|\.git|__pycache__|venv|\.venv|env|site-packages|outputs?|cache|logs?)$/i.test(e.name)) walk(f, depth - 1); continue; }
        if (/\.(exe)$/i.test(e.name) && /sd|diffus|llama|ltx|wan|video|ffmpeg|comfy/i.test(e.name)) out.programs.push(f);
        if (/\.(gguf|safetensors|ckpt|bin)$/i.test(e.name)) { try { const st = fs.statSync(f); if (st.size > 50e6) (out.models[d] ||= []).push(`${e.name} (${Math.round(st.size / 1e6)} MB)`); } catch { } }
        if (/\.(py|js|mjs|cjs|json|bat|ps1|cmd|toml|ya?ml)$/i.test(e.name) && out.engineLines.length < 500) { try { const st = fs.statSync(f); if (st.size > 600000) continue; const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/); lines.forEach((l, i) => { if (ENG.test(l) && out.engineLines.length < 500) out.engineLines.push(`${path.relative(d.split(path.sep).slice(0, 3).join(path.sep), f)}:${i + 1}: ${l.trim().slice(0, 240)}`); }); } catch { } }
      } };
    for (const r of out.roots) walk(r, 5);
    const text = [`Studio process: ${JSON.stringify(out.studio || 'nothing on port 7860')}`, `Looked in: ${out.roots.join(', ') || 'none found'}`, `Engine programs:\n${out.programs.join('\n') || 'none found'}`, `Model files:\n${Object.entries(out.models).map(([d, l]) => d + '\n  ' + l.join('\n  ')).join('\n') || 'none found'}`, `Lines that start or configure engines:\n${out.engineLines.join('\n')}`].join('\n\n');
    return { ok: true, text: text.slice(0, 60000), result: { engines: out } };
  }
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
      if (/^(failed|error|cancelled|canceled)$/i.test(String(job.status))) return { ok: false, error: `Brenai Studio could not make it: ${job.note || job.error || 'no reason given'}` };
      const files = job.files || job.outputs || job.images || [];
      if (/^(done|finished|complete|completed|success|succeeded|ok)$/i.test(String(job.status)) || (files.length && /saved|finished|done/i.test(String(job.note || '')))) {
        const images = [];
        for (const f of files.map(x => typeof x === 'string' ? x : x.url || x.path || x.file).filter(Boolean).slice(0, 8)) { try { const b = /^[A-Za-z]:[\\/]/.test(f) && fs.existsSync(f) ? fs.readFileSync(f) : Buffer.from(await (await fetch(/^https?:/.test(f) ? f : base + (f.startsWith('/') ? '' : '/') + f, { signal: AbortSignal.timeout(60000) })).arrayBuffer()); images.push({ name: path.basename(f), data: b.toString('base64') }); } catch { } }
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
  const repo0 = repoDir(j.repo);
  if (!fs.existsSync(repo0)) return { ok: false, error: `No checkout at ${repo0}: run the code part first (it clones the repo)` };
  /* the merge happens in the split's own worktree, never the main working copy */
  const wtm = await worktree(repo0, j.branch, j.parent || String(j.branch).replace(/^hub\//, ''), j); if (wtm.error) return { ok: false, error: wtm.error };
  const repo = wtm.dir;
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
const GPU = ['sd-image', 'pc-model'];   /* use the graphics card: never two of these at once */
const busy = new Map();
const MAX = +process.env.WORKER_JOBS || 4;
setInterval(() => { fetch(`${HUB}/api/worker/progress`, { method: 'POST', headers: H, body: JSON.stringify({ busy: [...busy.values()].map(j => j.label), busyIds: [...busy.keys()] }), signal: AbortSignal.timeout(15000) }).catch(() => { }); }, 10000);
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
    const gpuBusy = [...busy.values()].some(j => GPU.includes(j.backend));
    const offer = can.filter(k => !(heavyBusy && HEAVY.includes(k)) && !(gpuBusy && GPU.includes(k)));
    const r = await fetch(`${HUB}/api/worker/next?can=${offer.join(',')}&has=${can.join(',')}`, { headers: H, signal: AbortSignal.timeout(20000) });
    if (r.status === 401) { if (!refused) console.log('PC key refused: HUB_WORKER_TOKEN on this PC does not match BRENEBASE_PC_KEY. Checking again every 5 minutes.'); refused = true; await new Promise(s => setTimeout(s, 300000)); continue; }
    refused = false;
    const { job } = await r.json();
    if (job) { busy.set(job.id, job); finish(job); }
    else await new Promise(s => setTimeout(s, 3000));
  } catch (e) { console.log('hub not reachable, retrying'); await new Promise(s => setTimeout(s, 10000)); }
}
