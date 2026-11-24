/* Thinking split: a model reads the whole request and works out the parts itself.
   It decides how many parts there are, which tool and mode each goes to, what each part is told (only what that tool
   needs: the coder never gets the art or the story), and which parts must wait for another part's result.

   Who thinks: Andrew's PC model, for every request (Claude is kept for code and for checking Copilot).
     The PC model busy or off -> the rules (vet.mjs) split it.
   The plan is shown before anything runs; nothing is sent to a tool until Andrew taps Run. */
import { TOOLS, resolve } from './tools.mjs';
import { vet } from './vet.mjs';
import * as SK from './skills.mjs';

const CATALOGUE = () => TOOLS.map(t => `${t.id}: ${t.what}\n` + Object.entries(t.modes).map(([k, m]) => `  ${t.id}/${k}: ${m.does}`).join('\n')).join('\n');

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'parts', 'question'],
  properties: {
    summary: { type: 'string', description: 'One short line: what Andrew wants, as you understood it' },
    question: { type: 'string', description: 'One question if something important is unclear, else empty' },
    parts: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['tool', 'mode', 'text', 'why', 'needs', 'skills'],
        properties: {
          tool: { type: 'string' }, mode: { type: 'string' },
          text: { type: 'string', description: 'The instruction this tool gets. Self-contained, only what this tool needs.' },
          why: { type: 'string', description: 'A few words: why this tool' },
          needs: { type: 'array', items: { type: 'integer' }, description: 'Numbers (0-based) of earlier parts whose result this part must wait for and use' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Names of the skills (from the list) this part should follow; empty if none apply' },
        },
      },
    },
  },
};

const SYSTEM = (skillIndex = '') => `You are the planner inside Brenebase, Andrew's hub. Read his whole request and split it into the fewest parts that each go to ONE tool. Never use em dashes.

Rules
- One part when one tool can do it all. Split only when parts really belong to different tools.
- Keep details with their subject: "a lighthouse at sunset, 2 images, realistic" is ONE picture part.
- Each part's text is a complete instruction for that tool alone, as short as it can be while still clear. Write it as Andrew would ask that tool.
- The coder (Claude Code) gets only the code work: rules, systems, what to load from files. Never the art descriptions, story, lore, names or private details. Refer to art and story as assets it loads (for example "load the tavern model from assets/tavern.glb").
- Story, lore, dialogue and names go to the companion or the PC model side, not the coder.
- If a part uses another part's result (a plan before the build, a story before the dialogue code, a picture before a 3D model), list that part's number in needs. Parts with no needs run at once.
- A pasted or attached picture he wants made into a 3D model is ONE make3d/blender3d part (free, on his PC, into the open Blender), unless he names Meshy (then make3d/generate). It is not an Images part.
- Do not invent work he did not ask for. Do not add review or test parts unless he asked.
- If the request is a feeling, a vent or chat, one companion part.
- Use only these tools and modes (tool/mode):
${CATALOGUE()}${skillIndex ? `

Skills Brenebase has. Search this list for every part: read each description, including what it is NOT for, and put the names of the skills that part should follow in its "skills". A skill can also show which tool fits best (a Meshy skill means the 3D tool, a picture skill the Images tool, a work skill a private PC part). None is a valid answer.
${skillIndex}` : ''}`;

export function isPrivate(text, { project, tags } = {}) {
  return /\[\[local\]\]/i.test(text) || !!(project && project.private) || !!(tags && (tags.found || []).some(t => /^(work|hubbell|staging lane)$/i.test(t)));
}

let KNOWN = new Set();
function clean(plan, by) {
  const parts = (plan.parts || []).map(p => { const r = resolve(p.tool, p.mode) || resolve(p.tool); return r ? { tool: r.tool, mode: r.mode, label: r.label, text: String(p.text || '').trim(), why: p.why || '', needs: (p.needs || []).filter(n => Number.isInteger(n) && n >= 0), skills: (p.skills || []).map(String).filter(n => KNOWN.has(n)) } : null; });
  /* a part whose tool did not exist is dropped; needs are renumbered and may only point backwards */
  const map = []; const kept = [];
  parts.forEach((p, i) => { if (p && p.text) { map[i] = kept.length; kept.push(p); } });
  kept.forEach((p, i) => { p.needs = [...new Set(p.needs.map(n => map[n]).filter(n => n != null && n < i))]; });
  return kept.length ? { by, summary: plan.summary || '', question: plan.question || '', parts: kept } : null;
}

