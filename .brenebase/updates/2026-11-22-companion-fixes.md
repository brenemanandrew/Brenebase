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
