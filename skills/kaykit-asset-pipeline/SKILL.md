---
name: kaykit-asset-pipeline
description: Pull free CC0 low-poly fantasy models (KayKit by Kay Lousberg) and package them for a Three.js artifact: buildings, props, nature and animated characters. Use when a web game needs a consistent set of free 3D models.
---

# KayKit asset pipeline

## Getting the packs
- Public GitHub clones work even when the GitHub API is blocked: `git clone --depth 1 https://github.com/KayKit-Game-Assets/<repo>`.
- Known repos: `KayKit-Medieval-Hexagon-Pack-1.0` (221 models: buildings in blue/red/green/yellow, walls, props, trees, rocks, mountains), `KayKit-Character-Pack-Adventures-1.0` (Knight, Barbarian, Mage, Rogue, Rogue_Hooded, 76 animations each), `KayKit-Character-Pack-Skeletons-1.0`, `KayKit-Prototype-Bits-1.0`, `KayKit-Restaurant-Bits-1.0`, `KayKit-Furniture-Bits-1.0`.
- Read `LICENSE.txt` in the repo and confirm CC0 before shipping. Credit is optional.
- Kenney and Poly Pizza are blocked from the cloud sandbox; Quaternius pages load but have no direct download.

## Packaging (Python, no extra libraries)
- Buildings are `name.gltf` + `name.bin` + one shared palette PNG. Bundle `{g: gltf json with images/textures/samplers removed, b: base64 bin, bb: bounds from POSITION accessor min/max}` per model, plus the PNG once as a data URI.
- Characters are 3.6 MB GLBs because of 76 animations. Strip to the clips you need (Idle, Walking_A, Running_A, Sit_Chair_Idle): parse the GLB header, keep wanted animations, collect used accessors and bufferViews, repack the BIN, remap indices. Result is about 450 KB each.
- Write everything into one `models.js` (`window.KK=...`), about 8 MB for 62 models and 5 characters.

## Loading in three r128
- Set `window.createImageBitmap=undefined` while parsing so GLB textures load through `<img>` (blob URLs are allowed for images; `fetch(blob:)` may not be).
- Buildings: set `buffers[0].uri` to a data URI, `loader.parse(JSON.stringify(gltf))`, then assign one shared material with the atlas texture (`flipY=false`).
- Characters: `loader.parse(arrayBuffer)`, replace materials with your own (`skinning:true`), hide weapon nodes by name (`/^(1H_|2H_|Knife|Throwable|Spellbook|Mug)|Shield|Offhand/`).
- Instances: `THREE.SkeletonUtils.clone(scene)`, one `AnimationMixer` each, play all clips and blend with `setEffectiveWeight`.
- Set `frustumCulled=false` on every character mesh. Skinned bounds are wrong and characters vanish near the camera otherwise.

## Scale and layout
- Buildings are board-game size (a home is 0.8 wide, 0.93 tall): scale about 8 for people-sized towns, 5.6 for gnome houses. Collider radius = max xz extent * scale * 0.85.
- Characters: scale about 1.15 to stand 1.75 m. They are chibi (big heads).
- `wall_straight` is 2 units long along X; rotate 90 degrees to cross a road. `wall_straight_gate` is the opening.
- Faction colors map well to peoples (one color per culture).
