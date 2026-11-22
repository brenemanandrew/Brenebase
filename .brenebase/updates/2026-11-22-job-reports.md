---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Every job ends with a report; live status and output; Check status and Retry; the worker clones a missing repo
---
## Done
- Report on every finished or failed job: Done, Tested, Not tested, Blocked (with the fix in plain words), Next
- Live status while a PC job runs: the step it is on and how long it has run; split jobs show parts done, running, waiting, failed
- Output box with the worker's live output, then Claude Code's full answer and the change list
- Check status and Retry buttons on every job
- Worker clones the repo into REPOS when it is not on the PC (REPOS can point at existing copies instead)

## Tested
- Real worker with a stand-in Claude Code: repo cloned from GitHub, live step and output seen while running, report with Claude's summary, tested and not tested, branch; phone screenshot; 43 checks pass

## Not tested
- On Andrew's PC with real Claude Code