export async function think(text, { claude, askPc, project, tags } = {}) {
  const local = isPrivate(text, { project, tags });
  /* the skills are searched while the jobs are worked out, not only when each job starts */
  const all = SK.all(); KNOWN = new Set(all.skills.map(s => s.name));
  const skillIndex = all.skills.map(s => `- ${s.name}: ${s.description}`).join('\n');
  /* a part's skills also steer its tool: a Meshy skill means the 3D tool, a picture skill the Images tool, the doll skill the Doll tool,
     and work (kaizen) stays private on the PC */
  const STEER = { 'meshy-3d': ['make3d', 'generate'], 'picture-prompts': ['image', null], 'doll': ['doll', null], 'kaizen-a3': ['expert', 'kaizen'] };
  const withSkills = p => {
    for (const part of p.parts) {
      const rules = SK.ruleCheck(part.text, all.skills).filter(x => x.used).map(x => x.name); part.skills = [...new Set([...(part.skills || []), ...rules])];
      /* picture to 3D in Blender: the picture is what goes in, not what comes out, so a picture skill does not move it to Images */
      const keep = part.tool === 'make3d' && part.mode === 'blender3d';
      for (const sk of keep ? [] : part.skills) { const st = STEER[sk]; if (!st || part.tool === st[0]) continue; const r = resolve(st[0], st[1] || (st[0] === 'image' ? (/anime|manga|cel/i.test(part.text) ? 'anime' : 'realistic') : st[0] === 'doll' ? (/new doll/i.test(part.text) ? 'new' : 'edit') : undefined)); if (r) { Object.assign(part, { tool: r.tool, mode: r.mode, label: r.label, why: `${part.why ? part.why + '; ' : ''}skill ${sk} says ${r.label}` }); break; } }
      if (part.skills.includes('kaizen-a3')) part.private = true;
    }
    return { ...p, skillErrors: all.errors, skillCount: all.skills.length };
  };
  /* Brenebase plans on Andrew's PC model, never Claude (Claude is only for code and for checking Copilot); the rules are the fallback */
  const tries = askPc ? ['pc'] : [];
  const notes = [];
  for (const who of tries) {
    try {
      if (who === 'claude') {
        const r = await claude.beta.messages.create({
          model: process.env.HUB_ROUTER_MODEL || 'claude-opus-5-5', max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM(skillIndex), messages: [{ role: 'user', content: text }],
        });
        if (r.stop_reason === 'refusal') { notes.push('Claude would not plan this one'); continue; }
        const t = r.content.find(b => b.type === 'text'); const p = t && clean(JSON.parse(t.text), 'claude');
        if (p) return withSkills({ ...p, local, notes });
      }
      if (who === 'pc' && askPc) {
        const out = await askPc(`${SYSTEM(skillIndex)}\n\nAnswer with JSON only, in this shape: {"summary":"","question":"","parts":[{"tool":"","mode":"","text":"","why":"","needs":[],"skills":[]}]}`, text);
        const m = out && out.match(/\{[\s\S]*\}/); const p = m && clean(JSON.parse(m[0]), 'pc-model');
        if (p) return withSkills({ ...p, local, notes });
        notes.push(out == null ? 'The PC worker or model is not free right now' : 'The PC model did not give a usable plan');
      }
    } catch (e) { notes.push(`${who === 'claude' ? 'Claude' : 'The PC model'}: ${String(e.message || e).slice(0, 160)}`); }
  }
  /* nobody could think about it: the rules */
  const v = vet(text);
  /* Get help on a project's problem or open item is a change to that project's code: one Coder fix part */
  if (/^fix this in the .+? code:/i.test(text)) { const r = resolve('coder', 'fix'); v.parts = [{ tool: r.tool, mode: r.mode, label: r.label, text: text.replace(/^fix this in the (.+?) code:\s*/i, 'In $1: '), why: 'a fix to the project code' }]; }
  return withSkills({ by: 'rules', summary: '', question: '', local, notes: local && !askPc ? [...notes, 'Private request and the PC worker is offline, so the rules split it'] : notes, parts: v.parts.map(p => ({ ...p, needs: [] })) });
}
