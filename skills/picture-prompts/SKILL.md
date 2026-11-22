---
name: picture-prompts
description: Write and tune prompts and settings for Andrew's local picture models run by Brenebase (Z-Image Turbo, Illustrious XL, Illustrious with the manga LoRA, picture-to-picture from a pasted image). Use when asked for a picture, image, photo, realistic or anime art, a better render, a character sheet, a restyle, or when a picture came out wrong (blurry, extra fingers, wrong style, ignored the prompt). Not for 3D models (use meshy-3d) or for her cartoon doll (use doll).
---

# Picture prompts for the local models

The models run on Andrew's PC through stable-diffusion.cpp (Images tab, or image jobs). They are his; what he makes with them is his call.

## Pick the model
| Want | Model | Notes |
|---|---|---|
| Photo, realistic, painterly | Realistic (Z-Image Turbo) | 8 steps, guidance 1. Write plain sentences. Negative prompt does little. |
| Anime, cel shaded, stylized character | Anime (Illustrious XL) | 25 to 30 steps, guidance 5 to 7, euler_a. Tags work best. Use a negative prompt. |
| Manga, ink, black and white panel | Manga (Illustrious + LoRA) | Same as Illustrious; the LoRA is added at 0.8. |

## Writing the prompt
- Z-Image Turbo: describe the picture in 1 to 3 sentences: subject, what they are doing, where, light, camera ("close-up", "full body", "35 mm"). Put the most important thing first.
- Illustrious: comma-separated tags, most important first: `masterpiece, best quality, 1girl, solo, long black hair, purple eyes, hoodie, sitting, cafe, warm lighting, looking at viewer`. Character sheets: `character sheet, multiple views, front view, back view, side view, white background`.
- Negative for Illustrious: `lowres, bad anatomy, bad hands, extra fingers, missing fingers, text, watermark, blurry, jpeg artifacts`.
- Text in pictures: Z-Image handles short text in quotes better than Illustrious.

## Shape
Square 1024 x 1024, Portrait 832 x 1216, Landscape 1216 x 832, Phone 768 x 1344, Wide 1344 x 768. Full-body people want Portrait.

## Picture to picture
Paste the picture into the Images prompt. "How much to change it": 0.3 keeps the layout and fixes details, 0.5 to 0.6 restyles, 0.8 or more mostly ignores it.

## When it comes out wrong
- Blurry or mushy: more steps on Illustrious (30), or switch model.
- Ignored part of the prompt: move that part to the front, cut other details.
- Hands and faces: Illustrious negative prompt above; make several (How many: 4) and keep the best.
- Same picture every time: clear the seed.

## Report
Model, shape, steps, guidance, the final prompt, how many made, and which one is best and why.
