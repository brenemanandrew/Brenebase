---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Fixed sections in update files; answers shown formatted
---
## Fixed
- Claude key on Brenebase works now (a real Planner answer came back after the new key was deployed)
- Login refused the right password with no message (now trimmed and says Wrong password)

## Done
- Update files can have a ## Fixed section; it clears matching broken and open notes from earlier updates of the same project, so agents stop being told old problems
- Answers show headings, bold, lists (with indents) and code formatted instead of raw marks

## Tested
- 43 checks pass (1 new for Fixed); formatted answer checked in a phone-size browser

## Not tested
- Not deployed yet

## Open
- PC agent still offline on the live site (PC key on the PC and BRENEBASE_PC_KEY must match, then start the agent)
