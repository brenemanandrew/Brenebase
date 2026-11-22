---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Doll skill on the PC model
---
## Done
- skills/doll.md: the doll skill. Everything a doll is made of (colours, styles, body numbers, reactions), how to turn words into values, and the JSON to answer with, with examples. Read by the PC model; no cloud model
- Look editor: "Describe it" box runs the skill on the PC model and puts the result into the editor (kept only on Save); saved dolls (save the current look as a named doll, tap one to load it)
- New Doll tool on Send (modes: change the companion, new doll); the planner and rules route "give her red hair..." and "make a new doll..." to it; the job card has "Open in the look editor"
- Every answer is checked: unknown fields, unknown words and out-of-range numbers are dropped (cleanLook, cleanReactions in companion.mjs, shared with Save)
- Dockerfile copies skills/

## Tested
- Fake PC model answering in the skill format: the editor applied the change, kept the name, saved a doll, Save stored it; bad values were dropped; a Doll job from Send finished with the result; node test.mjs 56/56 (2 new checks)

## Not tested
- With Andrew's real PC model (how well Violet Lotus follows the JSON format)
