---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Talk to text toggle on the Send screen
---
## Done
- Talk button: toggled on, it keeps listening (restarts after browser pauses) and types into the box; tap again to stop; never sends by itself
- Spoken "colon", "comma", "period", "question mark", "new line", "open local" / "close local"

## Tested
- With a stand-in speech recognizer in a phone-size browser: "SUI colon the bag frame" then "overlaps the minimap" became "SUI: the bag frame overlaps the minimap", it restarted after the pause, tapping off stopped it, and Route it picked the SUI project
- 37 checks pass

## Not tested
- A real microphone on Andrew's phone
