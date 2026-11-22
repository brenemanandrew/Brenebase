---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Results window: the companion relays finished jobs, with downloads, and answers questions about them
---
## Done
- Floating companion bubble on every screen (its name and colours), badge for new results, pulses when one arrives
- Chat window: each finished or failed job with its short report and next step; pictures with Download; audio player and Download; text answers with Show and Download (.md); failed jobs with Retry
- Ask about this: questions go to the PC model with that job's request and result as context; answers kept in the companion's Results conversation
- /api/inbox (newest first) and /api/inbox/ask

## Tested
- Phone-size browser: badge showed 3 new results, the window listed a plan, a picture and a failed fix, a question was answered by a stand-in PC model and shown; 44 checks pass

## Not tested
- With the real PC model; videos (Brenai Studio video results not wired yet)
