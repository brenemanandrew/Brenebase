/* The tool catalogue. Every tool Andrew has built (or uses) is one entry with a generic TYPE and a set of MODES.
   The router picks a tool and a mode; the mode decides how the work is handled. Add a tool by adding an entry here.

   Fields
     id        short name used everywhere
     type      think | make3d | motion | workapp | ship
     name      what Andrew sees
     runsOn    cloud (this server) | pc (the hub worker on his PC) | browser (opens a page) | meshy (Meshy API)
     backend   which adapter in adapters.mjs runs it
     built     what already exists in his repos that this tool wraps
     modes     { id: { label, does, backend?, runsOn?, words: [hint words for the router] } }
               a mode can override backend and runsOn
     gate      'always' = always waits for Andrew's OK, whatever the autonomy setting
*/

export const AUTONOMY = {
  ask:   'Show the plan and wait for my OK before anything runs',
  draft: 'Run the safe part (writing, planning, previews), wait for my OK before anything is changed or spent',
  auto:  'Run it and bring me the result (never used for ship tools or spending credits)',
};

export const AREAS = {
  work:     { label: 'Work',     words: ['hubbell', 'kaizen', 'lean', 'a3', 'gemba', '5s', 'shift', 'roster', 'overtime', 'kiosk', 'plant', 'line', 'supervisor', 'team lead', 'meeting', 'boss', 'manager', 'kpi', 'sop', 'audit', 'arden', 'safety', 'cross training', 'warehouse', 'dc'] },
  hobby:    { label: 'Hobbies',  words: ['game', 'breneland', 'wizra', 'brenai', 'three.js', 'model', 'mesh', 'animation', 'rig', 'texture', 'art', 'sprite', 'level', 'npc', 'character', 'outfit', 'hair', 'blender', 'meshy', 'mocap', 'shader', 'cel', 'tree', 'plant asset'] },
  personal: { label: 'Personal', words: ['feel', 'feeling', 'angry', 'pissed', 'mad', 'sad', 'tired', 'stressed', 'vent', 'rant', 'rage', 'lonely', 'anxious', 'frustrated', 'roleplay', 'pretend'] },
};

