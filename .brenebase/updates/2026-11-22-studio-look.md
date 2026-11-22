---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Brenai Studio API mapped; Look inside Brenai Studio (read-only)
---
## Done
- Studio's requests found on Andrew's PC: image, jobs, gallery, models, config, state, llm/status, llm/launch, llm/mode, llm/chat, llm/unload, storyboard, director, extend, local/video, manga/*, train/*, loras (all through /api/<path> with header x-studio: 1)
- PC tab: Look inside Brenai Studio reads config, models, state, LLM status, jobs and the code that builds the image request (changes nothing)
- Studio requests from the worker carry the x-studio header

## Tested
- Stand-in Studio: header seen, settings read, image-request code found; 44 checks pass

## Open
- Wire Images (anime to Illustrious XL, realistic to Z-Image Turbo, reference to MiniMax-H3) and the Studio's LLM control into Brenebase
