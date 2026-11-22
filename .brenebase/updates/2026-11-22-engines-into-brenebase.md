---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Pictures run by Brenebase itself, Images tab
---
## Done
- PC tab "Find image and movie engines" (reported: sd-cli.exe and sd-server.exe in F:\AI\minimax-h3\sd-cli, Illustrious XL + SDXL VAE, Z-Image Turbo Q8 + Qwen3-4B + ae, the manga LoRA, MiniMax-H3 video models)
- Worker backend sd-image: runs stable-diffusion.cpp directly with those files (Z-Image Turbo, Illustrious XL, Illustrious + manga LoRA), one run per picture with its own seed, progress shown live, pictures sent back. Brenai Studio is not needed
- Images tab: prompt, model, shape, how many, steps, and under More the negative prompt, seed and guidance; recent pictures below with Retry
- Image tool modes realistic, anime and the new manga use the worker; routing, the planner's tool list, the PC tab text and the Brenebase project card updated
- PC tab "Read the movie engine's options": sd-cli --help plus the notes next to it, to wire MiniMax-H3 up exactly
- SD_CLI and IMG_MODELS can point elsewhere (env on the PC)

## Tested
- Stand-in engine in the sandbox: the Images tab sent 2 anime portrait pictures, the worker ran the engine with the Illustrious model, VAE, steps 28, guidance 6, euler_a, 832x1216, two seeds, and both pictures showed; node test.mjs 56/56

## Not tested
- The real sd-cli on Andrew's PC: the flags follow stable-diffusion.cpp's documented options (--diffusion-model, --llm, --vae, -m, --cfg-scale, --steps, --sampling-method, --lora-model-dir, -W, -H, -s, -o, -n, --diffusion-fa); his build is a custom one for MiniMax-H3 and may differ

## Open
- MiniMax-H3 movies still go through Brenai Studio until the engine's options are read
