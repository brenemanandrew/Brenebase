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
/* a doll's look and reactions, checked: only known fields, known words, numbers 0..1 (the doll skill, skills/doll.md, uses the same rules) */
/* everyday words a model (or Andrew) uses, mapped to the doll's own words and colours */
const SYN = {
  hairStyle: [['twin tail', 'twintails'], ['twintail', 'twintails'], ['pigtail', 'twintails'], ['pony', 'ponytail'], ['braid', 'ponytail'], ['bun', 'bun'], ['topknot', 'bun'], ['updo', 'bun'], ['pixie', 'pixie'], ['buzz', 'pixie'], ['bob', 'bob'], ['short', 'bob'], ['wav', 'wavy'], ['curl', 'wavy'], ['long', 'long'], ['straight', 'long']],
  topStyle: [['crop', 'crop'], ['dress', 'dress'], ['gown', 'dress'], ['hood', 'hoodie'], ['jacket', 'hoodie'], ['sweatshirt', 'hoodie'], ['sweater', 'sweater'], ['jumper', 'sweater'], ['cardigan', 'sweater'], ['pullover', 'sweater'], ['turtleneck', 'sweater'], ['blouse', 'blouse'], ['button', 'blouse'], ['tank', 'tank'], ['cami', 'tank'], ['vest', 'tank'], ['tee', 'tee'], ['t-shirt', 'tee'], ['tshirt', 'tee'], ['shirt', 'tee'], ['top', 'tee']],
  bottomStyle: [['legging', 'leggings'], ['yoga', 'leggings'], ['tights', 'leggings'], ['skirt', 'skirt'], ['short', 'shorts'], ['jean', 'jeans'], ['pant', 'jeans'], ['trouser', 'jeans'], ['denim', 'jeans']],
  shoeStyle: [['boot', 'boots'], ['sneaker', 'sneakers'], ['trainer', 'sneakers'], ['runner', 'sneakers'], ['heel', 'flats'], ['flat', 'flats'], ['sandal', 'flats'], ['slipper', 'flats'], ['loafer', 'flats'], ['shoe', 'sneakers']],
};
const COLOURS = { red: '#c0392b', crimson: '#a5142a', maroon: '#6d1a2a', burgundy: '#6d1a2a', pink: '#f08bb0', 'hot pink': '#e8417e', orange: '#e67e22', yellow: '#f2c94c', gold: '#d4a017', green: '#3f9a4b', 'dark green': '#1f5a2c', olive: '#6b7a2e', teal: '#178f8a', blue: '#3a7bd5', 'light blue': '#8ec5f0', navy: '#1d2b53', purple: '#7d4bb3', violet: '#8a5bd0', lavender: '#b9a2e0', black: '#151418', white: '#f4f1ee', grey: '#8a8a92', gray: '#8a8a92', silver: '#c0c4cc', brown: '#6b4428', tan: '#c8a27a', beige: '#e3d2b4', cream: '#f3e9d2', blonde: '#e8cf7a', blond: '#e8cf7a', platinum: '#ece6d6', auburn: '#8d3a1c', ginger: '#c4581e', redhead: '#b3352b', brunette: '#4a2c1c', pale: '#f6e9e4', fair: '#f4e0d6', olive_skin: '#c99e74', dark: '#5a3b2a' };
const asHex = v => { if (/^#[0-9a-f]{6}$/i.test(v || '')) return v; if (/^#[0-9a-f]{3}$/i.test(v || '')) return '#' + v.slice(1).split('').map(c => c + c).join(''); const t = String(v || '').toLowerCase().trim(); return COLOURS[t] || COLOURS[t.replace(/^(dark|light|bright|pale|deep)\s+/, '')] || undefined; };
export function cleanLook(src) {
  const s = { look: { ...(src || {}) } };
  for (const [k, list] of Object.entries(SYN)) { const v = String(s.look[k] || '').toLowerCase(); if (v && !(LOOKS[k] || []).includes(v)) { const hit = list.find(([w]) => v.includes(w)); if (hit) s.look[k] = hit[1]; } }
  for (const k of ['skin', 'hair', 'iris', 'top', 'shirt', 'bottom', 'shoes', 'bg1', 'bg2', 'lip']) if (s.look[k]) s.look[k] = asHex(s.look[k]) || s.look[k];
  if (typeof s.look.glasses === 'string') s.look.glasses = !/^(no|none|false|off)$/i.test(s.look.glasses);
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : undefined;
  const look = {}; for (const k of ['skin', 'hair', 'iris', 'top', 'shirt', 'bottom', 'shoes', 'bg1', 'bg2', 'lip']) { const v = hex(s.look && s.look[k]); if (v) look[k] = v; }
  const pick = (k, list) => { const v = s.look && s.look[k]; if (list.includes(v)) look[k] = v; };
  pick('hairStyle', LOOKS.hairStyle); pick('topStyle', LOOKS.topStyle); pick('bottomStyle', LOOKS.bottomStyle); pick('shoeStyle', LOOKS.shoeStyle);
  for (const k of ['shoulders', 'bust', 'waist', 'hips', 'thighs', 'arms', 'legs', 'bounce']) { const v = s.look && s.look[k] != null && s.look[k] !== '' ? +s.look[k] : NaN; if (Number.isFinite(v)) look[k] = Math.max(0, Math.min(1, v)); }
  if (s.look && s.look.glasses != null) look.glasses = !!s.look.glasses;
  return look;
}
export function cleanReactions(src) {
  const reactions = {};
  for (const z of ZONES) { const r = src && src[z]; if (!r) continue; const o = { face: String(r.face || '').slice(0, 20), move: String(r.move || '').slice(0, 20), say: String(r.say || '').slice(0, 300), send: String(r.send || '').slice(0, 600) }; if (o.face || o.move || o.say || o.send) reactions[z] = o; }
  return reactions;
}
/* saved dolls: looks he made or the doll skill made, to load into the editor */
export const dolls = () => db.dolls || [];
export function saveDoll(d) { db.dolls = (db.dolls || []).filter(x => x.name !== d.name); db.dolls.push({ name: String(d.name || 'Doll').slice(0, 40), look: cleanLook(d.look), reactions: cleanReactions(d.reactions), at: Date.now() }); db.dolls = db.dolls.slice(-60); save(); return db.dolls; }
export function dropDoll(name) { db.dolls = (db.dolls || []).filter(x => x.name !== name); save(); return db.dolls; }
export function setup(s) {
  const look = cleanLook(s.look);
  /* his reactions per part of her body: what her face does, what she does, what she says, what is sent to her as his action. Kept as he wrote them. */
  const reactions = cleanReactions(s.reactions);
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
