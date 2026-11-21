---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: First deploy: brenebase.fly.dev is live
---
## Done
- Actions > Brenebase Deploy run 3 succeeded: app and volume created, secrets copied, deployed

## Tested
- https://brenebase.fly.dev answers 200 with the Brenebase page
- API refuses without login (401); PC installer is served; server code is not (404)

## Not tested
- Logging in, a real Copilot job with the Claude Opus check, the PC agent, Tailscale

## Open
- First real test: log in, send a Copilot research job, paste the answer back, check the Opus box
- PC setup (install the agent), Tailscale secrets, make this repo private
