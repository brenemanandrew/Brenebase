---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Pictures made by Brenai Studio on the PC (Z-Image Turbo, Illustrious XL, MiniMax-H3)
---
## Done
- Images modes Realistic (Z-Image Turbo), Anime (Illustrious XL), From a reference (MiniMax-H3), all run by Brenai Studio on the PC, free, no OK needed
- Router: pictures go to Studio (anime words to Illustrious, reference to H3, else Z-Image); Meshy only when named; Wizra herself still to her own renderer; asking for realistic and anime makes one job each
- Worker: queues api('image') in Studio, follows its job list with live progress, fetches the files and brings them back (Jobs and the results window, with Download)
- Look inside Brenai Studio also reads imageParams() and imgEngine() to confirm field names (STUDIO_FIELDS can override without a PC update)

## Tested
- Stand-in Studio: queued, followed, file fetched and shown; both-styles request made two jobs with count and aspect ratio; 47 checks pass

## Not tested
- Real Studio: the field names (engine, count, aspect_ratio) are a best guess until the Look confirms them
