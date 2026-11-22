---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Brenai Studio found at 127.0.0.1:7860; probe reads its full API list and calls
---
## Done
- Live probe on Andrew's PC found Brenai Studio at http://127.0.0.1:7860 (scripts app.js, manga.js, models.js, mic.js; fields width, height, aspect ratio, seed, steps, cfg, negative, model, image)
- Probe now also reads /openapi.json and the code around each /api/ call, and its report says plainly what it found
- Worker can send requests to Brenai Studio, only at its local address (STUDIO_URL, default http://127.0.0.1:7860)

## Tested
- Stand-in Studio that builds paths in pieces: probe listed POST /api/generate/{model} and GET /api/status from openapi.json and the real calls from app.js; 44 checks pass

## Open
- Run the new probe on the PC, then wire Images to Illustrious XL (anime), Z-Image Turbo (realistic), MiniMax-H3 (reference image)
