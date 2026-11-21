---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Pictures of Wizra come from Brenai's own renderer; Restyle with Meshy uses them as reference
---
## Done
- Images mode "Wizra's real model (Brenai)": PC worker runs worker/render-brenai.cjs (adapted from brenai/tools/picpack/gen2.cjs) and calls avatar.snapshot on brenai.fly.dev
- Sheet requests make front and back in T-pose (arm bones zeroed to the model's rest pose, hips turned for the back)
- Restyle realistic / anime buttons send a render to Meshy image to image as the reference (data URL)
- Pictures stored on the Brenebase volume, served only after login; installer fetches the renderer
- Router: a picture of Wizra goes to her real model; other concept art to Meshy

## Tested
- 39 checks pass, including Andrew's T-pose request routing to Wizra's real model
- With a stand-in PC result: job queued for the PC with front and back specs, pictures stored and shown, 401 without login, Restyle made a Meshy edit job waiting for OK

## Not tested
- The renderer against the live Brenai (needs Playwright and a Brenai cookie jar on the PC); whether the T-pose bone values and back view look right
- Meshy image to image with a data URL reference

## Open
- Ask Andrew whether the Brenai Studio PC app has its own image builder to harvest
