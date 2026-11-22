---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Step 1 of running the image and movie models in Brenebase
---
## Done
- PC tab button "Find image and movie engines": the worker reports the program behind Brenai Studio's port 7860, engine programs (sd-cli and similar), model files over 50 MB in Studio's folder and F:\AI, C:\AI, D:\AI, and the lines in Studio's code that start or configure an engine. Reads only

## Tested
- Sandbox: the job runs and finds an engine line in a test Studio folder; node test.mjs 54/54

## Not tested
- On Andrew's PC

## Open
- Step 2: the worker runs those engines directly (no Studio), and an Images screen in Brenebase picks model, size, count and steps. Needs the report from step 1
