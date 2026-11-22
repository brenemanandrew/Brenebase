---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Companion: picture reading setup, paste pictures, faster editor, outfit changes from chat
---
## Done
- PC tab: "Get a picture-reading model" downloads Qwen2.5-VL 7B through LM Studio (lms get, in the background; VISION_GET can name another) and "Vision log" shows progress. The worker finds it by its type (vlm)
- The PC vision model is asked to describe everything in a picture plainly, adult content included (only the local model; the Claude reader's prompt is unchanged)
- The chat model is now named in every PC model request, so a loaded vision model is never used for her replies
- Paste or drop a picture into her chat box (and the full view box)
- Editor redraws no longer pile up: each redraw starts on a fresh element (old animation loops and touch handlers end) and slider moves redraw once per frame
- Outfit changes stick: everyday words are mapped to the doll's own (sundress to dress, pigtails to twin tails, heels to flats, red to a colour code); a model answer without a "look" wrapper is accepted
- Asking her in chat to change ("put on a yellow sundress") runs the doll skill on the PC model, saves the new look, notes it in the chat and redraws her
- PC tab "How does Studio read pictures?": reads Brenai Studio's model status, config and the page code around image_url, vision, mmproj, caption, llm/chat, so Brenebase can use the same reader

## Tested
- Fake PC model: 20 slider moves left one drawing; "put on a yellow sundress" changed her to a yellow dress, the note showed and the drawing updated; no page errors; node test.mjs 59/59

## Not tested
- lms get on Andrew's PC (the model name and the -y flag); a real vision model; how Studio reads pictures (needs the new probe's output)

## Fixed
- PC tab buttons looked like they did nothing: the answer box was redrawn hidden right after every button (the tab redraws itself). The last answer now stays on screen. Tested in headless Chromium
- Paste or drop a picture into the Send box (it goes with the request: Claude jobs see it, PC model jobs get it read first, picture jobs start from it) and into the Images prompt (picture-to-picture with stable-diffusion.cpp -i and --strength, slider "How much to change it"). Tested: both previews show, the engine got -i and --strength 0.6
- The PC picture reader is told it is unrestricted and to describe explicit content plainly (local model only)
- Fixed: "Get a picture-reading model" failed ("No staff picks found"): lms get only searches staff picks by short name. It now uses full Hugging Face addresses, tried in order: lmstudio-community Qwen2.5-VL 7B (URL, then repo name), then Gemma 3 12B
- Companion chat in Brenai's format: a light page with dark ink, a round picture by each name (her portrait), speech in Patrick Hand, *actions* and her "She ..." narration as Bangers pills (pink for her, purple for Andrew), notes small and grey. Fonts copied from brenai/public/fonts (Brenelandtest main). Tested in headless Chromium: actions split out, font loaded, no page errors
- Fixed: on phones the page was laid out wider than the screen (the tab row did not fit), so the browser shrank everything and left empty space on the right. The tab row now scrolls sideways and takes its own line on narrow screens; the page never runs wider than the screen; content goes up to 1100 px wide on a PC (was 720). Tested on an emulated Pixel 7: page width equals the screen on every tab
- Progress as a green bar that fills (percent, "Picture 2 of 3", "loading the model" or "drawing") instead of the engine's #### lines; picture, voice and PC model jobs no longer show raw output; a failed picture shows the error in one or two plain lines. Retry on failed jobs, Make again on finished pictures (a new job, the old pictures stay). Tested with a stand-in engine: the bar moved, no raw output, Make again added a card
