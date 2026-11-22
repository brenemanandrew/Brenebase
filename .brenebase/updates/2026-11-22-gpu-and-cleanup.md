---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Pictures and the companion share the graphics card; cleanup pass
---
## Done
- Before pictures the worker unloads LM Studio's models (lms unload --all) so the picture engine has the graphics card; afterwards it reloads the chat model that was loaded (not the picture reader)
- Pictures and PC model jobs never run at the same time (they share the graphics card); the companion says "Your PC is drawing a picture; she answers as soon as it is done" while she waits
- The picture reader is unloaded right after it reads a picture
- Her chat model loads with 16k context by default (was 32k): plenty for her 24-message window, and it leaves the picture engine room. MODEL_CONTEXT on the PC overrides it

## Tested
- Fake LM Studio and a stand-in lms and sd-cli: unload before the picture, the companion waited with the drawing note, the chat model alone was reloaded after, then she answered. node test.mjs 61/61

## Not tested
- On Andrew's PC (real unload and reload times, his card's memory)
