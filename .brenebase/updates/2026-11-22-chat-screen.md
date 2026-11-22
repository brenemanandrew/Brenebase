---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: One chat screen that works out the jobs, runs them and shows the results
---
## Done
- New Chat tab, the screen Brenebase opens on: one box (type, talk, paste a picture). Each message goes to the planner with the skills searched; the parts start by themselves; results show in the conversation (pictures, answers, links, audio, doll looks, branches) with a green bar while working. Anything that spends credits or ships waits with "OK, run it"; Retry, Make again, Cancel, Merge and deploy or Hand over on each part
- /api/chat (POST a message, GET the conversation for a tab); the parts code is shared with Send as makeParts
- Project notes: "Get help" became "Check it" (for "not verified" items: a check-and-fix job) or "Fix it", sent to the chat with the project picked
- The project pills and the status strip moved to the Chat screen; the floating results bubble hides on Chat (results are in the conversation)
- Picture counts read "2 anime pictures" and "two photos", not only "2 pictures"

## Tested
- Emulated Pixel 7 with a stand-in picture engine: opens on Chat; "make 2 anime pictures of a lighthouse at sunset" ran by itself and showed 2 pictures with Make again; "use meshy to make a 3D barrel" waited with OK, run it and the meshy-3d skill; no page errors; node test.mjs 61/61

## Not tested
- With Claude planning on the live site, and on Andrew's phone
