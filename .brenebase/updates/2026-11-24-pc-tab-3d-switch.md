---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-24
branch: main
title: PC tab: graphics card switch (Wizra or 3D model maker), plainer layout
---
## Done
- Hunyuan3D (the 3D model maker) added to the PC agent: started from F:\Projects\Hunyuan3D\start_hunyuan3d.bat (HUNYUAN_BAT overrides), up when 127.0.0.1:8081 answers (HUNYUAN_PORT overrides), stopped with its whole process tree; never started with Windows or by Start everything
- One switch for the graphics card: Wizra or 3D model maker. Switching to 3D (after a confirm that says Wizra goes offline and the first start takes about 5 minutes) stops the Wizra bridge, unloads her model, then starts the 3D model maker; switching back stops it, loads her model and starts her bridge. Nothing is unloaded unless Andrew presses it
- While the 3D model maker has the card: loading her model is refused, the worker refuses pictures and PC model jobs with a plain "switch to Wizra, then Retry", and does not reload her model after pictures
- PC tab rebuilt: Your PC (state, Update), Graphics card (the switch), What is running (Wizra's model, Wizra bridge, 3D model maker, Brenebase worker, picture reader), each with one state (on, starting, failed, off) and one button, and a log icon; abilities, file versions, the worker's last lines and Start or Stop everything moved into Diagnostics
- The agent reports its state about every 10 s (was 30 s); a stopped helper shows off, not failed
- Note reads of the same repo with git take turns (parallel fetches or clones clashed)

## Tested
- Agent in the sandbox with a stand-in 3D server that answers after 6 s: start without the switch refused; switch to 3D: starting, then on; loading her model refused in 3D; switch back: off. Emulated Pixel 7: the PC tab shows the rows, the switch, the confirm and the answer; no page errors
- Worker in 3D mode: a companion message got "The 3D model maker has the graphics card right now..." note
- node test.mjs 62/62

## Not tested
- The real Hunyuan3D server and LM Studio on Andrew's PC (Windows taskkill, the .bat through cmd, the 10 GB first start)
