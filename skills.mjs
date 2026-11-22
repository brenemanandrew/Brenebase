/* Skills: SKILL.md files (frontmatter name + description, then Steps, Rules, Report format). Before a job runs,
   Brenebase checks every skill it has against the task, logs one line per skill ("skill <name>: used | not used, <reason>"),
   gives the picked skills' full text to whoever does the work, and lists them in the report.

   Where skills come from
     repo  skills/<name>/SKILL.md in this repo (a copy that works with the PC off)
     pc    the folders the PC worker reads (SKILL_DIRS on the PC; default F:\Projects\Breneland-Next\docs\skills and
           %USERPROFILE%\.claude\skills). A PC copy wins over the repo copy of the same name: the PC is the source.
   Choosing: a model reads only the names and descriptions (Claude, or the PC model for private work); the rules below
   are the fallback and the dry run, so a check always happens and is always logged. */
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.join(HERE, 'skills');
const PC_FILE = path.join(process.env.DATA_DIR || './data', 'skills-pc.json');
let pc = { skills: [], error: null, at: 0 };
try { pc = JSON.parse(fs.readFileSync(PC_FILE, 'utf8')); } catch { /* not read yet */ }

/* frontmatter between --- lines: name, description (may run over several lines), optional requires */
export function parse(text, src) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const m = t.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  const fm = {}; let key = null;
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) { key = kv[1].toLowerCase(); fm[key] = kv[2].replace(/^["'>|]\s*|["']$/g, '').trim(); }
    else if (key && line.trim()) fm[key] = (fm[key] + ' ' + line.trim()).trim();
  }
  const body = m ? m[2] : t;
  const name = fm.name || (src ? path.basename(path.dirname(src)) : '');
  const description = fm.description || '';
  /* "not for" pointers: the part of the description (or a line) that says what the skill is not for */
  const notFor = [...description.matchAll(/not for\s*:?\s*([^.;]+)/gi)].map(x => x[1].trim());
  const pre = (body.match(/^#{1,3}\s*(preconditions?|requires|requirements|before you start)\s*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im) || [])[2] || '';
  const requires = [fm.requires || '', ...pre.split(/\r?\n/).map(l => l.replace(/^\s*[-*\d.]+\s*/, '').trim()).filter(Boolean)].filter(Boolean);
  return name ? { name, description, notFor, requires, text: t, src: src || '' } : null;
}

function readRepo() {
  const out = [];
  try { for (const d of fs.readdirSync(REPO_DIR, { withFileTypes: true })) { if (!d.isDirectory()) continue; const f = path.join(REPO_DIR, d.name, 'SKILL.md'); if (fs.existsSync(f)) { const s = parse(fs.readFileSync(f, 'utf8'), f); if (s) out.push({ ...s, from: 'repo' }); } } }
  catch (e) { return { skills: out, error: `repo skills folder: ${e.message}` }; }
  return { skills: out, error: null };
}

/* what the PC worker read from its skill folders */
export function setPc(list, error) {
  pc = { skills: (list || []).map(x => { const s = parse(x.text || '', x.path); return s ? { ...s, from: 'pc' } : null; }).filter(Boolean), error: error || null, at: Date.now() };
  fs.mkdirSync(path.dirname(PC_FILE), { recursive: true }); fs.writeFileSync(PC_FILE, JSON.stringify(pc));
  return pc;
}
export const pcState = () => ({ count: pc.skills.length, error: pc.error, at: pc.at });

/* every skill Brenebase has right now, and what could not be read */
export function all() {
  const r = readRepo(), byName = new Map();
  for (const s of r.skills) byName.set(s.name, s);
  for (const s of pc.skills) byName.set(s.name, s);
  const errors = [r.error, pc.error ? `PC skill folders: ${pc.error}` : !pc.at ? 'PC skill folders: not read yet (the PC worker reads them when it connects)' : null].filter(Boolean);
  return { skills: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), errors };
}

/* ---- the rules check (fallback and dry run) ---- */
const STOP = new Set('a an and the of to in on for with is are be as at by or it its this that from into your you my me i we our not no use using used when what which who how any all each every do does can will should would could make made makes get set new one two only also more most than then them they their there here about after before over under just like via per has have had been was were if else so but'.split(' '));
const stem = w => w.replace(/(ings?|ed|es|s)$/, '').replace(/(.)\1$/, '$1');
const words = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem));
export function ruleCheck(task, skills) {
  const tw = words(task);
  return skills.map(s => {
    const what = s.description.replace(/not for\s*:?[^.;]*/gi, ' ');
    const sw = words(`${s.name.replace(/-/g, ' ')} ${what}`), nw = words(s.notFor.join(' '));
    const hit = [...tw].filter(w => sw.has(w)), miss = [...tw].filter(w => nw.has(w));
    const nameHit = s.name.split('-').filter(p => p.length > 2 && tw.has(stem(p))).length;
    const score = hit.length + nameHit;
    if (miss.length >= 2 && miss.length >= hit.length) return { name: s.name, used: false, reason: `the description says it is not for this (${miss.slice(0, 3).join(', ')})` };
    if (score >= 3 || (score >= 2 && nameHit)) return { name: s.name, used: true, reason: `the task matches what it is for (${[...new Set(hit)].slice(0, 4).join(', ')})` };
    return { name: s.name, used: false, reason: hit.length ? `only a loose match (${hit.slice(0, 3).join(', ')})` : 'nothing in the task matches what it is for' };
  });
}

