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
