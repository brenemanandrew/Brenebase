---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Probe lists every Brenai Studio api(path, body) call
---
## Done
- Brenai Studio sends every request through api(path, body): fetch('/api/' + path), POST when there is a body, header x-studio: 1. Seen so far: api('manga/projects'), api('loras')
- Probe now lists every api('...') call with the keys it sends (apiCalls)

## Fixed
- Agent self-update works on Andrew's PC (the new probe ran after the restart)

## Open
- Run the probe again (the PC updates itself within 10 minutes of the deploy), then wire Images to the Studio's image calls
