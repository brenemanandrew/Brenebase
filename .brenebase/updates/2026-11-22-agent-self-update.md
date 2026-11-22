---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: PC agent keeps itself and the worker up to date
---
## Done
- /pc-files/manifest.json lists a hash per PC file
- The agent checks every 10 minutes (and 5 s after starting), downloads changed files, checks their hash, restarts the worker, and replaces itself when the agent file changed (AGENT_UPDATE=off to stop)
- Agent retries its port while an older copy lets go

## Fixed
- Repeated reinstalls were needed and still left an old worker running (after one more reinstall, updates arrive by themselves)

## Tested
- Stale worker file: replaced within seconds and the worker restarted
- Stale agent file: new agent started, old one exited, the new one answered on the same port
- 44 checks pass

## Not tested
- On Windows
