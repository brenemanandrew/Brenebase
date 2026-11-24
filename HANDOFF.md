# Brenebase handoff (24 Nov 2026)

Written at the end of a long build session whose context was nearly full. Start a fresh session in this repo and read this first, then README.md and CLAUDE.md.

## State
- main is pushed. Last commit: ae1b336 (PC tab graphics card switch). NOT deployed yet: deploy when Andrew says "deploy" (Actions > Brenebase Deploy, or the PC tab's Deploy button once BRENEBASE_DEPLOY_TOKEN exists). After a deploy that changes worker/ or pc/, Andrew taps Update on the PC tab and reloads the page (Ctrl+F5).
- node test.mjs: 62/62.
- Live on brenebase.fly.dev before this: Chat screen, PC-model planning (Claude only for code and the Copilot check), skills (repo skills/ plus the PC's skill folders), picture models on the PC, companion, wardrobe, doll skill.
- Waiting in ae1b336 and 4d896cf: Brenelandtest notes read on the PC with git (pc-git sources), the Wizra / 3D model maker switch, the cleaner PC tab.

## Next task (asked by Andrew via the Brenai session): send picture-to-3D jobs to Blender on his PC
The Blender add-on (brenemanandrew/Brenelandtest main, pipeline/blender/image_to_3d_addon.py) has an opt-in listener, local only, 127.0.0.1:8082 (port set in the add-on's preferences, box "Take jobs from other tools (Brenebase)"):
- GET / -> {"ok": true, "busy": bool, "service": "local"|"meshy"}  (is Blender open and listening)
- POST /job -> {"id"}  body {"image_base64": "..."} (data: prefix fine) or {"image_path": "C:\\..."}, optional name, texture (bool, default true), detail ("draft"|"normal"|"fine"), seed, polycount (0 = model decides), pose (Meshy only). Up to 60 MB.
- GET /job/<id> -> {"status": "queued"|"working"|"importing"|"done"|"error", "text", "objects": [names]}
One job at a time; about 36 s shape only, 65 s with colours; gives up at 15 minutes. Needs Blender open with the box ticked AND Hunyuan3D on (PC tab switch: 3D model maker; Wizra's model is then unloaded).

Suggested build:
1. tools.mjs: make3d mode "blender3d" (label "Picture to 3D in Blender (your PC)"), backend "blender-3d", runsOn pc. Route words: "turn this picture into a 3D model", "image to 3d", "make a 3d model from this picture".
2. adapters.mjs PC_BACKENDS add "blender-3d"; worker can.push('blender-3d').
3. worker/hub-worker.mjs backend "blender-3d": check GET http://127.0.0.1:8082/ (plain error if not answering: "Blender is not open, or its 'Take jobs from other tools (Brenebase)' box is off"); check the 3D model maker answers on 127.0.0.1:8081 (plain error: "The 3D model maker is off: PC tab, switch to 3D model maker"); POST /job with image_base64 from the job's pasted picture (server already saves pasted pictures: job.pic, read with picB64 in server.mjs start(); pass it as j.image64 like pc-model does) plus name/detail/texture; poll /job/<id> every 3 s with progress(j, status); done -> text "Added to the open Blender scene: <objects>".
4. server.mjs start(): for backend blender-3d put image64 from j.pic into the queued job (same as the pc-model branch). Without a picture, fail with "Paste or attach a picture".
5. The worker's GPU rule: blender-3d needs mode 3d (gpu-mode.txt = "3d"), the opposite of pictures and chat.
6. Test with a mock Blender on 8082 and a stand-in on 8081; add a route check to test.mjs; write the update file.

## Open items
- Tell the Brenai session (session_01AhHjg4qmBJ5iaLhfFrRkFz) when things land: this cloud session cannot message it (needs a trusted device), so Andrew relays.
- Mini PC (RTX 3070, 8 GB) as a picture-only worker: offered, not started. Needs per-PC job lists and 3070 engine settings (text encoder on CPU, --vae-tiling).
- BRENEBASE_DEPLOY_TOKEN secret (Brenebase repo only, Actions and Contents read and write) makes the Deploy button work.
- MiniMax-H3 video still goes through Brenai Studio until its options are read (PC tab, Diagnostics, Read the movie engine's options).
