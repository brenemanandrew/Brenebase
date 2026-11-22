---
name: pc-troubleshooting
description: Find out why something on Andrew's PC side of Brenebase is not working - the PC, Model or Worker light is red, a job sits at Waiting for the PC, the companion does not answer, a picture job fails, the PC tab shows old file hashes - and get it running again. Use when Andrew reports that Brenebase is stuck, offline, not responding, or shows an error from the PC. Not for changing Brenebase's code (use brenebase-change).
---

# PC troubleshooting (Brenebase)

## What the lights mean
- PC: the agent (`pc/brenebase-agent.mjs`, scheduled task "Brenebase agent") answers. Red: PC off or asleep, or the task stopped (`Start-ScheduledTask -TaskName "Brenebase agent"`).
- Model: LM Studio has a model loaded. Red: tap Load on the PC tab.
- Worker: the worker (`worker/hub-worker.mjs`) checked in during the last 30 s. Red with the agent saying "running": the worker is stuck or is an old copy; Update now restarts it.

## Order of checks
1. PC tab: are the "PC files" hashes the ones just deployed? If not, tap Update now and wait 30 s.
2. Worker card: its list of abilities. A job needs its backend there (sd-image for pictures, pc-model for the companion, skills-list for skills).
3. Tap Log next to Brenebase worker; the last lines say where it stopped.
4. Jobs tab: the job's error, in plain words, and Retry.
5. Page looks old: reload the page (Ctrl+F5, or close and reopen the tab on a phone). Update now does not update the page.

## Known causes, already fixed once
- An old worker left running answers with old code: the agent now stops stray workers when it starts one.
- A worker killed by an update counted as running forever: fixed by tracking the exit event.
- `'C:\Program' is not recognized`: an .exe path with a space run through a shell; run it by full path without a shell.
- `lms get` "No staff picks found": give LM Studio a full Hugging Face address.
- A job from before an update stays "running": it is failed by itself after 10 quiet minutes, or Cancel it and run it again.

## Rules
- Never ask Andrew to paste a secret. Never kill Blender or LM Studio processes you did not start.
- One step at a time, with what he should see after it.
