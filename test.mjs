/* Routing check: node test.mjs. Each line is a thought and the tool:mode it should land on. */
import { ruleRoute } from './route.mjs';
import { split, rejoin } from './split.mjs';
const CASES = [
  ['My supervisor changed the overtime rules again without telling anyone, I am so pissed', 'companion:vent'],
  ['Plan a kaizen event for the receiving dock, too much walking between stations', 'expert:kaizen'],
  ['Do a 5 whys on why the cross training roster keeps getting out of date', 'expert:kaizen'],
  ['Make a cel shaded oak tree model for Breneland', 'make3d:generate'],
  ['Turn this photo of my dog into a 3d model', 'make3d:generate'],
  ['Retexture the tavern sign so it looks cel shaded', 'make3d:retexture'],
  ['Decimate wizra_hoodie.glb to about 20k tris', 'make3d:process'],
  ['Auto rig the new goblin model', 'make3d:rig'],
  ['Check the sweater for clipping and holes', 'make3d:check'],
  ['I want Wizra to do the little dance I do, I can act it out on camera', 'motion:capture'],
  ['Get a walk cycle for the Breneland townsfolk', 'motion:library'],
  ['Retarget the sitting clip onto the other rig', 'motion:retarget'],
  ['Add a small fidget gesture when she is idle', 'motion:handkey'],
  ['Fix the bug where the chat bar disappears on my phone', 'coder:fix'],
  ['Write a powershell script to back up my Bionic models folder', 'coder:script'],
  ['Break down the shell clothes project into steps', 'planner:breakdown'],
  ['Lets roleplay, you are my manager and I am asking for a raise', 'companion:roleplay'],
  ['What makes a good core loop for a cozy life sim', 'expert:game'],
  ['Deploy brenai', 'ship:deploy'],
  ['Open the overtime kiosk', 'workapp:open'],
  ['I want a t-pose illustration front and back of my character wizra, both a realistic image and a cel shaded anime looking image for concept', 'image:model'],
  ['Make concept art of a goblin merchant, realistic and anime versions', 'image:anime'],
  ['make an anime picture of a fox spirit in a forest', 'image:anime'],
  ['a picture of a lighthouse at sunset', 'image:realistic'],
  ['use meshy to make concept art of a goblin', 'image:concept'],
  ['generate about 30 images of Wizra in a variety of poses and expressions', 'image:model'],
];
let pass = 0;
for (const [t, want] of CASES) {
  const r = ruleRoute(t), got = r.pick ? `${r.pick.tool}:${r.pick.mode}` : 'none';
  const ok = got === want; if (ok) pass++;
  console.log(`${ok ? 'ok  ' : 'MISS'} ${got.padEnd(20)} ${Math.round(r.confidence * 100)}% ${r.area || '-'}  ${t}${ok ? '' : `  (wanted ${want})`}`);
}
const s = split('use the persona [[local]]she is 22 and goth[[/local]] with token: abc123456 and sk-ant-api03-xxxxxxxxxxxxxxxx');
console.log('\nsplit out:', s.out, '\nsecrets removed:', s.secrets, '\nrejoined:', rejoin('code uses [[KEPT-LOCAL-1: x]] here', s.held));
import * as P from './parts.mjs';
import * as TG2 from './tags.mjs';
import { think, isPrivate } from './think.mjs';
const sp = P.plan('Make me a game where you run a tavern, guests come in and order drinks, you serve them and get paid, and use cel shaded visuals like my Breneland trees. The barkeep is named Grum and he is grumpy but kind.');
const brief = P.codeBrief(sp, { id: 'x', repo: 'me/game' });
const SPLIT = [
  ['rules go to code', sp.mechanics.length === 3],
  ['look goes to art', sp.art.length === 1 && /cel shaded/.test(sp.art[0])],
  ['Grum goes to story', sp.story.length === 1 && /Grum/.test(sp.story[0])],
  ['no art or story words in the brief', !/grum|grumpy|barkeep|cel shaded|trees/i.test(brief)],
  ['brief asks for the merge manifest', /hub-merge\.json/.test(brief) && /```hub-merge/.test(brief)],
  ['slots found: character, place, dialogue, names', ['character', 'environment', 'dialogue', 'names'].every(t => sp.slots.some(x => x.type === t))],
  ['labelled lines go where they say', (() => { const q = P.plan('code: a timer counts down\nart: neon city\nstory: the courier is late'); return q.mechanics.length === 1 && q.art.length === 1 && q.story.length === 1; })()],
  ['proper names in rules become ids', (() => { const q = P.plan('Make a game where you chase Vexa through the market'); return q.mechanics[0].includes('entity_1') && !q.mechanics[0].includes('Vexa'); })()],
  ['style words are stripped from rules', (() => { const q = P.plan('Make a game where a cute toon frog jumps between lily pads'); return !/cute|toon/.test(q.mechanics[0]); })()],
  ['bad files are rejected at merge', P.checkFile('character', Buffer.from('nope')) && P.checkFile('names', Buffer.from('{}')) && !P.checkFile('names', Buffer.from('{"entities":[]}'))],
];
import { vet } from './vet.mjs';
const v1 = vet('Hubbell: fix the bug where the kiosk shows the old build, plan the kaizen event for receiving next week, and I am so pissed at my supervisor');
const v2 = vet('SUI: the bag frame overlaps the minimap');
const v3 = vet('Note: buy milk');
SPLIT.push(
  ['"lighthouse at sunset, 2 images realistic" is one picture job, no Planner part', (v => v.parts.length === 1 && v.parts[0].tool === 'image')(vet('lighthouse at sunset, 2 images realistic'))],
  ['the Split screen puts a picture request on the art side', P.plan('lighthouse at sunset, 2 images realistic').mechanics.length === 0],
  ['a story and pictures still go to two places', vet('write a story about a lighthouse keeper and draw 2 pictures of the lighthouse').parts.length === 2],
  ['"draw 2 pictures" is not the overtime draw (no work project)', !PJx.match('write a story about a lighthouse keeper and draw 2 pictures')],
  ['a Hubbell request is private, so only the PC model plans it', isPrivate('Hubbell: kaizen ideas', { tags: TG2.read('Hubbell: kaizen ideas') })],
  ['with no model free, Go still splits by the rules', (await think('write a story about a lighthouse keeper and draw 2 pictures of the lighthouse', {})).parts.length === 2],
  ['"give her red hair and a sundress" goes to the Doll tool', (await import('./route.mjs')).ruleRoute('give her red hair and a sundress').pick.tool === 'doll'],
  ['the doll check drops unknown fields and words', (L => L.hairStyle === 'bob' && L.hat === undefined && L.bust === undefined && L.hips === 1)((await import('./companion.mjs')).cleanLook({ hairStyle: 'bob', hat: 'red', bust: 'lots', hips: 4 }))],
  ['skill check: "find a free model for a lamp" logs free-model-intake used, recording-booth not used', (L => L.includes('skill free-model-intake: used') && L.some(l => l.startsWith('skill recording-booth: not used')))((SKx => SKx.logLines(SKx.ruleCheck ? { lines: SKx.ruleCheck('find a free model for a lamp', SKx.all().skills) } : null).map(l => l.split(',')[0]))(await import('./skills.mjs')))],
  ['skill check: a task no skill covers picks none, and every skill still gets a line', (c => c.used.length === 0 && c.lines.length === (c.all))(await (async S => { const c = await S.check('what is the weather tomorrow', {}); return { ...c, all: S.all().skills.length }; })(await import('./skills.mjs')))],
  ['skill check: an unreadable PC folder is said, not hidden', (await (await import('./skills.mjs')).check('find a free model', {})).errors.some(e => /PC skill folders/.test(e))],
  ['skill dry run: 16 typical requests each pick the right skill (rules fallback)', await (async () => { const S = await import('./skills.mjs'); const T = [['fix the companion tab in brenebase so pasted pictures show', 'brenebase-change'], ['write an A3 for mispicks on the pick line', 'kaizen-a3'], ['the SUI bag frame throws a lua error', 'wow-addon'], ['make a realistic picture of a lighthouse at sunset', 'picture-prompts'], ['use meshy to make a 3D model of a barrel', 'meshy-3d'], ['the worker light is red and the companion is not responding', 'pc-troubleshooting'], ['find a free model for a lamp', 'free-model-intake'], ['record 40 voice lines for the shopkeeper', 'recording-booth'], ['give her red hair and a sundress', 'doll'], ['build a three.js game prototype as an artifact', 'threejs-artifact-game'], ['add background music to my web game without audio files', 'procedural-webaudio-score'], ['the controls feel floaty when turning', 'third-person-feel'], ['what is the weather tomorrow', ''], ['plan a kaizen event for the staging lane', 'kaizen-a3'], ['deploy brenebase and check it is live', 'brenebase-change'], ['add speech bubbles over villagers', 'jrpg-dialogue-scenes']]; for (const [t, w] of T) { const c = await S.check(t, {}); if (w ? !c.used.includes(w) : c.used.length) return false; } return true; })()],
  ['an add-on like "2 images" stays with its request', vet('a lighthouse at sunset, 2 images').parts.length === 1 && vet('a lighthouse at sunset, 2 images').parts[0].tool === 'image'],
  ['tag sets the project (Hubbell -> work)', v1.tags.project === 'work'],
  ['whole statement vetted into 3 parts', v1.suggest === 'parts' && v1.parts.map(p => p.tool).join() === 'coder,expert,companion'],
  ['SUI tag -> sui project, tag removed from text', v2.tags.project === 'sui' && !/SUI/.test(v2.tags.rest)],
  ['a colon after ordinary words is not a tag', !v3.tags.found.length],
  ['game with art suggests Split', vet('Breneland: make a fishing minigame where you cast and reel, and use cel shaded visuals like my trees').suggest === 'split'],
);
import * as PJx from './projects.mjs';
SPLIT.push(
  ['content-limit notes left off cards', PJx.cards().every(c => JSON.stringify(c.rules || []).search(/sexual|off limits|tasteful/i) < 0)],
  ['content-limit notes left off live notes', PJx.extract('## Known issues\n- Tasteful: the camera never looks from below\n- Room clipping in windows').length === 2 && PJx.extract('## Known issues\n- Tasteful: the camera never looks from below\n- Room clipping in windows').filter(i => PJx.allowed(i.text)).length === 1],
);
process.env.PORT = '0'; process.env.DATA_DIR = process.env.DATA_DIR || (await import('os')).tmpdir() + '/brenebase-test';
const { speakable } = await import('./server.mjs');
SPLIT.push(
  ['voice skips actions, keeps words', speakable('*sighs* Yeah, that sucks.') === 'Yeah, that sucks.'],
  ['voice skips code, links and paths', !/const|https|server\.mjs/.test(speakable('Run this:\n```js\nconst a = 1;\n```\nsee https://x.dev and C:\\a\\b\\server.mjs'))],
  ['code or JSON only: no voice job at all', speakable('```\ncode\n```') === '' && speakable('{"a": 1}') === ''],
);
const UPx = await import('./updates.mjs');
UPx.add('---\nproject: brenebase\n---\n## Broken\n- The Claude key on Brenebase is rejected (401)', { key: 'fx1' });
UPx.add('---\nproject: brenebase\n---\n## Fixed\n- Claude key on Brenebase works now', { key: 'fx2' });
SPLIT.push(['## Fixed clears the matching broken note', !UPx.list('brenebase').some(u => u.broken.some(b => /Claude key/.test(b)))]);
let sOk = 0; for (const [n, ok] of SPLIT) { if (ok) sOk++; console.log(`${ok ? 'ok  ' : 'MISS'} split: ${n}`); }
pass += sOk; const total = CASES.length + SPLIT.length;
console.log(`\n${pass}/${total} as expected`);
process.exit(pass === total ? 0 : 1);
