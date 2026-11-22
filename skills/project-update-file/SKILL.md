---
name: project-update-file
description: Write the Brenebase update file that every change to one of Andrew's projects must carry (.brenebase/updates/<date>-<name>.md), so Brenebase keeps its project notes current. Use at the end of any job that changes code, data or settings in breneland, brenai, work, brenerig, brenebase, sui or valinfor. Not for chat answers that change nothing.
---

# Project update file

Every change to a project is committed together with one file: `.brenebase/updates/<YYYY-MM-DD>-<short-name>.md`, on the same branch.

## Format
```
---
project: breneland | brenai | work | brenerig | brenebase | sui | valinfor
by: <who did it, e.g. Claude Code via Brenebase job 1a2b3c>
date: <YYYY-MM-DD>
branch: <branch>
title: <one line>
---
## Done
- ...
## Fixed
- ... (clears the matching Broken note from earlier updates)
## Tested
- what was run and the result, with counts
## Not tested
- ...
## Broken
- ...
## Open
- ...
## Settings changed
- names only
```
Leave out a section that has nothing in it.

## Rules
- Never write a password, PIN, token or key, or its value. Name a secret, never its value.
- Plain words, no em dashes. Each bullet is one fact a later reader can act on.
- "Tested" is only what was actually run. Anything assumed goes under "Not tested".
- No repo to commit to (a claude.ai chat, or work on the PC outside git): save the same file in the Google Drive folder `Brenebase/updates`.
- Content limits on Andrew's own games are not written into update files.