export const TOOLS = [
  {
    id: 'coder', type: 'think', name: 'Coder', runsOn: 'pc', backend: 'claude-code',
    what: 'Code work. Goes to Claude Code with anything private kept back, results come back as a branch or a patch.',
    built: ['Claude Code sessions on brenemanandrew repos', 'AGENTS.md / CODING.md rules in each repo'],
    modes: {
      brief:  { label: 'Brief only', does: 'Write a ready-to-paste Claude Code prompt (private parts kept back). Nothing runs.', backend: 'brief', runsOn: 'cloud', words: ['prompt for claude', 'brief'] },
      build:  { label: 'Build',  does: 'New feature: Claude Code on the PC works on a branch, never main.', words: ['add', 'build', 'make a', 'feature', 'implement', 'create a page', 'new button', 'make me a game', 'a game where', 'make a game', 'minigame', 'mini game'] },
      fix:    { label: 'Fix',    does: 'Find and fix a bug on a branch, with a test or a screenshot as proof.', words: ['fix', 'bug', 'broken', 'error', 'crash', 'not working', 'doesnt work', "doesn't work", 'fails'] },
      review: { label: 'Review', does: 'Read code or a diff and report problems. Changes nothing.', words: ['review', 'check my code', 'look over'] },
      script: { label: 'Script', does: 'A small one-off script (PowerShell, Python, Node, Blender Python).', words: ['script', 'powershell', 'automate', 'batch file', '.ps1', 'macro'] },
    },
  },
  {
    id: 'planner', type: 'think', name: 'Planner', runsOn: 'pc', backend: 'pc-model',
    what: 'Turns a goal into steps, owners, dates and a next action. Files the plan where it belongs.',
    built: [],
    modes: {
      plan:      { label: 'Project plan', does: 'Goal, scope, milestones, risks, next three actions.', words: ['plan', 'project', 'roadmap', 'milestone', 'timeline', 'scope'] },
      breakdown: { label: 'Break down',   does: 'Split one big thing into small tasks sized for a day or less.', words: ['break down', 'steps', 'where do i start', 'todo', 'to do', 'tasks'] },
      week:      { label: 'My week',      does: 'Fit tasks into the week around work shifts.', words: ['schedule', 'this week', 'calendar', 'when should i', 'prioritize', 'priority'] },
      retro:     { label: 'Look back',    does: 'What went well, what did not, what to change.', words: ['retro', 'look back', 'went wrong', 'lessons'] },
    },
  },
  {
    id: 'expert', type: 'think', name: 'Professional expert', runsOn: 'pc', backend: 'pc-model',
    what: 'Answers as a specialist. The mode is the specialty. Work data can be set to stay on the PC model.',
    built: [],
    modes: {
      kaizen:  { label: 'Kaizen / lean', does: 'Lean tools: A3, 5 whys, fishbone, value stream, standard work, 5S, kaizen event plans.', words: ['kaizen', 'lean', 'a3', '5 why', 'five why', 'fishbone', 'root cause', 'value stream', 'waste', 'muda', '5s', 'standard work', 'gemba', 'continuous improvement'] },
      pm:      { label: 'Project management', does: 'Intelligent project planning: critical path, risk, RACI, status reports.', words: ['raci', 'critical path', 'status report', 'stakeholder', 'risk register', 'gantt'] },
      ops:     { label: 'Operations (Hubbell)', does: 'Shift, staffing, overtime, safety, SOPs. Uses what the overtime kiosk knows.', words: ['hubbell', 'overtime', 'staffing', 'roster', 'sop', 'safety', 'shift', 'cross training', 'labor'] },
      game:    { label: 'Game design', does: 'Mechanics, loops, balance, pacing, feel.', words: ['game design', 'mechanic', 'gameplay', 'balance', 'loop', 'progression', 'quest'] },
      art:     { label: 'Art and animation', does: 'Look, style, colour, posing, timing. Advice, not files (files are the 3D and Motion tools).', words: ['art style', 'color palette', 'colour', 'composition', 'silhouette', 'timing', 'spacing', 'appeal', 'anatomy'] },
    },
  },
  {
    id: 'doll', type: 'make3d', name: 'Doll', runsOn: 'pc', backend: 'doll',
    what: 'Makes or edits a cartoon doll like the companion (hair, clothes, colours, body shape, reactions) with the doll skill on your PC model. No cloud model. Nothing is kept until you open it and Save.',
    built: ['skills/doll.md (the doll skill)', 'public/companion-avatar.js (the drawing)'],
    modes: {
      edit: { label: 'Change the companion', does: 'Changes the companion: "give her red hair and a sundress".', words: ['give her', 'change her', 'make her', 'her hair', 'her outfit', 'dress her', 'companion look', 'her look', 'when i tap'] },
      new:  { label: 'New doll', does: 'Makes a new doll from a description and keeps it in your saved dolls when you Save.', words: ['new doll', 'make a doll', 'doll of', 'make a character doll'] },
    },
  },
  {
    id: 'companion', type: 'think', name: 'Companion', runsOn: 'pc', backend: 'pc-model',
    what: 'Your PC model (the Wizra brain). Nothing leaves the PC. Vent, rage, roleplay, think out loud.',
    built: ['brenai/bridge/wizra-bridge.mjs (PC model through Bionic on port 1234)', 'brenai persona and memory'],
    modes: {
      chat:     { label: 'Just talk', does: 'Easy conversation.', words: ['talk', 'chat', 'hey'] },
      vent:     { label: 'Vent',      does: 'Lets you rage. Agrees it sucks, does not lecture, does not fix unless asked.', words: ['vent', 'rant', 'rage', 'pissed', 'angry', 'mad', 'hate', 'sick of', 'fed up', 'frustrated', 'furious'] },
      roleplay: { label: 'Roleplay',  does: 'Plays a character or a scene you set up. Can rehearse a hard conversation.', words: ['roleplay', 'role play', 'pretend', 'act as', 'scene', 'in character', 'practice a conversation', 'rehearse'] },
      coach:    { label: 'Coach',     does: 'Calm, practical, asks what you want out of it.', words: ['advice', 'what should i do', 'stressed', 'anxious', 'overwhelmed', 'tired'] },
    },
  },
  {
    id: 'copilot', type: 'think', name: 'Copilot', runsOn: 'cloud', backend: 'copilot',
    what: 'Your personal Microsoft Copilot (copilot.microsoft.com) for plain, safe, non-sensitive work: summaries, rewrites, drafts, research, long documents. A fit check blocks anything private, personal, adult, or real coding. Complex answers are checked by Claude Opus before you get them, with its corrections listed.',
    built: ['Microsoft Copilot (personal) by copy and paste', 'Claude Opus review of complex answers'],
    modes: {
      summarize: { label: 'Summarize', does: 'Shorten something long into the points that matter.', words: ['summarize', 'summarise', 'summary of', 'tl dr', 'tldr', 'boil down', 'with copilot', 'use copilot'] },
      rewrite:   { label: 'Rewrite / proofread', does: 'Clean up wording, fix grammar, change tone.', words: ['proofread', 'reword', 'rewrite this', 'clean up this', 'fix the grammar', 'make this sound'] },
      draft:     { label: 'Draft', does: 'First drafts of emails, posts, descriptions, lists.', words: ['draft a', 'draft an', 'write an email', 'write a message', 'welcome message', 'write a description', 'product description'] },
      research:  { label: 'Research', does: 'General knowledge questions and comparisons, nothing private.', words: ['compare', 'what is the difference', 'explain how', 'look into', 'research'] },
    },
  },
  {
    id: 'image', type: 'make2d', name: 'Images', runsOn: 'pc', backend: 'meshy',
    what: '2D pictures: realistic, anime and manga on your PC (free), from a pasted picture too; Meshy concept art (spends credits, waits for OK) or Copilot by copy and paste.',
    built: ['Brenai picture renderer (avatar.snapshot, as used by the picture pack)', 'Meshy text to image and image to image (on your account)', 'Microsoft Copilot image creation'],
    modes: {
      model:   { label: "Wizra's real model (Brenai)", does: "Renders her actual 3D model with Brenai's own picture renderer on your PC: front and back, T-pose or a pose, any face. Free and exact. Add Restyle with Meshy for a realistic version.", backend: 'pc-run', runsOn: 'pc', words: ['render wizra', 'render her', 'her model', 'wizra model', 'snapshot of wizra'] },
      realistic: { label: 'Realistic (Z-Image Turbo, your PC)', does: 'Brenebase runs Z-Image Turbo on your PC (stable-diffusion.cpp): realistic photos and art, free. Brenai Studio is not needed.', backend: 'sd-image', runsOn: 'pc', words: ['realistic', 'photo of', 'photoreal', 'photograph', 'lifelike'] },
      anime:     { label: 'Anime (Illustrious XL, your PC)', does: 'Brenebase runs Illustrious XL on your PC: anime and stylized art, free.', backend: 'sd-image', runsOn: 'pc', words: ['anime', 'cel shaded image', 'cel-shaded picture', 'stylized picture', 'waifu'] },
      manga:     { label: 'Manga (Illustrious XL + manga LoRA, your PC)', does: 'Illustrious XL with your manga-style LoRA, on your PC.', backend: 'sd-image', runsOn: 'pc', words: ['manga style', 'manga panel', 'manga page', 'black and white manga'] },
      h3:        { label: 'From a reference (MiniMax-H3, Brenai Studio for now)', does: 'MiniMax-H3 through Brenai Studio until Brenebase runs it itself (next step). Slow.', backend: 'studio-image', runsOn: 'pc', words: ['reference image', 'like this picture', 'from this reference'] },
      concept: { label: 'Concept art (Meshy)', does: 'New picture(s) from words. Asking for several styles (realistic and anime, for example) makes one picture per style.', words: ['illustration', 'concept art', 'concept image', 'image of', 'picture of', 'drawing of', 'character sheet', 'reference sheet', 'turnaround', 'front and back', 'realistic image', 'anime looking', 'anime style image', '2d', 'portrait of', 'artwork', 'key art', 'mood board'] },
      edit:    { label: 'Edit an image (Meshy)', does: 'Change a picture you give it (link): pose, outfit, proportions, style.', words: ['edit this image', 'edit the image', 'change this picture', 'change the image', 'make this picture', 'from this image', 'restyle'] },
      copilot: { label: 'Image in Copilot', does: 'Copilot makes the picture (free, copy and paste). SFW only.', backend: 'copilot', runsOn: 'cloud', words: ['image in copilot', 'copilot image', 'copilot picture'] },
    },
  },
  {
    id: 'make3d', type: 'make3d', name: '3D', runsOn: 'meshy', backend: 'meshy',
    what: 'Models and assets. The mode picks Meshy, Blender, code or the checker (see route.mjs pick3d for the rules).',
    built: ['Meshy API (text, image, retexture, rigging)', 'pipeline/scripts/*.py (29 Blender scripts: fit, decimate, convert, rig, morph)', 'pipeline/jstest/piece.mjs + psheet.py (render checker)', 'brenai/public/props.js (38 code-built props)', 'Brenerig (brenerig.fly.dev)'],
    modes: {
      generate:   { label: 'Generate (Meshy)',  does: 'A new model from words, or from a picture when Meshy is named. Preview first (cheap), refine only after OK.', words: ['generate', 'new model', 'make a model', 'model of', 'from a photo', 'meshy', 'text to 3d', 'asset', 'prop', 'creature'] },
      blender3d:  { label: 'Picture to 3D in Blender (your PC)', does: 'A pasted picture becomes a 3D model in the Blender you have open, made by the 3D model maker (Hunyuan3D) on your PC. Free. Needs Blender open with its "Take jobs from other tools (Brenebase)" box ticked, and the PC tab switched to 3D model maker.', backend: 'blender-3d', runsOn: 'pc', words: ['turn this picture into a 3d model', 'image to 3d', 'make a 3d model from this picture', 'picture to 3d', 'photo to 3d', 'into a 3d model', 'from this picture'] },
      retexture:  { label: 'Retexture (Meshy)', does: 'New paint on an existing model, cel shade or style change.', words: ['retexture', 'repaint', 'texture', 'cel shade', 'cel-shade', 'toon', 'recolor', 'recolour', 'reskin'] },
      rigstudio:  { label: 'Rig by hand (Brenerig)', does: 'Your browser rig and pose studio: place joints, bind, pose, chains with physics, export GLB. Free.', backend: 'link', runsOn: 'browser', words: ['brenerig', 'rig studio', 'pose it', 'rig by hand', 'fix the rig', 'chain physics'] },
      rig:        { label: 'Rig (Meshy)',       does: 'Auto-rig a humanoid so it can take Mixamo-style motion.', words: ['rig', 'skeleton', 'bones', 'auto rig', 'skin weights'] },
      process:    { label: 'Process (Blender)', does: 'Headless Blender on the PC: decimate, convert, clean, bake, fit to a body.', backend: 'blender', runsOn: 'pc', words: ['decimate', 'reduce', 'polycount', 'poly count', 'convert', 'fbx', 'glb', 'obj', 'bake', 'uv', 'clean up', 'fit', 'morph', 'shrink', 'compress', 'merge', 'blender'] },
      breneland:  { label: 'Breneland fit',     does: 'Character builder pipeline: fit a garment or hair to the two bodies (fit_wear, shell, snug_hair).', backend: 'blender', runsOn: 'pc', words: ['garment', 'clothing', 'outfit', 'shirt', 'pants', 'hairstyle', 'fit to body', 'shell'] },
      procedural: { label: 'Build in code',     does: 'Simple shapes built in Three.js code (like the 38 props). Sent to the Coder.', backend: 'claude-code', runsOn: 'pc', words: ['in code', 'procedural', 'simple shape', 'low poly prop', 'build it in three'] },
      check:      { label: 'Check',             does: 'Render close views and measure problems (holes, clipping, underlayer).', backend: 'pc-run', runsOn: 'pc', words: ['check', 'render', 'how does it look', 'clipping', 'holes', 'screenshot', 'inspect'] },
    },
  },
  {
    id: 'motion', type: 'motion', name: 'Motion', runsOn: 'browser', backend: 'link',
    what: 'Animation. Generic to the target rig: VRM (Wizra) or the 66-bone Mixamo rig (Breneland).',
    built: ['brenai/public/mocap.html + mocap.js (camera, video, photo, face, fingers, tongue)', 'brenai/tools/clipconv.mjs (Mixamo FBX to clip)', 'pipeline/scripts/retarget_mixamo.py', 'Meshy animations API'],
    targets: { vrm: 'Wizra and other VRM models (clip JSON, 30 fps)', mixamo66: 'Breneland bodies, 66-bone Mixamo skeleton (GLB animation)' },
    modes: {
      capture:  { label: 'Capture (mocap)',  does: 'Act it out: camera, a video or photos through the mocap page.', backend: 'link', runsOn: 'browser', words: ['mocap', 'motion capture', 'record me', 'act it out', 'my moves', 'from a video', 'from video', 'film myself', 'webcam'] },
      library:  { label: 'Library',          does: 'A stock move (walk, run, sit, dance) from Mixamo or Meshy, converted to the target rig.', backend: 'pc-run', runsOn: 'pc', words: ['walk cycle', 'run cycle', 'walk animation', 'run animation', 'jump animation', 'dance animation', 'sit animation', 'idle animation', 'mixamo', 'stock animation', 'cycle'] },
      retarget: { label: 'Retarget',         does: 'Move an existing clip onto the other rig.', backend: 'blender', runsOn: 'pc', words: ['retarget', 'onto the other', 'to vrm', 'to mixamo', 'other skeleton'] },
      handkey:  { label: 'Hand-made in code', does: 'Small gestures, fidgets and idles written in code (like Wizra\'s 25 gestures). Sent to the Coder.', backend: 'claude-code', runsOn: 'pc', words: ['gesture', 'fidget', 'blink', 'wave', 'nod', 'shrug', 'small motion', 'procedural animation'] },
    },
  },
  {
    id: 'workapp', type: 'workapp', name: 'Overtime kiosk', runsOn: 'browser', backend: 'link',
    what: 'ardenot.fly.dev, the Weekend Overtime kiosk. The hub links to it; it never sends kiosk data to an outside model.',
    built: ['ardenot repo: server.js, lib/roster.js, dashboard-pc scripts'],
    modes: {
      open:   { label: 'Open kiosk',   does: 'Open the kiosk.', words: ['kiosk', 'overtime kiosk', 'open the kiosk', 'overtime sign up', 'ot board'] },
      roster: { label: 'Roster',       does: 'Upload or check the cross training roster.', words: ['roster', 'cross training spreadsheet'] },
      change: { label: 'Change kiosk', does: 'A code change to the kiosk. Sent to the Coder with the ardenot repo.', backend: 'claude-code', runsOn: 'pc', words: ['kiosk change', 'change the kiosk', 'kiosk bug', 'draw rule'] },
    },
  },
  {
    id: 'ship', type: 'ship', name: 'Ship', runsOn: 'pc', backend: 'pc-run', gate: 'always',
    what: 'Deploys. Always waits for your OK. Breneland-Next is locked until you unlock it.',
    built: ['.github/workflows/*-deploy.yml (Fly)', 'fly.toml in each app'],
    locked: ['breneland-next', 'breneland.fly.dev'],
    modes: {
      test:   { label: 'Test copy', does: 'Run it locally or as a test build. Changes nothing live.', words: ['test build', 'try it', 'preview'] },
      deploy: { label: 'Deploy',    does: 'Push to main or fly deploy. Only after OK.', words: ['deploy', 'ship', 'go live', 'push to main', 'publish', 'release'] },
    },
  },
];

export const tool = id => TOOLS.find(t => t.id === id);

/* The backend and where it runs for a tool + mode, with mode overrides applied */
export function resolve(toolId, modeId) {
  const t = tool(toolId); if (!t) return null;
  const m = t.modes[modeId] || Object.values(t.modes)[0];
  const mode = t.modes[modeId] ? modeId : Object.keys(t.modes)[0];
  return { tool: t.id, mode, backend: m.backend || t.backend, runsOn: m.runsOn || t.runsOn, gate: t.gate || null, label: `${t.name}: ${m.label}`, does: m.does };
}
