---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Images tool (Meshy concept art, edits, Copilot) and a clear message when the Claude key is rejected
---
## Done
- New Images tool: Concept art (Meshy text to image, one picture per style asked for, turnaround sheet wording for front and back / T-pose), Edit an image (Meshy image to image), Image in Copilot (copy and paste)
- Router: 2D picture requests (illustration, concept art, character sheet, turnaround, realistic or anime image) go to Images, not 3D or the Planner
- Meshy refresh handles several pictures per job and shows them
- A rejected Claude key (401) now says how to fix it

## Tested
- 38 checks pass, including Andrew's T-pose request routing to Images: Concept art
- Meshy text to image request shape confirmed against Meshy's validation (no credits spent); model gpt-image-2-5-sunburst is valid

## Not tested
- A real Meshy image job (spends credits; needs BRENEBASE_MESHY_KEY on Brenebase)
- The image-to-image picture field name (reference_image_urls) on a real run

## Broken
- The Claude key on Brenebase is rejected (401 invalid bearer token); the secret value needs replacing

## Settings changed
- MESHY_IMAGE_MODEL (optional, default gpt-image-2-5-sunburst)
