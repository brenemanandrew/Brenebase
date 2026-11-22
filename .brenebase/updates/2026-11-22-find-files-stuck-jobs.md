---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: PC finds note files by name; stuck jobs say why; routing instructions kept out of Claude briefs
---
## Done
- Worker looks for a note file by name (allowed folders and the usual WoW installs) when it is not at the card's path, and Brenebase remembers the real place (moved-paths.json)
- Background note reads no longer show in Jobs; their errors show on the Projects card
- A queued job no online worker can do says why (for example Claude Code not installed on the PC)
- Split code part drops instructions aimed at Brenebase ("without giving Claude anything...", "don't tell Claude")

## Tested
- A note file put in a different folder was found by name, read without error and its real place saved; 43 checks pass

## Not tested
- On Andrew's PC (real Drive and WoW folders)

## Broken
- SUI.toc and the Breneland progress notes not at the guessed paths (should be found by name after deploy)

## Open
- Claude Code on the PC for Coder jobs (npm i -g @anthropic-ai/claude-code, then run claude once)
