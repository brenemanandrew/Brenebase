---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Pictures and the companion share the graphics card; cleanup pass
---
## Done
- Before pictures the worker unloads LM Studio's models (lms unload --all) so the picture engine has the graphics card; afterwards it reloads the chat model that was loaded (not the picture reader)
- Pictures and PC model jobs never run at the same time (they share the graphics card); the companion says "Your PC is drawing a picture; she answers as soon as it is done" while she waits
- The picture reader is unloaded right after it reads a picture
- Her chat model loads with 16k context by default (was 32k): plenty for her 24-message window, and it leaves the picture engine room. MODEL_CONTEXT on the PC overrides it

## Tested
- Fake LM Studio and a stand-in lms and sd-cli: unload before the picture, the companion waited with the drawing note, the chat model alone was reloaded after, then she answered. node test.mjs 61/61

## Not tested
- On Andrew's PC (real unload and reload times, his card's memory)

## Done (cleanup)
- Tools tab: one Settings card with icon rows (voice, Copilot check with its clean rate as a chip, connected services as green or red chips); Tags fold into chips with a remove button; each tool is a folded card with an icon, where it runs and its modes as chips, details when opened. 1,422 words down to 137
- Projects tab: each project is a folded card with a two-line summary and coloured chips (problems, open, works, unreadable notes); the full lists open on tap. 553 words down to 242
- PC tab: the Studio and engine buttons moved into one folded Diagnostics card; the picture reader row shortened
- Shared look: chips, folded cards and icon rows used the same way across tabs
- Images tool label says it runs on the PC (was Meshy), with an up to date description

## Tested
- Headless Chromium on an emulated Pixel 7: every tab drawn, screenshots looked at, no page errors; node test.mjs 61/61

## Fixed
- "Cannot find module F:\Projects\Brenelandtest\brenai\tools\clipconv.mjs": PC scripts ran from Andrew's own working copy, which can be behind or on another branch, and the clip converter needs the three package that nothing installed. PC scripts now run from the worker's own copy of the repo's latest main (<repo>-wt\_tools, detached, refreshed each run), and missing packages the script needs are installed there with --no-save. His working copy is never touched. Tested: a fresh copy on another branch stayed on it; the tools copy was made, three installed, the converter ran
- Clip converter: makes its in and out folders (REPOS\clips-in, clips-out) if missing; with no .fbx files it says "Nothing to convert: put your Mixamo .fbx animation files in ..." instead of crashing. Job reports show the line that says what went wrong, not the first line of a stack trace. Tested in the sandbox
- Clip converter: with an empty clips-in it looks for .fbx files in the usual places (Downloads, Desktop, Documents, OneDrive, F:\Projects, F:\AI, Mixamo and Animations folders), copies them in (originals stay) and converts them; the result lists what was found. Tested in the sandbox with a file in Downloads

## Done (deploy button, Get help)
- PC tab: a Brenebase card with Deploy Brenebase (asks to confirm, runs the "Brenebase Deploy" workflow) and the last deploy's state (live, failed or deploying, commit and time)
- Finished Brenebase code jobs: "Merge and deploy" (the PC pushes the job branch, Brenebase merges it into main on GitHub, then deploys). Other projects' code jobs: "Hand over" copies a note for that project's master session; jobs never merge or deploy other projects
- Get help on a project's problem or open item goes through the planner on Send with the project picked, as "Fix this in the <project> code: ...", so it lands on the Coder (it went to a mocap link before)

## Settings changed
- New optional repo secret BRENEBASE_DEPLOY_TOKEN (fine-grained, Brenebase repo only, Actions and Contents read and write), passed to Fly as DEPLOY_TOKEN by the deploy workflow. Without it the button explains what to add

## Tested
- Headless Chromium: the Deploy card shows the missing-token message; Get help opened Send with Coder: Fix and the Brenai project; node test.mjs 61/61

## Not tested
- A real deploy and a real merge from the button (no token in the sandbox); pushing a job branch from the PC
