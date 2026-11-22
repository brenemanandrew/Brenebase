---
name: palette-atlas-recolor
description: Make many texture variations of low-poly models that use a shared palette atlas, by repainting regions on a canvas at runtime. Covers character outfits (skin, hair, cloth), building roof and plaster looks, and tintable grey ground tiles. Use when models need variety without new art. Not for the companion doll (use doll) or Breneland wearables (use fit-a-wearable).
---

# Palette atlas recolor

Low-poly packs color their meshes by pointing UVs at flat or gradient swatches in one atlas. Repaint the swatches and every mesh using them changes.

## Find the layout first
- Dump which atlas cells each mesh part uses: read `TEXCOORD_0`, bucket into the grid (KayKit characters: 16 x 8 cells of 64 x 128 px), print cell + sampled color + count per node.
- KayKit Adventurers layout (all five characters agree): skin = cols 0-1 rows 0-1, hair = cols 2-3 rows 0-1, main cloth = cols 0-3 rows 2-3, accent = cols 4-5 rows 2-3. The Mage also has arm skin at col 15 row 5.

## Character outfits
- Draw the base image to a 256 px canvas (small is fine for gradients and saves GPU memory).
- `reg(x0,x1,y0,y1,color)`: for each pixel set `color * (luminance / regionAverageLuminance)`. This keeps the shading gradient and swaps the hue.
- Skin: multiply the skin block by a tone factor. Accent: only recolor saturated pixels so fur and metal stay.
- A look = `{cloth, accent, hair, skinIndex}`. Ten looks across four body types rarely repeat in a crowd.
- Special looks: brighten low-saturation pixels for white armor; give one mesh (a cape) its own material from a second look.
- Cache by `model+look`: one `CanvasTexture` (`flipY=false`) and one material each for skinned and rigid meshes.

## Building looks
- Buildings in a faction color keep that color in a hue band (blue 190-255, yellow 36-68, green 85-178, red 338-22 wrapping).
- Per pixel in HSV: inside the band and saturated -> set hue to the look's target, scale saturation and value; low saturation and bright -> plaster tint multiply; hue 10-45 with saturation -> timber, scale value.
- Pick the look per building with a position hash so it is stable. Give each town its own list of looks. A `fade` flag (saturation x0.6) makes a sun-bleached town.

## Ground tiles
- Convert CC0 cartoon tiles to greyscale, normalize the mean to about 208, posterize to 5 to 7 levels, store as small PNG data URIs.
- Use as `map` with the biome color as material color: one tile works for green, gold and purple ground.
- Preload the images before cloning textures, or clones upload with no image.
- Sources that work from the sandbox: OpenGameArt (check the license line on each page; CC0 sets used: "4 cartoony terrains textures" by Pompei2, "Cartoon Outdoor Tileable Textures" by allen yatsura).
