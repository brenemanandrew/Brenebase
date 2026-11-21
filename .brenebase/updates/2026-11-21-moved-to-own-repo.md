---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Brenebase moved to its own repo, brenemanandrew/Brenebase
---
## Done
- Everything from Brenelandtest/hub moved to the top of this repo, with its update files and a CLAUDE.md
- Deploy workflow at .github/workflows/deploy.yml reads this repo's secrets (the BRENEBASE_ANTRHOPIC_KEY spelling is also accepted)
- Stray test output (hub-merge.json, src/) removed

## Tested
- 35 checks pass here

## Open
- This repo needs a Fly token secret (BRENEBASE_FLY_TOKEN) before the first deploy
