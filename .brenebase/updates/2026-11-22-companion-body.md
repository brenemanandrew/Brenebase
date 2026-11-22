---
project: brenebase
by: Claude Code (cloud session)
date: 2026-11-22
branch: main
title: Companion full body, look editor, pictures, icon row
---
## Done
- Companion drawn full body in the same cel style (one drawing: the portrait is the head and shoulders, the full view shows all of her)
- Tap her portrait (or the expand icon) for a full screen view with her latest reply and a message box
- Look editor: hairstyles (long, wavy, bob, ponytail, twin tails, bun, pixie), tops (hoodie, tee, tank, sweater, blouse, crop top, dress), bottoms (jeans, leggings, skirt, shorts), shoes (boots, sneakers, flats), glasses, colours for every part, body sliders (shoulders, bust, waist, hips, legs) and a bounce slider; live preview, kept on Save
- Arms move for gestures in her replies (wave, cheer, arms crossed, hands on hips, shrug, clap and more); chest and hair tails follow body movement through springs set by the bounce slider
- Settings are a row of round icons (edit, read aloud on or off, send a picture, full view, clear); the conversation modes stay as text pills
- Pictures: send her a picture from the chat (shrunk to 1280 px on the phone). A vision model reads it, then she answers what it shows. Default reader is the PC (LM Studio vision model, found by type vlm, or VISION_MODEL); a setting lets Claude read them instead. "What she sees" is shown under the picture
- Worker: node and other .exe files given by full path run without a shell on Windows, fixing "'C:\Program' is not recognized" on the Brenai picture job

## Tested
- Headless Chromium: editor changes redraw the preview, Save keeps the look, portrait tap opens the full view, a picture shows in the chat and is stored; no page errors
- Fake LM Studio with a vision model: the picture was described by the vision model and the chat model answered using the description
- node test.mjs 54/54

## Not tested
- On Andrew's phone and PC; no vision model is known to be installed in his LM Studio yet
- Claude as the picture reader (no key in the test sandbox)

## Open
- If LM Studio has no vision model she says she cannot see it, with a note on what to download

## Done (later the same day)
- Send tab: a row of project pills (Any project, then each project). The picked one is used for planning and for the jobs sent, and is remembered
- Companion reactions per body part (hair, face, nose, shoulders, arms, hands, chest, belly, hips, legs, feet): for each, a face, a move, a line she says in a bubble, and an optional action sent to her so she answers. Stored as Andrew writes them. Used when he taps that part in the full view
- More body sliders: arms and thighs (with shoulders, bust, waist, hips, leg length, bounce)

## Tested (later the same day)
- Headless Chromium: project pills show and the pick is kept; a shoulder reaction saved, a tap on her shoulder in the full view showed the face, the move and the bubble and sent the action; no page errors; node test.mjs 54/54
