/* The companion: Andrew's own chat partner on his PC model, with an avatar he sets up the first time.
   Everything here runs on the PC model only; nothing is sent to Claude or Copilot. No filters: it is his. */
import fs from 'fs';
import path from 'path';
import { PROMPTS } from './adapters.mjs';

const FILE = path.join(process.env.DATA_DIR || './data', 'companion.json');
let db = { setup: null, history: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first time */ }
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); };

export const MODES = ['chat', 'vent', 'roleplay', 'coach'];
export function state(n = 80) { return { setup: db.setup, history: db.history.slice(-n) }; }
export function setup(s) {
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : undefined;
  const look = {}; for (const k of ['skin', 'hair', 'iris', 'top', 'shirt', 'bg1', 'bg2', 'lip']) { const v = hex(s.look && s.look[k]); if (v) look[k] = v; }
  db.setup = { name: String(s.name || 'Companion').slice(0, 40), about: String(s.about || '').slice(0, 2000), voice: /^[a-z]{2}_[a-z]+$/.test(s.voice || '') ? s.voice : 'af_heart', speak: !!s.speak, look, at: Date.now() };
  save(); return db.setup;
}
export function add(who, text, extra = {}) { db.history.push({ who, text: String(text).slice(0, 8000), at: Date.now(), ...extra }); db.history = db.history.slice(-400); save(); }
export function clear() { db.history = []; save(); }

/* what the PC model gets: who it is, how this mode works, then the recent conversation as real turns */
export function request(mode) {
  const s = db.setup || { name: 'Companion', about: '' };
  const system = [`You are ${s.name}, Andrew's companion. ${s.about}`.trim(), PROMPTS.companion[mode] || PROMPTS.companion.chat, 'Talk like a person in a chat: short replies, no lists, no headings. Actions go in *asterisks*. Never use em dashes.'].join('\n\n');
  const messages = db.history.slice(-24).map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
  return { system, messages };
}
