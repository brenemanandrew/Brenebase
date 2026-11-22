---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Worker runs its scripts with its own Node, not "node" from the PATH
---
## Fixed
- On Andrew's PC node is not on the PATH, so scripts started as "node" failed; the renderer and PC scripts now use the worker's own Node (process.execPath)

## Not tested
- On Andrew's PC (needs the installer rerun after deploy)