/* ---- the check a job runs before it starts ---- */
export async function check(task, { claude, askPc, local } = {}) {
  const { skills, errors } = all();
  if (!skills.length) return { by: 'none', lines: [], used: [], errors: errors.length ? errors : ['No skills found'] };
  const list = skills.map(s => `- ${s.name}: ${s.description}`).join('\n');
  const sys = `You decide which skills apply to a task before it starts. Read each skill's description, including what it says it is NOT for. Pick every skill that applies; none is a valid answer. Answer with JSON only: {"skills":[{"name":"","used":true,"reason":"a few words"}]} with one entry for EVERY skill listed. Never use em dashes.\n\nSkills:\n${list}`;
  let picks = null, by = 'rules';
  try {
    if (!local && claude) {
      const r = await claude.beta.messages.create({ model: process.env.HUB_ROUTER_MODEL || 'claude-opus-5-5', max_tokens: 2000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' }, system: sys, messages: [{ role: 'user', content: `Task: ${task}` }] });
      const t = r.content.find(b => b.type === 'text'); const m = t && t.text.match(/\{[\s\S]*\}/); if (m) { picks = JSON.parse(m[0]).skills; by = 'claude'; }
    } else if (askPc) {
      const out = await askPc(sys, `Task: ${task}`, 60000); const m = out && out.match(/\{[\s\S]*\}/); if (m) { picks = JSON.parse(m[0]).skills; by = 'pc-model'; }
    }
  } catch { picks = null; }
  const rules = ruleCheck(task, skills);
  const lines = skills.map(s => { const p = (picks || []).find(x => x && x.name === s.name); return p ? { name: s.name, used: !!p.used, reason: String(p.reason || '').slice(0, 160) || (p.used ? 'applies' : 'does not apply') } : { ...rules.find(x => x.name === s.name), ...(picks ? { reason: rules.find(x => x.name === s.name).reason + ' (rules; the model left it out)' } : {}) }; });
  return { by, lines, used: lines.filter(l => l.used).map(l => l.name), errors };
}
export const logLines = c => c.lines.map(l => `skill ${l.name}: ${l.used ? 'used' : 'not used'}, ${l.reason}`);

/* what the worker (Claude Code, the PC model, Claude) is given: the picked skills in full and the rules for using them */
export function brief(c) {
  if (!c) return '';
  const { skills } = all(), picked = skills.filter(s => c.used.includes(s.name));
  const head = c.errors.length ? `NOTE: some skills could not be read (${c.errors.join('; ')}). Say so at the top of your report.\n` : '';
  const others = skills.filter(s => !c.used.includes(s.name)).map(s => `- ${s.name}: ${s.description}`).join('\n');
  return `${head}SKILLS. Brenebase checked its skills against this task. Used: ${c.used.length ? c.used.join(', ') : 'none'}.
Follow the Steps, Rules and Report format of each skill below. Where a skill's rule and the task conflict, the stricter rule holds; say so in your report. If a skill's precondition cannot be met (for example Blender with its add-on not running, or a download that needs Andrew's yes), stop there and report it. If the work changes shape partway, check the other skills again (list below) and say which you used. Your final report lists the skills used.
${picked.map(s => `\n===== SKILL ${s.name} =====\n${s.text}`).join('\n')}
${others ? `\nOther skills (descriptions only):\n${others}` : ''}`;
}
/* a precondition this PC cannot meet right now (only what can be checked from here: Blender) */
export function blocked(c, can = []) {
  const { skills } = all();
  for (const s of skills.filter(x => c.used.includes(x.name))) {
    const needs = `${s.requires.join(' ')} ${s.description}`;
    if (/blender/i.test(needs) && !can.includes('blender')) return `Skill ${s.name} needs Blender on the PC (with its add-on connected), and the PC worker does not have Blender right now. Stopped before starting.`;
  }
  return null;
}
