---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Standing rule: content-limit notes are left off every card, live note and update
---
## Done
- CONTENT_LIMIT filter in projects.mjs: applied when cards load, to notes read from repos and masterfiles, and to update files (updates.mjs)
- Rule written into this repo's CLAUDE.md so future sessions keep it

## Tested
- 37 checks pass (2 new); a real sync of the Brenai masterfile and repo docs gives 35 notes with none of the limit notes; an update file with them keeps only the other lines

## Settings changed
- None
