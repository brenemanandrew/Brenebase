---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Companion no longer waits forever: worker re-checks the model, Brenebase loads it, the tab says why
---
## Fixed
- Companion not responding: the worker only checked for the PC model when it started (at login, before LM Studio's server), so it never took companion messages. It now re-checks the model, Claude Code and the voice pack every minute

## Done
- Sending to the companion (or asking about a result) while the model is not loaded asks the PC agent to load it
- Companion tab says why a reply is not coming (worker offline, model not loaded, Studio in Coding mode, model slow)

## Tested
- 48 checks pass

## Not tested
- On Andrew's PC (arrives with Update now or within 10 minutes)
