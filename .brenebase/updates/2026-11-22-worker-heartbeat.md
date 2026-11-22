---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Worker stays online during long jobs, runs jobs side by side
---
## Done
- PC worker sends a heartbeat every 10 seconds, so a long job no longer makes it show offline
- Jobs run side by side (up to 4); Claude Code, merge, Blender and PC scripts still run one at a time
- Companion replies no longer wait behind a Studio picture or a Claude Code job
- Tool checks at start (claude, blender, git) are async with a 15 second limit, so a slow one cannot freeze the worker
- Time limits on the PC model call (5 min) and hub calls; the result is re-sent up to 5 times if the hub is briefly unreachable
- PC tab Worker card shows what the worker is working on
- Worker logs a line before its start-up checks, so a stuck start shows in Log
- PC tab Worker card shows the worker's last log lines when it is offline, and short hashes of the worker and agent files on the PC

## Fixed
- Worker showed offline while "running" on the PC (it was stuck inside a long job and stopped checking in)
- Jobs sat queued for 8 hours: the old worker had no time limit on the PC model check or chat call, so one hung call froze it for good while it still looked "running"

## Tested
- Local hub plus worker with a fake Studio that never finishes and a fake PC model: companion answered in about 2 s while the picture job was still running; worker stayed online with the job listed as busy
- node test.mjs 48/48

## Not tested
- On Andrew's PC

## Open
- Why the real Studio picture job does not finish (field names for Studio's image call are still guesses)

## Done (later the same day)
- Split fix: "lighthouse at sunset, 2 images realistic" is one picture job; the subject no longer goes to the Planner on its own. Add-ons of several words ("2 images in anime style") now stay with their request in both Send as parts and the Split screen
- "and draw / paint / show ..." now starts a new part

## Tested (later the same day)
- Worker went green on Andrew's PC after the deploy and Update now (screenshot)
- 3 new checks in test.mjs for the split fix; node test.mjs 51/51
- Companion: messages sent to the PC model are cleaned so user and reply take turns (unanswered messages in a row are joined). Fixes LM Studio "Unable to generate parser for this template" 400. If a template still refuses, it retries with the instructions folded into the first message
- Studio pictures: a job counts as finished on "finished", "complete", "success" and similar, or when it has files and its note says saved. Fixes the lighthouse job staying "Working" after Studio saved the image
- Tested with a fake strict template and a fake Studio that answers "finished" and "1/1 image(s) saved": both now finish; 51/51 checks
