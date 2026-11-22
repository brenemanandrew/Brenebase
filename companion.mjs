/* The companion: Andrew's own chat partner on his PC model, with an avatar he sets up the first time.
   Everything here runs on the PC model only; nothing is sent to Claude or Copilot. No filters: it is his. */
import fs from 'fs';
import path from 'path';
import { PROMPTS } from './adapters.mjs';

const FILE = path.join(process.env.DATA_DIR || './data', 'companion.json');
let db = { setup: null, history: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first time */ }
/* conversations: tabs inside the companion. The first one holds what existed before tabs. */
if (!db.convos) { db.convos = [{ id: 'main', name: 'Talk', history: db.history || [] }]; db.current = 'main'; delete db.history; }
const cur = () => db.convos.find(c => c.id === db.current) || db.convos[0];
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); };

export const MODES = ['chat', 'vent', 'roleplay', 'coach'];
export const ZONES = ['hair', 'face', 'nose', 'shoulders', 'arms', 'hands', 'chest', 'belly', 'hips', 'legs', 'feet'];
export const LOOKS = { hairStyle: ['long', 'wavy', 'bob', 'ponytail', 'twintails', 'bun', 'pixie'], topStyle: ['hoodie', 'tee', 'tank', 'sweater', 'blouse', 'crop', 'dress'], bottomStyle: ['jeans', 'leggings', 'skirt', 'shorts'], shoeStyle: ['boots', 'sneakers', 'flats'] };
export function state(n = 80) { const c = cur(); return { setup: db.setup, convos: db.convos.filter(x => !x.closed).map(x => ({ id: x.id, name: x.name })), current: c.id, history: c.history.slice(-n) }; }
export function convo({ id, name, close }) {
  if (close) { const c = db.convos.find(x => x.id === id); if (c && db.convos.filter(x => !x.closed).length > 1) { c.closed = Date.now(); if (db.current === id) db.current = db.convos.find(x => !x.closed).id; } }
  else if (id && db.convos.some(x => x.id === id && !x.closed)) { db.current = id; if (name) db.convos.find(x => x.id === id).name = String(name).slice(0, 30); }
  else { const c = { id: Math.random().toString(36).slice(2, 8), name: String(name || 'New').slice(0, 30), history: [] }; db.convos.push(c); db.current = c.id; }
  save(); return state();
}
export function setup(s) {
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : undefined;
  const look = {}; for (const k of ['skin', 'hair', 'iris', 'top', 'shirt', 'bottom', 'shoes', 'bg1', 'bg2', 'lip']) { const v = hex(s.look && s.look[k]); if (v) look[k] = v; }
  /* styles and body shape; always dressed, so only these choices exist */
  const pick = (k, list) => { const v = s.look && s.look[k]; if (list.includes(v)) look[k] = v; };
  pick('hairStyle', LOOKS.hairStyle); pick('topStyle', LOOKS.topStyle); pick('bottomStyle', LOOKS.bottomStyle); pick('shoeStyle', LOOKS.shoeStyle);
  for (const k of ['shoulders', 'bust', 'waist', 'hips', 'thighs', 'arms', 'legs', 'bounce']) { const v = s.look && +s.look[k]; if (Number.isFinite(v)) look[k] = Math.max(0, Math.min(1, v)); }
  if (s.look && s.look.glasses != null) look.glasses = !!s.look.glasses;
  /* his reactions per part of her body: what her face does, what she does, what she says, what is sent to her as his action. Kept as he wrote them. */
  const reactions = {};
  for (const z of ZONES) { const r = s.reactions && s.reactions[z]; if (!r) continue; const o = { face: String(r.face || '').slice(0, 20), move: String(r.move || '').slice(0, 20), say: String(r.say || '').slice(0, 300), send: String(r.send || '').slice(0, 600) }; if (o.face || o.move || o.say || o.send) reactions[z] = o; }
  const imageReader = ['pc', 'claude'].includes(s.imageReader) ? s.imageReader : (db.setup && db.setup.imageReader) || 'pc';
  db.setup = { name: String(s.name || 'Companion').slice(0, 40), about: String(s.about || '').slice(0, 2000), voice: /^[a-z]{2}_[a-z]+$/.test(s.voice || '') ? s.voice : 'af_heart', speak: !!s.speak, look, reactions, imageReader, at: Date.now() };
  save(); return db.setup;
}
export function add(who, text, extra = {}) { const c = (extra.convo && db.convos.find(x => x.id === extra.convo)) || cur(); c.history.push({ who, text: String(text).slice(0, 8000), at: Date.now(), ...extra }); c.history = c.history.slice(-400); save(); }
export function clear() { cur().history = []; save(); }

/* what the PC model gets: who it is, how this mode works, then the recent conversation as real turns */
export function request(mode) {
  const s = db.setup || { name: 'Companion', about: '' };
  const system = [`You are ${s.name}, Andrew's companion. ${s.about}`.trim(), PROMPTS.companion[mode] || PROMPTS.companion.chat, 'Talk like a person in a chat: short replies, no lists, no headings. Actions go in *asterisks*. Never use em dashes.'].join('\n\n');
  const messages = cur().history.filter(m => m.who !== 'note').slice(-24).map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text + (m.image ? (m.seen ? `\n\n[Andrew sent a picture. What it shows: ${m.seen}]` : '\n\n[Andrew sent a picture.]') : '') }));
  return { system, messages };
}
/* what a picture he sent shows, once something has read it */
export function seen(picId, text) { for (const c of db.convos) for (const m of c.history) if (m.pic === picId) { m.seen = String(text || '').slice(0, 2000); save(); return true; } return false; }

/* the Results conversation: where job results are talked over (the chat window that pops up with results) */
export function ensure(id, name) { if (!db.convos.some(c => c.id === id)) { db.convos.push({ id, name, history: [] }); save(); } return db.convos.find(c => c.id === id); }
export const historyOf = (id, n = 40) => ((db.convos.find(c => c.id === id) || {}).history || []).slice(-n);
export function requestAbout(convoId, jobInfo) {
  const s = db.setup || { name: 'Companion', about: '' };
  const system = [`You are ${s.name}, Andrew's companion. ${s.about}`.trim(), 'Andrew is asking about the result of a job Brenebase ran for him. Answer about that result: explain it, pick out what matters, say plainly what is missing or wrong. Short, like a chat. Never use em dashes.', `The job:\n${jobInfo}`].join('\n\n');
  const messages = historyOf(convoId, 16).filter(m => m.who !== 'note').map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
  return { system, messages };
}
