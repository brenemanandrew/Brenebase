---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: PC agent starts the worker by itself at login
---
## Fixed
- PC agent connected by polling, model loads remotely (seen on the live PC tab)

## Done
- The agent starts the Brenebase worker when it starts (AGENT_AUTOSTART=off to stop that)

## Not tested
- On Andrew's PC (comes with the next installer run after deploy)

## Open
- Andrew's PC runs an old worker (no tts or find-by-name): rerun the installer
- Claude Code not on the PC yet (npm missing); use irm https://claude.ai/install.ps1 | iex
