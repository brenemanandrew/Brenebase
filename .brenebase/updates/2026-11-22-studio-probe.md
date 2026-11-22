---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Find Brenai Studio on the PC, to wire Brenebase to its image models
---
## Done
- PC tab: Find Brenai Studio. The worker checks the usual local ports for the Brenai Studio page and lists the request paths and fields its page uses (the report shows them)
- Brenai Studio (Illustrious XL, Z-Image Turbo, MiniMax-H3; also Video, Manga, Models) lives only on Andrew's PC, not in any repo or on Drive

## Tested
- Against a stand-in Studio page: found it, listed /api/generate, /api/jobs/, /api/models and the fields model, prompt, aspect, count; 44 checks pass

## Open
- Run it on Andrew's PC with Brenai Studio open, then wire image jobs to its real API
