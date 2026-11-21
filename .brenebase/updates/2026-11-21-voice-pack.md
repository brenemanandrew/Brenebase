---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Read aloud with Wizra's Kokoro voice pack
---
## Done
- PC worker speaks with Kokoro (onnx-community/Kokoro-82M-v1.0-ONNX, q8, CPU), reusing the copy start-wizra.ps1 installed in %USERPROFILE%\Brenai (WIZRA_DIR to override)
- Read aloud button on finished jobs; audio stored and served behind the login; plays on the phone
- Voice and speed settings on the Tools tab (default af_heart); long answers spoken in chunks

## Tested
- Real Kokoro in the cloud container: the worker turned a job's answer into an 8.8 s, 24 kHz WAV, served by Brenebase
- 39 checks pass

## Not tested
- On Andrew's PC (the Brenai copy of Kokoro should be found there)
- Playback on his phone

## Open
- The Brenai Studio PC app's image builders, if different from the two harvested (snapshot renderer, picture pack)
