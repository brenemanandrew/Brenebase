---
name: doodle-to-map-and-worldbook
description: Turn loose spoken world-building notes and a photographed hand-drawn map into an organized world document with a clean SVG map and code-drawn concept sketches. Use when someone shares fantasy setting ideas, a pencil map photo, or asks for a world bible, atlas or concept art without an image generator.
---

# World notes and doodle to atlas

## Organizing the notes
- Keep the author's facts separate from your inventions. Mark every invented name or idea with a visible "suggested" chip and list them in the reply.
- Structure: the world in one paragraph, map, lands and peoples (one card each), story seed (hero, hook, theme), concept sketches, format recommendation, open questions.
- Voice-dictated names are guesses: say so and ask.
- Handle dark backstory soberly and without detail. Swap slurs for in-world names and say why in one line.
- End with the few questions that most change the next step.

## Tracing a photographed map
- Work out orientation from the handwriting (text reading down the photo means the page is rotated). Define one transform, e.g. `mapX=(py-450)*0.676, mapY=(900-px)*0.8`, and express every feature in photo pixels.
- Coastline: about 55 hand-picked points, then three rounds of Chaikin smoothing.
- Borders as polylines; build region polygons from a border plus the far page edges and clip them to the coast path.
- Read the legend and reproduce each symbol (town, castle, dock, trading post, mountain, tree, lake, river, special hazards). Keep unnamed places unnamed. Drop your earlier invented names if the author did not draw them.
- List anything you had to guess (a label you could not read, a mark you interpreted) and ask.

## Concept sketches without an image tool
- Generate SVG scenes in Python: sky gradient, layered noise ridges with atmospheric color shift, simple prop shapes, silhouettes for creatures (silhouettes forgive crude drawing).
- Say clearly they are mood sketches, not concept art, and name what tool or credits would unlock real art.

## Delivery
- Publish as one artifact page with inline SVG. Check one screenshot per figure, fix overlaps (labels off the coast, tiny grid cells), and say which fixes were not re-checked.
