---
name: brenebase-change
description: Change Brenebase itself (brenebase.fly.dev, repo brenemanandrew/Brenebase) safely from edit to live - server, page, PC worker or agent, skills, project cards - and prove it. Use when asked to fix, add or redesign anything in Brenebase, its tabs, its companion, its PC worker or its deploy. Not for the Brenai app (use brenai-change) or the Breneland game (use the Breneland skills).
---

# Change Brenebase

## Where things are
- `server.mjs` (all routes, jobs, the skill check), `public/index.html` (the whole page, plain JS), `public/companion-avatar.js` (her drawing).
- `worker/hub-worker.mjs` (runs on the PC: PC model, pictures, Claude Code, readers), `pc/brenebase-agent.mjs` (starts and updates the worker, LM Studio, helpers).
- `think.mjs` (planner), `skills.mjs` + `skills/` (skills), `companion.mjs`, `projects/*.json` (cards), `tools.mjs` (tool list), `route.mjs`, `vet.mjs`, `parts.mjs`.
- `test.mjs` must pass before every commit (`node test.mjs`).

## Rules that each caused a real problem
- The Dockerfile copies `*.mjs`, `public/`, `worker/`, `pc/`, `projects/`, `skills/`. A new top-level folder must be added there, or the live app crashes on start (it did: the site was down until fixed).
- The PC gets new worker and agent files from `/pc-files/manifest.json` (sha1 per file). After a deploy Andrew taps **Update now**; the PC tab shows the short hashes, so compare them.
- The page is not updated by Update now: tell Andrew to reload (Ctrl+F5, or close and reopen the tab on a phone).
- A process killed by a signal keeps `exitCode` null: track helpers by their exit event, never by `exitCode` alone.
- On Windows, run an .exe by its full path without a shell (spaces in `C:\Program Files` split commands).
- The PC tab redraws every 15 s: anything shown after a button must be kept in a variable and drawn by the redraw.
- The companion and anything private run on the PC model only; Work (Hubbell) context never goes to Claude or Copilot.

## Steps
1. Read the code you will change and its neighbours. Keep the style: short functions, plain JS, comments that say why.
2. Make the change. Add a check to `test.mjs` when it is logic that can be checked without a browser.
3. Test in the sandbox: start `server.mjs` with a scratch `DATA_DIR`, and for PC paths run `worker/hub-worker.mjs` against it with fakes (a fake LM Studio on 127.0.0.1:1234, a stand-in sd-cli via `SD_CLI`, test skill folders via `SKILL_DIRS`). Drive the page with headless Chromium (Playwright) and look at a screenshot.
4. Write `.brenebase/updates/<date>-<name>.md` (see project-update-file) and commit on main with the attribution lines.
5. Deploy only when Andrew says so: run the "Brenebase Deploy" workflow, then confirm live by fetching the page or the manifest and finding the new code or hash.

## Report
Outcome first. Done, tested (how), not tested, what Andrew must do (reload, Update now, a PC step). Short; he reads on his phone.
