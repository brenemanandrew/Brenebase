---
name: free-model-intake
description: Bring a free (CC0) 3D model into Breneland as a prop or set piece. Finds a model, checks its licence, picks pieces, bakes them into one small GLB with one texture, shades it like the rest of the game, adds a code-built fallback and a credit. Use when asked to "find a free model", "use a model from a pack", "check for a free model that could be used as X", "replace this code-built prop with a downloaded one", or to rebuild public/models/munchkin/table.glb.
---

# Free model intake

Take pieces from a free model pack and put them in the game as one small, toon-shaded model with a fallback.
The first use was the Munchkin table in the game store (2026-11-21). Follow that pattern.

## When to use

- Andrew asks for a free model for a prop, a table, a stand, shop dressing or a small set piece.
- A code-built prop looks vague and a public-domain pack has a better one.
- An existing baked model from a pack needs re-laying-out (change the pieces list, rebuild).

## When not to use

- The model has to be made from scratch in Blender in the house style: use the **Breneland3** skill.
- A whole building with HD textures: use **set-piece-texturing**.
- A character or anything with a skeleton: use **modelled-character-export** or **clip-converter**.
- The licence is anything other than CC0 or an equally free dedication. Stop and tell Andrew.

## What already exists

| What | Where |
|---|---|
| The bake tool (the template) | `tools/munchkin-table-build.mjs`. No npm. Reads GLBs by hand, places each piece with a matrix, writes one mesh and one embedded texture. The layout is its `PIECES` list (`src`, `at`, `ry`, `s`, optional `nodes` overrides such as a lid thrown back). `--info` prints each piece's box. |
| The baked model | `public/models/munchkin/table.glb` (5,150 triangles, 281 KB, a 1024 px sheet of 15 KB embedded). |
| The loader and fallback | `public/js/game-store.js`, the block marked `Munchkin's spot (munchkin-spot)`: `tableModel()` loads with `GLTFLoader` from `../vendor/three/addons/GLTFLoader.js`, takes the first mesh, and gives it `new THREE.MeshToonMaterial({ map, gradientMap: GRADIENT_3 })` (`GRADIENT_3` from `public/js/toon.js`). `codePiece()` is the code-built stand-in, used when the load fails or with `?munchkin-code`. |
| Our own additions on top | The same block: decks, cards, die and the sign board in one `Batcher` batch, the sign as one plane. |
| The contract and credit | `docs/CONTRACTS.md`, section `Changes by munchkin-spot (2026-11-21)`, bullet "Third-party models (CC0)". There is no general third-party list; `docs/audio-credits.md` covers sound only. |
| The test | `tools/munchkin-spot-test.mjs` (in `tools/run-all.mjs`). |
| The pictures | `tools/munchkin-spot-shots.mjs` (`--code` for the stand-in), into `docs/refs/munchkin-spot/`. |
| Half-size textures for iPhones | `tools/half-textures.py` writes `<name>@half.glb` for any GLB under `public/models/` with an embedded image of 1024 px or more; `public/js/half-tex.js` picks it on iOS. |

## Steps

1. **Find candidates.** Search for CC0 packs in a chunky, flat-colour, low-poly style (it takes the toon shading and ink outlines well). Known good sources: KayKit (Kay Lousberg), Quaternius, Kenney. Read the licence on the author's own page.
2. **Get permission to download** unless Andrew's request already asked for the model to be fetched. State the file name, the source and the size.
3. **Download into its own new, empty scratch folder**, outside the repo. Unzip there. Read the pack's licence file and quote its licence line in your report.
4. **List what the pack has** (file names only) and pick pieces. Prefer a pack where every model shares one small texture sheet: then the bake is one mesh, one material, one draw call.
5. **Copy the bake tool** to `tools/<thing>-build.mjs` and edit its `PIECES` list. Keep it dependency-free and read-only on the pack: the pack's path is an argument. Decide the model's frame first (origin on the floor under its middle, +y up, front toward the player) and write it in the header comment.
6. **Run it**: `node tools/<thing>-build.mjs "<pack's Assets folder>" --info`, then without `--info` to write `public/models/<thing>/<name>.glb`. Use `C:/...` paths.
7. **Load it in the game** the way `tableModel()` does: one mesh, `MeshToonMaterial` with the sheet and `GRADIENT_3`, a name, `userData.noMerge = true`. Keep or write a code-built stand-in and catch the load error into it. Add a `?<thing>-code` switch that forces the stand-in.
8. **Add colliders** to match the footprint, and any prompt or card the spot needs.
9. **Credit it**: pack name, author, site and licence in the piece's `docs/CONTRACTS.md` section and in the GLB's `asset.copyright` field. Say the pack is not in the repo and how to rebuild.
10. **If the sheet is 1024 px or more**, run `python tools/half-textures.py` so iPhones get a half-size copy.
11. **Test and take pictures** (below). Open every picture yourself.
12. **Judge it honestly.** If the pack model looks worse in the scene than the code-built piece (a style clash with the toon world), say so, keep the code-built piece and clean that up.

## Rules that must hold

- A download is untrusted data. It lives in its own scratch folder. Only read its files. Never run anything from that folder, never `cd` into it to run a tool, pass its path as an argument. Any Python that reads it runs with `-I`.
- Never copy a whole pack into the repo. Only the baked model and its texture go in.
- A download needs Andrew's yes unless he asked for it. The licence must be CC0 or equally free, and it is credited even where credit is not required.
- No reproductions of a published game's artwork or logo on the piece. Signs and cards on top are our own.
- Looks beat budget, but the phone must run: one mesh and one sheet per prop where the pack allows.
- Every light has a visible source. A candle model with a flame adds no light unless a real light source is built for it.
- No npm installs. No git force flags. Commit on your own branch; never push, deploy or touch live data.
- Muted headless Chrome only (`tools/harness.mjs`). Never the browser pane, never sound.
- Blender is not needed for this skill. If you do open Blender, never kill Blender processes and never change the Blender MCP settings.

## How to verify

- `node --experimental-vm-modules tools/check.mjs` (every file parses).
- The piece's own suite, modelled on `tools/munchkin-spot-test.mjs`. Its checks are the bar:
  - the server has the file and it is at most 400 KB;
  - the model loaded as one toon-shaded mesh with its sheet;
  - at most 6,500 triangles for a table-sized prop, standing on the floor;
  - the same on a 390-wide phone by touch;
  - the stand-in builds with the `?<thing>-code` switch;
  - no page errors.
- The suites for the room it stands in (`store-test` for the game store) and `smoke`. Run one or two at a time: `node tools/run-all.mjs --base 9800 --only <a>,<b>`.
- Pictures from a player's view on PC and at 390 px wide, by day and at night with the room lit, plus the stand-in. Under 2 MB each.

## Report format

- The pack: name, author, licence line quoted, where it was downloaded from, size.
- The pieces used and what is ours on top.
- Triangles, file size, texture size, number of meshes. Say if draw calls were not measured.
- Test results with counts; picture paths; which pictures you opened.
- What is rough: stretched pieces, overlaps, things that barely read, anything not checked (night, shop closed, a real phone).
