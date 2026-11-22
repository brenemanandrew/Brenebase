/* Thinking split: a model reads the whole request and works out the parts itself.
   It decides how many parts there are, which tool and mode each goes to, what each part is told (only what that tool
   needs: the coder never gets the art or the story), and which parts must wait for another part's result.

   Who thinks
     a private request (a private project such as work, a work tag, or [[local]] in it)  -> the PC model only
     anything else                                                                        -> Claude, or the PC model if Claude is off
     neither answers                                                                      -> the rules (vet.mjs), as before
   The plan is shown before anything runs; nothing is sent to a tool until Andrew taps Run. */
import { TOOLS, resolve } from './tools.mjs';
import { vet } from './vet.mjs';

const CATALOGUE = () => TOOLS.map(t => `${t.id}: ${t.what}\n` + Object.entries(t.modes).map(([k, m]) => `  ${t.id}/${k}: ${m.does}`).join('\n')).join('\n');

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'parts', 'question'],
  properties: {
    summary: { type: 'string', description: 'One short line: what Andrew wants, as you understood it' },
    question: { type: 'string', description: 'One question if something important is unclear, else empty' },
    parts: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['tool', 'mode', 'text', 'why', 'needs'],
        properties: {
          tool: { type: 'string' }, mode: { type: 'string' },
          text: { type: 'string', description: 'The instruction this tool gets. Self-contained, only what this tool needs.' },
          why: { type: 'string', description: 'A few words: why this tool' },
          needs: { type: 'array', items: { type: 'integer' }, description: 'Numbers (0-based) of earlier parts whose result this part must wait for and use' },
        },
      },
    },
  },
};

const SYSTEM = () => `You are the planner inside Brenebase, Andrew's hub. Read his whole request and split it into the fewest parts that each go to ONE tool. Never use em dashes.

Rules
- One part when one tool can do it all. Split only when parts really belong to different tools.
- Keep details with their subject: "a lighthouse at sunset, 2 images, realistic" is ONE picture part.
- Each part's text is a complete instruction for that tool alone, as short as it can be while still clear. Write it as Andrew would ask that tool.
- The coder (Claude Code) gets only the code work: rules, systems, what to load from files. Never the art descriptions, story, lore, names or private details. Refer to art and story as assets it loads (for example "load the tavern model from assets/tavern.glb").
- Story, lore, dialogue and names go to the companion or the PC model side, not the coder.
- If a part uses another part's result (a plan before the build, a story before the dialogue code, a picture before a 3D model), list that part's number in needs. Parts with no needs run at once.
- Do not invent work he did not ask for. Do not add review or test parts unless he asked.
- If the request is a feeling, a vent or chat, one companion part.
- Use only these tools and modes (tool/mode):
${CATALOGUE()}`;

export function isPrivate(text, { project, tags } = {}) {
  return /\[\[local\]\]/i.test(text) || !!(project && project.private) || !!(tags && (tags.found || []).some(t => /^(work|hubbell|staging lane)$/i.test(t)));
}

function clean(plan, by) {
  const parts = (plan.parts || []).map(p => { const r = resolve(p.tool, p.mode) || resolve(p.tool); return r ? { tool: r.tool, mode: r.mode, label: r.label, text: String(p.text || '').trim(), why: p.why || '', needs: (p.needs || []).filter(n => Number.isInteger(n) && n >= 0) } : null; });
  /* a part whose tool did not exist is dropped; needs are renumbered and may only point backwards */
  const map = []; const kept = [];
  parts.forEach((p, i) => { if (p && p.text) { map[i] = kept.length; kept.push(p); } });
  kept.forEach((p, i) => { p.needs = [...new Set(p.needs.map(n => map[n]).filter(n => n != null && n < i))]; });
  return kept.length ? { by, summary: plan.summary || '', question: plan.question || '', parts: kept } : null;
}

export async function think(text, { claude, askPc, project, tags } = {}) {
  const local = isPrivate(text, { project, tags });
  const tries = local ? ['pc'] : [claude ? 'claude' : null, askPc ? 'pc' : null].filter(Boolean);
  const notes = [];
  for (const who of tries) {
    try {
      if (who === 'claude') {
        const r = await claude.beta.messages.create({
          model: process.env.HUB_ROUTER_MODEL || 'claude-opus-5-5', max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM(), messages: [{ role: 'user', content: text }],
        });
        if (r.stop_reason === 'refusal') { notes.push('Claude would not plan this one'); continue; }
        const t = r.content.find(b => b.type === 'text'); const p = t && clean(JSON.parse(t.text), 'claude');
        if (p) return { ...p, local, notes };
      }
      if (who === 'pc' && askPc) {
        const out = await askPc(`${SYSTEM()}\n\nAnswer with JSON only, in this shape: {"summary":"","question":"","parts":[{"tool":"","mode":"","text":"","why":"","needs":[]}]}`, text);
        const m = out && out.match(/\{[\s\S]*\}/); const p = m && clean(JSON.parse(m[0]), 'pc-model');
        if (p) return { ...p, local, notes };
        notes.push(out == null ? 'The PC worker or model is not free right now' : 'The PC model did not give a usable plan');
      }
    } catch (e) { notes.push(`${who === 'claude' ? 'Claude' : 'The PC model'}: ${String(e.message || e).slice(0, 160)}`); }
  }
  /* nobody could think about it: the rules */
  const v = vet(text);
  return { by: 'rules', summary: '', question: '', local, notes: local && !askPc ? [...notes, 'Private request and the PC worker is offline, so the rules split it'] : notes, parts: v.parts.map(p => ({ ...p, needs: [] })) };
}
