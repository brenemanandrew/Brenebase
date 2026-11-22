---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Go button, thinking split, parts that wait for each other
---
## Done
- Send tab: one Go button. Brenebase reads the whole request, plans the parts, shows the plan; Run sends it. Each part's tool and text can be changed, parts added or removed
- think.mjs: a model works out the split (fewest parts, one tool each, each part told only what its tool needs, the coder never gets art, story or private details) and which parts must wait for another part's result
- Private requests (a private project such as work, a Hubbell or work tag, or [[local]]) are planned by the PC model only, never Claude. Others use Claude, then the PC model; if neither answers, the rules split it as before
- Parts that wait: a part with needs starts when the parts it needs are done, with their results handed on; if one fails it is marked failed with the reason
- Status strip on Send (in progress, need a look, PC worker offline), tap to jump. Ctrl+Enter is Go
- Manual tool picking and the game split moved under "More options"
- Fixed a false match: the single word "draw" sent picture requests to the work project; project keywords now match whole words only

## Tested
- Fake PC model: a Hubbell request was planned on the PC model (local), 2 parts, part 2 waited for part 1 and got its result, parent card done
- Headless Chromium: Go shows the plan (rules path, no model here), Run sends the parts, no page errors
- node test.mjs 54/54

## Not tested
- Planning with the real Claude key and the real PC model
- On Andrew's phone

## Open
- The plan is only as good as the model's JSON; a bad plan falls back to the rules
