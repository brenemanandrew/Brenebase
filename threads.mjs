/* Tabs: a tab is a project or a named conversation. Jobs sent from a tab belong to it, the Jobs list can show one tab,
   and a follow-up in a tab gets that tab's recent questions and answers so it can carry on the conversation. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FILE = path.join(process.env.DATA_DIR || './data', 'threads.json');
let db = { threads: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); };

export const list = () => db.threads.filter(t => !t.closed);
export const get = id => db.threads.find(t => t.id === id);
export function open({ name, project }) {
  const t = { id: crypto.randomBytes(4).toString('hex'), name: String(name || project || 'Conversation').slice(0, 40), project: project || null, at: Date.now() };
  db.threads.push(t); save(); return t;
}
export function update(id, patch) { const t = get(id); if (!t) return null; if (patch.name) t.name = String(patch.name).slice(0, 40); if ('project' in patch) t.project = patch.project || null; if (patch.closed) t.closed = Date.now(); save(); return t; }

/* the tab's recent exchanges as real turns, oldest first, short enough to stay cheap */
export function history(jobs, threadId, n = 6) {
  const done = jobs.filter(j => j.thread === threadId && j.status === 'done' && j.result && j.result.text && !j.quiet).slice(0, n).reverse();
  return done.flatMap(j => [{ role: 'user', content: String(j.text).slice(0, 2000) }, { role: 'assistant', content: String(j.result.text).slice(0, 3000) }]);
}
