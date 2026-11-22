---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Installer stops the running agent and worker before replacing them
---
## Done
- install-agent.ps1 stops the Brenebase agent task and only Brenebase's own node processes (hub-worker, brenebase-agent) before installing, so the new worker is the one that runs

## Broken
- On Andrew's PC the old worker kept running after a reinstall, so Retry still used it (manual stop and restart given)

## Not tested
- On Windows (no Windows machine here)
